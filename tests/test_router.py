import tempfile
import unittest
from pathlib import Path

from assistant.config import default_config
from assistant.conversation import Conversation
from assistant.llm import OfflineLLM
from assistant.memory import Memory
from assistant.router import Router
from assistant.skills import build_registry
from assistant.timers import TimerService


class FakeAgent:
    def __init__(self, output="agent finished the job"):
        self.output = output
        self.tasks = []

    def available(self):
        return True

    def run(self, task):
        self.tasks.append(task)
        return self.output


class FakeStreamAgent:
    def __init__(self, events):
        self.events = events

    def available(self):
        return True

    def run(self, task):
        return ""

    def stream(self, task):
        for event in self.events:
            yield event


class Runner:
    def __init__(self, code=0):
        self.code = code
        self.calls = []

    def __call__(self, command, timeout=30):
        self.calls.append(list(command))
        return self.code, "", ""


class RecordingLLM:
    def __init__(self):
        self.histories = []

    def answer(self, question, facts="", history=None):
        self.histories.append(history)
        return "answer-canned"

    def classify(self, text):
        return "question"

    def plan(self, task):
        return task


def make_router(tmp, confirmer=lambda _p: True, agent=None, runner=None):
    cfg = default_config(Path(tmp))
    memory = Memory(cfg.facts_path)
    return Router(
        cfg=cfg,
        registry=build_registry(cfg),
        llm=OfflineLLM(),
        memory=memory,
        confirmer=confirmer,
        agent=agent,
        timers=TimerService(),
        runner=runner or Runner(),
    )


