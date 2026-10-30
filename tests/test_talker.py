import tempfile
import threading
import time
import unittest
from pathlib import Path

from assistant import talker
from assistant.capabilities import CapabilityStore
from assistant.config import default_config
from assistant.memory import Memory
from assistant.router import Router, _imperative
from assistant.safety import looks_like_action
from assistant.skills import build_registry
from assistant.timers import TimerService


class TalkerLLM:
    """Fake fast model that speaks the ROUTE/TASK/SAY protocol."""

    def __init__(self, reply, ack="[excited] Ooh, on it!", report=""):
        self.reply = reply
        self.ack = ack
        self.report_text = report
        self.talk_calls = []
        self.ack_calls = []
        self.plans = []

    def answer(self, question, facts="", history=None):
        return "plain answer"

    def stream_talk(self, question, facts="", history=None):
        self.talk_calls.append((question, facts))
        for i in range(0, len(self.reply), 7):
            yield self.reply[i:i + 7]

    def talk(self, question, facts="", history=None):
        self.talk_calls.append((question, facts))
        return self.reply

    def acknowledge(self, request, facts=""):
        self.ack_calls.append(request)
        return self.ack

    def report(self, request, output):
        return self.report_text

    def classify(self, text):
        return "action" if looks_like_action(text) else "question"

    def plan(self, task):
        self.plans.append(task)
        return task


class Agent:
    def __init__(self, output="Port 8080 is free now.", ready=True, events=None):
        self.output = output
        self.ready = ready
        self.tasks = []
        self.events = events

    def available(self):
        return self.ready

    def run(self, task):
        self.tasks.append(task)
        return self.output


class StreamingAgent(Agent):
    def stream(self, task):
        self.tasks.append(task)
        for text in self.events:
            yield {"part": {"type": "text", "text": text}}


def make_router(tmp, llm, agent=None, confirmer=lambda _p: True, runner=None):
    cfg = default_config(Path(tmp))
    cfg.agent.ask_before_learning = False
    cfg.agent.promote_skills = False
    registry = build_registry(cfg)
    capabilities = CapabilityStore()
    capabilities.sync_from_skills(registry.skills)
    return Router(
        cfg=cfg,
        registry=registry,
        llm=llm,
        memory=Memory(cfg.facts_path),
        confirmer=confirmer,
        agent=agent,
        timers=TimerService(),
        runner=runner or (lambda c, t=30: (0, "", "")),
        capabilities=capabilities,
    )


class RoutedStreamTests(unittest.TestCase):
    def test_interns_route_parsed_from_chunks(self):
        stream = talker.RoutedStream()
        spoken = "".join(stream.feed(c) for c in
                         ["RO", "UTE: INTE", "RNS\nTASK: kill port", " 8080\nSA", "Y: On it!", " Yes."])
        result = stream.close()
        self.assertEqual(result.route, talker.INTERNS)
        self.assertEqual(result.task, "kill port 8080")
        self.assertEqual(spoken, "On it! Yes.")
        self.assertEqual(result.say, "On it! Yes.")

    def test_header_never_leaks_into_speech(self):
        stream = talker.RoutedStream()
        out = [stream.feed(c) for c in ["ROUTE:", " CHAT\n", "SAY: Hi", " there!"]]
        self.assertEqual(out[:2], ["", ""])
        self.assertEqual("".join(out), "Hi there!")

    def test_plain_prose_degrades_to_chat(self):
        result = talker.parse("Right away! Canberra.")
        self.assertEqual(result.route, talker.CHAT)
        self.assertEqual(result.say, "Right away! Canberra.")

    def test_missing_say_keeps_route(self):
        result = talker.parse("ROUTE: INTERNS\nTASK: check temps")
        self.assertEqual(result.route, talker.INTERNS)
        self.assertEqual(result.task, "check temps")
        self.assertEqual(result.say, "")


class MessageTests(unittest.TestCase):
    def test_few_shots_sit_right_before_live_message(self):
        history = [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "Hello!"}]
        messages = talker.build_messages("SYSTEM", "close firefox", history)
        self.assertEqual(messages[0]["role"], "system")
        self.assertIn("ROUTE: INTERNS", messages[0]["content"])
        self.assertIn("Person: hi", messages[0]["content"])
        self.assertEqual(messages[-1], {"role": "user", "content": "close firefox"})
        self.assertTrue(messages[-2]["content"].startswith("ROUTE:"))
        self.assertEqual(len(messages), 2 + 2 * len(talker.FEW_SHOTS))
        self.assertTrue(any("ROUTE: INTERNS" in m["content"] for m in messages[1:-1]))
        self.assertTrue(any("ROUTE: CHAT" in m["content"] for m in messages[1:-1]))

    def test_ack_prompt_is_state_forced(self):
        messages = talker.acknowledge_messages("SYS", "check my cpu")
        self.assertIn("ALREADY accepted", messages[-1]["content"])
        self.assertIn("check my cpu", messages[-1]["content"])


class PoliteCommandTests(unittest.TestCase):
    def test_polite_os_requests_are_actions(self):
        for text in ["can you close firefox?", "could you please check my disk space?",
                     "hey qweeps, can you kill port 8080?"]:
            self.assertTrue(looks_like_action(text), text)

    def test_polite_chat_stays_a_question(self):
        for text in ["can you write a poem?", "can you tell me a joke?", "what is linux?"]:
            self.assertFalse(looks_like_action(text), text)

    def test_imperative(self):
        self.assertEqual(_imperative("Could you please close this window?"), "close this window")
        self.assertEqual(_imperative("what time is it?"), "what time is it?")


