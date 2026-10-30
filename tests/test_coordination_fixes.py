import os
import signal
import tempfile
import unittest
from pathlib import Path

from assistant import audio
from assistant.config import default_config
from assistant.llm import OfflineLLM
from assistant.memory import Memory
from assistant.orchestrator import Orchestrator, SpeechQueue
from assistant.router import Router, _FOLLOWUP_PRONOUNS
from assistant.skills import build_registry
from assistant.skills.promoted import is_promotable_recipe, save_recipe
from assistant.timers import TimerService


class FakeAgent:
    def __init__(self, output="PID 4321 is using 99% CPU"):
        self.output = output
        self.tasks = []

    def available(self):
        return True

    def run(self, task):
        self.tasks.append(task)
        return self.output


class FakePlannerLLM(OfflineLLM):
    def __init__(self):
        self.planned_tasks = []

    def plan(self, task):
        self.planned_tasks.append(task)
        return task

    def report(self, request, output):
        return (
            "Sentence one reporting on the task results accurately. "
            "Sentence two giving the secondary status of what happened. "
            "Sentence three that would make the report way too long. "
            "Sentence four with excessive additional detail that should be stripped."
        )


def make_router(tmp, llm=None, agent=None):
    cfg = default_config(Path(tmp))
    cfg.agent.ask_before_learning = False
    cfg.agent.promote_skills = False
    return Router(
        cfg=cfg,
        registry=build_registry(cfg),
        llm=llm or OfflineLLM(),
        memory=Memory(cfg.facts_path),
        confirmer=lambda _p: True,
        agent=agent or FakeAgent(),
        timers=TimerService(),
        runner=lambda c, t=30: (0, "", ""),
    )


class FollowUpContextTests(unittest.TestCase):
    def test_pronoun_regex(self):
        self.assertTrue(_FOLLOWUP_PRONOUNS.search("kill it"))
        self.assertTrue(_FOLLOWUP_PRONOUNS.search("close that"))
        self.assertTrue(_FOLLOWUP_PRONOUNS.search("terminate them"))
        self.assertTrue(_FOLLOWUP_PRONOUNS.search("kill the first one"))
        self.assertTrue(_FOLLOWUP_PRONOUNS.search("restart the former"))
        self.assertFalse(_FOLLOWUP_PRONOUNS.search("open firefox"))

    def test_ambiguous_followup_prepends_context(self):
        with tempfile.TemporaryDirectory() as tmp:
            agent = FakeAgent(output="Process 4321 (chrome) is hogging RAM")
            planner = FakePlannerLLM()
            router = make_router(tmp, llm=planner, agent=agent)

            # Turn 1: Intern task
            res1 = router.route("find the memory hog")
            self.assertEqual(res1.source, "agent")
            self.assertEqual(agent.tasks, ["find the memory hog"])
            self.assertEqual(router.last_intern_task, "find the memory hog")
            self.assertIn("Process 4321", router.last_intern_result)

            # Turn 2: Ambiguous pronoun follow-up
            res2 = router.route("kill it")
            self.assertEqual(res2.source, "agent")
            # The task sent to the agent has the previous context prepended!
            last_task = agent.tasks[-1]
            self.assertIn("Context from the previous task (find the memory hog):", last_task)
            self.assertIn("Process 4321 (chrome) is hogging RAM", last_task)
            self.assertIn("Follow-up request: kill it", last_task)

    def test_intermediate_non_agent_turn_clears_followup_buffer(self):
        with tempfile.TemporaryDirectory() as tmp:
            agent = FakeAgent(output="Done something")
            router = make_router(tmp, agent=agent)

            # Turn 1: Agent task
            router.route("find the memory hog")
            self.assertIsNotNone(router.last_intern_task)

            # Turn 2: Skill / non-agent turn
            res = router.route("what time is it")
            self.assertEqual(res.source, "skill")
            self.assertIsNone(router.last_intern_task)
            self.assertIsNone(router.last_intern_result)