class RouterTests(unittest.TestCase):
    def test_skill_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            router = make_router(tmp)
            response = router.route("what time is it")
            self.assertEqual(response.source, "skill")
            self.assertIn("It's", response.text)

    def test_question_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            router = make_router(tmp)
            response = router.route("tell me about the history of Rome")
            self.assertEqual(response.source, "llm")
            self.assertTrue(response.text)

    def test_action_escalates_to_agent(self):
        with tempfile.TemporaryDirectory() as tmp:
            agent = FakeAgent()
            router = make_router(tmp, agent=agent)
            response = router.route("install nginx")
            self.assertEqual(response.source, "agent")
            self.assertEqual(response.text, "agent finished the job")
            self.assertEqual(len(agent.tasks), 1)

    def test_action_denied(self):
        with tempfile.TemporaryDirectory() as tmp:
            agent = FakeAgent()
            router = make_router(tmp, confirmer=lambda _p: False, agent=agent)
            response = router.route("install nginx")
            self.assertEqual(response.source, "agent")
            self.assertFalse(response.confirmed)
            self.assertEqual(agent.tasks, [])

    def test_learning_gate_message(self):
        with tempfile.TemporaryDirectory() as tmp:
            prompts = []

            def confirmer(prompt):
                prompts.append(prompt)
                return True

            agent = FakeAgent()
            router = make_router(tmp, confirmer=confirmer, agent=agent)
            router.route("install nginx")
            self.assertTrue(any("learn" in p.lower() for p in prompts))

    def test_agent_progress_is_streamed(self):
        with tempfile.TemporaryDirectory() as tmp:
            events = [
                {"type": "tool_use", "part": {"type": "tool", "tool": "bash"}},
                {"type": "text", "part": {"type": "text",
                    "text": "Pandoc didn't work out, so I switched to a notepad."}},
                {"type": "text", "part": {"type": "text",
                    "text": "The input itself was the problem."}},
            ]
            router = make_router(tmp, agent=FakeStreamAgent(events))
            updates = []
            response = router.route("install nginx", on_progress=updates.append)
            self.assertIn("Pandoc didn't work out", updates[0])
            self.assertTrue(response.data.get("spoken_progress"))
            self.assertEqual(
                response.text,
                "Pandoc didn't work out, so I switched to a notepad. The input itself was the problem.",
            )

    def test_remember_does_not_hijack_add_a_note(self):
        with tempfile.TemporaryDirectory() as tmp:
            router = make_router(tmp, agent=FakeAgent())
            router.route("Can you add a note to my calendar for September 10?", dry_run=True)
            self.assertNotIn(
                "to my calendar",
                " ".join(router.memory.facts),
            )

    def test_remember_fact_via_router(self):
        with tempfile.TemporaryDirectory() as tmp:
            router = make_router(tmp)
            router.route("remember that my dog is named Rex")
            self.assertIn("my dog is named Rex", router.memory.facts)

    def test_reminder_skill_uses_runner(self):
        with tempfile.TemporaryDirectory() as tmp:
            runner = Runner()
            router = make_router(tmp, runner=runner)
            response = router.route("remind me to stretch in 5 minutes")
            self.assertEqual(response.source, "skill")
            self.assertIn("stretch", response.text)

    def test_router_keeps_conversation_history(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = default_config(Path(tmp))
            llm = RecordingLLM()
            conv = Conversation(cfg.sessions_dir / "t.json")
            router = Router(
                cfg=cfg,
                registry=build_registry(cfg),
                llm=llm,
                memory=Memory(cfg.facts_path),
                confirmer=lambda _p: True,
                timers=TimerService(),
                conversation=conv,
            )
            router.route("first question")
            router.route("second question")
            self.assertEqual(llm.histories[0], [])
            self.assertEqual(llm.histories[1][0]["content"], "first question")
            self.assertEqual(conv.turns[-1].content, "answer-canned")

    def test_agent_prompt_requests_recipe(self):
        with tempfile.TemporaryDirectory() as tmp:
            agent = FakeAgent()
            router = make_router(tmp, agent=agent)
            router.route("install nginx")
            self.assertIn("SKILL_RECIPE", agent.tasks[0])

    def test_promotion_declined_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            recipe = (
                "done\nSKILL_RECIPE: "
                '{"name":"x","patterns":["do x"],"command":["echo","x"],"risk":"low"}'
            )
            agent = FakeAgent(output=recipe)
            answers = iter([True, False])
            router = make_router(tmp, confirmer=lambda _p: next(answers), agent=agent)
            router.cfg.agent.auto_promote_skills = False
            response = router.route("install nginx")
            self.assertIsNone(response.promoted)
            self.assertFalse(list((Path(tmp) / "skills").glob("*.json")))

    def test_auto_promotion_saves_without_asking(self):
        with tempfile.TemporaryDirectory() as tmp:
            recipe = (
                "done\nSKILL_RECIPE: "
                '{"name":"auto","patterns":["do auto"],"command":["echo","auto"],"risk":"low"}'
            )
            agent = FakeAgent(output=recipe)
            router = make_router(tmp, confirmer=lambda _p: True, agent=agent)
            self.assertTrue(router.cfg.agent.auto_promote_skills)
            response = router.route("install nginx")
            self.assertEqual(response.promoted, "auto")
            self.assertTrue(list((Path(tmp) / "skills").glob("*.json")))

    def test_promotes_recipe_from_agent(self):
        with tempfile.TemporaryDirectory() as tmp:
            recipe = (
                "did the task\nSKILL_RECIPE: "
                '{"name":"open-teams","patterns":["open teams work"],'
                '"command":["xdg-open","https://teams.microsoft.com"],"risk":"low"}'
            )
            agent = FakeAgent(output=recipe)
            router = make_router(tmp, agent=agent)
            response = router.route("install nginx")
            self.assertEqual(response.promoted, "open-teams")
            self.assertNotIn("SKILL_RECIPE", response.text)


class HandoffTests(unittest.TestCase):
    def test_strip_handoff_removes_wrapper(self):
        from assistant.router import _strip_handoff

        self.assertEqual(_strip_handoff("ask the agent to fix the parser bug"), "fix the parser bug")
        self.assertEqual(_strip_handoff("ask opencode to fix it"), "fix it")
        self.assertEqual(_strip_handoff("have your interns open the browser"), "open the browser")
        self.assertEqual(
            _strip_handoff("ask the agent in the current workspace to do it"), "do it"
        )

    def test_handoff_routes_to_agent_even_with_desktop_words(self):
        with tempfile.TemporaryDirectory() as tmp:
            agent = FakeAgent()
            router = make_router(tmp, agent=agent)
            response = router.route("ask the agent to open youtube and search cats")
            self.assertEqual(response.source, "agent")
            self.assertTrue(agent.tasks)

    def test_plain_desktop_request_stays_a_skill(self):
        with tempfile.TemporaryDirectory() as tmp:
            agent = FakeAgent()
            router = make_router(tmp, agent=agent)
            response = router.route("open youtube")
            self.assertNotEqual(response.source, "agent")
            self.assertFalse(agent.tasks)

    def test_telling_about_agents_is_not_a_handoff(self):
        from assistant.router import _HANDOFF

        self.assertFalse(_HANDOFF.search("can you tell me about agents?"))

    def test_unplanned_desktop_request_escalates_to_agent(self):
        with tempfile.TemporaryDirectory() as tmp:
            agent = FakeAgent()
            router = make_router(tmp, agent=agent)
            # Desktop-gated, but no fast tool and the offline LLM can't plan it.
            response = router.route("wiggle the window around a bit")
            self.assertEqual(response.source, "agent")
            self.assertTrue(agent.tasks)


if __name__ == "__main__":
    unittest.main()