class TalkerRoutingTests(unittest.TestCase):
    def test_talker_hands_missed_action_to_interns(self):
        with tempfile.TemporaryDirectory() as tmp:
            llm = TalkerLLM("ROUTE: INTERNS\nTASK: Report GPU temperature.\nSAY: Checking that GPU right now!")
            agent = Agent(output="GPU is at 54C.")
            router = make_router(tmp, llm, agent=agent)
            spoken = []
            response = router.route("how toasty is my graphics card", on_sentence=spoken.append,
                                    on_progress=spoken.append)
            self.assertEqual(response.source, "agent")
            self.assertEqual(agent.tasks, ["Report GPU temperature."])
            self.assertEqual(llm.plans, [], "Talker's TASK replaces the planning call")
            self.assertEqual(spoken[0], "Checking that GPU right now!")
            self.assertEqual(response.text, "GPU is at 54C.")
            self.assertFalse(response.data.get("streamed"))

    def test_talker_capability_context_mentions_interns(self):
        with tempfile.TemporaryDirectory() as tmp:
            llm = TalkerLLM("ROUTE: CHAT\nSAY: Canberra!")
            router = make_router(tmp, llm, agent=Agent())
            router.route("what's the capital of Australia")
            facts = llm.talk_calls[0][1]
            self.assertIn("your Interns do", facts)
            self.assertIn("on shift and ready", facts)
            self.assertNotIn("cannot do", facts)

    def test_chat_route_streams_say_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            llm = TalkerLLM("ROUTE: CHAT\nSAY: It's Canberra! Ha-ha.")
            router = make_router(tmp, llm)
            tokens, sentences = [], []
            response = router.route("capital of Australia", on_token=tokens.append,
                                    on_sentence=sentences.append)
            self.assertEqual(response.source, "llm")
            self.assertEqual(response.text, "It's Canberra! Ha-ha.")
            self.assertTrue(response.data.get("streamed"))
            self.assertNotIn("ROUTE", "".join(tokens))
            self.assertEqual(sentences, ["It's Canberra!"])

    def test_non_streaming_path_routes_too(self):
        with tempfile.TemporaryDirectory() as tmp:
            llm = TalkerLLM("ROUTE: INTERNS\nTASK: Free disk space report.\nSAY: On it!")
            agent = Agent(output="120 GB free.")
            router = make_router(tmp, llm, agent=agent)
            response = router.route("am I running out of room on this thing")
            self.assertEqual(response.text, "120 GB free.")
            self.assertEqual(agent.tasks, ["Free disk space report."])

    def test_interns_route_without_agent_is_honest(self):
        with tempfile.TemporaryDirectory() as tmp:
            llm = TalkerLLM("ROUTE: INTERNS\nTASK: x\nSAY: Doing it right now!")
            router = make_router(tmp, llm, agent=Agent(ready=False))
            spoken = []
            response = router.route("how toasty is my graphics card", on_sentence=spoken.append)
            self.assertEqual(spoken, [], "never claim it's being done when no Intern exists")
            self.assertIn("window", response.text)

    def test_ack_is_held_until_confirmation(self):
        with tempfile.TemporaryDirectory() as tmp:
            llm = TalkerLLM("ROUTE: INTERNS\nTASK: sudo pacman -Syu\nSAY: Upgrading everything now!")
            agent = Agent()
            router = make_router(tmp, llm, agent=agent, confirmer=lambda _p: False)
            spoken = []
            response = router.route("bring the whole system up to date", on_sentence=spoken.append,
                                    on_progress=spoken.append)
            self.assertEqual(spoken, [])
            self.assertFalse(response.confirmed)
            self.assertEqual(agent.tasks, [])


class ParallelAckTests(unittest.TestCase):
    def test_locally_routed_action_gets_state_forced_ack_first(self):
        with tempfile.TemporaryDirectory() as tmp:
            llm = TalkerLLM("unused", ack="You got it, closing it up!")
            agent = StreamingAgent(events=["Closed Firefox."])
            router = make_router(tmp, llm, agent=agent)
            spoken = []
            router.route("kill firefox", on_progress=spoken.append)
            self.assertEqual(llm.ack_calls, ["kill firefox"])
            self.assertEqual(spoken, ["You got it, closing it up!", "Closed Firefox."])

    def test_ack_runs_in_parallel_with_the_interns(self):
        with tempfile.TemporaryDirectory() as tmp:
            started = threading.Event()

            class SlowAckLLM(TalkerLLM):
                def acknowledge(self, request, facts=""):
                    started.wait(timeout=2)  # only returns once the agent has begun
                    return "On it!"

            class FlagAgent(Agent):
                def run(self, task):
                    started.set()
                    return super().run(task)

            router = make_router(tmp, SlowAckLLM("unused"), agent=FlagAgent(output="done"))
            spoken = []
            t0 = time.time()
            response = router.route("kill firefox", on_progress=spoken.append)
            self.assertLess(time.time() - t0, 1.5)
            self.assertEqual(spoken, ["On it!"])
            self.assertEqual(response.text, "done")

    def test_long_output_is_reported_in_voice(self):
        with tempfile.TemporaryDirectory() as tmp:
            raw = "## Results\n" + " ".join(["word"] * 80)
            llm = TalkerLLM("unused", report="[excited] All done - eighty words, ha-ha!")
            router = make_router(tmp, llm, agent=Agent(output=raw))
            response = router.route("kill firefox")
            self.assertEqual(response.text, "[excited] All done - eighty words, ha-ha!")
            self.assertEqual(response.data["raw"], raw)

    def test_short_output_is_spoken_verbatim(self):
        with tempfile.TemporaryDirectory() as tmp:
            llm = TalkerLLM("unused", report="SHOULD NOT BE USED")
            router = make_router(tmp, llm, agent=Agent(output="Closed it."))
            self.assertEqual(router.route("kill firefox").text, "Closed it.")


if __name__ == "__main__":
    unittest.main()