class ReportOutLatencyTests(unittest.TestCase):
    def test_report_hard_capped_to_2_sentences_and_25_words(self):
        with tempfile.TemporaryDirectory() as tmp:
            planner = FakePlannerLLM()
            router = make_router(tmp, llm=planner)
            raw = "Very long raw intern output " * 20
            report = router._report("what happened", raw)
            sentences = [s.strip() for s in report.split(".") if s.strip()]
            self.assertLessEqual(len(sentences), 2)
            self.assertLessEqual(len(report.split()), 25)

    def test_short_report_spoken_directly(self):
        with tempfile.TemporaryDirectory() as tmp:
            planner = FakePlannerLLM()
            router = make_router(tmp, llm=planner)
            short_out = "Port 8080 was successfully closed."
            # Words <= 25 and no markdown -> skips LLM report call
            report = router._report("close port 8080", short_out)
            self.assertEqual(report, "")


class SkillPromotionSafetyTests(unittest.TestCase):
    def test_rejects_destructive_rm(self):
        recipe = {
            "name": "clean-dir",
            "patterns": ["clean my build"],
            "command": ["rm", "-rf", "/home/user/project/build"],
        }
        valid, reason = is_promotable_recipe(recipe)
        self.assertFalse(valid)
        self.assertTrue("destructive" in reason.lower() or "high-risk" in reason.lower())

    def test_rejects_hardcoded_pid(self):
        recipe = {
            "name": "kill-node",
            "patterns": ["kill node process"],
            "command": ["kill", "-9", "14829"],
        }
        valid, reason = is_promotable_recipe(recipe)
        self.assertFalse(valid)
        self.assertTrue("pid" in reason.lower() or "process id" in reason.lower())

    def test_rejects_temporary_paths(self):
        recipe = {
            "name": "run-script",
            "patterns": ["run helper"],
            "command": ["python3", "/tmp/scratch.py"],
        }
        valid, reason = is_promotable_recipe(recipe)
        self.assertFalse(valid)
        self.assertIn("temporary", reason.lower())

    def test_rejects_destructive_git(self):
        recipe = {
            "name": "reset-repo",
            "patterns": ["hard reset git"],
            "command": ["git", "reset", "--hard", "HEAD"],
        }
        valid, reason = is_promotable_recipe(recipe)
        self.assertFalse(valid)
        self.assertIn("destructive git", reason.lower())

    def test_accepts_safe_command(self):
        recipe = {
            "name": "open-dashboard",
            "patterns": ["open monitoring"],
            "command": ["xdg-open", "https://grafana.example.com"],
        }
        valid, reason = is_promotable_recipe(recipe)
        self.assertTrue(valid)
        self.assertEqual(reason, "ok")

    def test_save_recipe_enforces_safety(self):
        with tempfile.TemporaryDirectory() as tmp:
            skills_dir = Path(tmp)
            bad_recipe = {
                "name": "nuke",
                "patterns": ["nuke files"],
                "command": ["rm", "-rf", "/var/tmp/bad"],
            }
            path = save_recipe(skills_dir, bad_recipe)
            self.assertIsNone(path)


class AudioBargeInTests(unittest.TestCase):
    def test_stop_playback_clears_pidfile(self):
        with tempfile.TemporaryDirectory() as tmp:
            # Point state_dir to temp
            import assistant.log as logmod
            orig = logmod.state_dir
            logmod.state_dir = lambda: Path(tmp)
            try:
                audio.announce_pid(99999999)
                self.assertTrue((Path(tmp) / "tts.pid").exists())
                audio.stop_playback()
                self.assertFalse((Path(tmp) / "tts.pid").exists())
            finally:
                logmod.state_dir = orig

    def test_speech_queue_interrupt(self):
        class DummyTTS:
            def speak(self, text):
                return True

        queue = SpeechQueue(DummyTTS(), None)
        queue.say("first sentence")
        queue.say("second sentence")
        queue.interrupt()
        # After interrupt, queue should be drained
        self.assertTrue(queue._queue.empty())
        queue.close()


if __name__ == "__main__":
    unittest.main()
