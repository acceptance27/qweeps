import tempfile
import unittest
from pathlib import Path

from assistant.config import default_config
from assistant.memory import Memory
from assistant.skills import build_registry
from assistant.skills.base import SkillContext
from assistant.skills.builtin import (
    HelpSkill,
    OpenAppSkill,
    OpenRouteSkill,
    RememberSkill,
    ReminderSkill,
    StopwatchSkill,
    TimeSkill,
    TimerSkill,
    WindowQuerySkill,
)
from assistant.timers import TimerService
from types import SimpleNamespace

import assistant.workspace as workspace


class FakeNotifier:
    def __init__(self):
        self.sent = []

    def send(self, title, body=""):
        self.sent.append((title, body))
        return True


class Runner:
    def __init__(self):
        self.calls = []

    def __call__(self, command, timeout=30):
        self.calls.append(list(command))
        return 0, "", ""


class SkillTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cfg = default_config(Path(self.tmp.name))
        self.runner = Runner()
        self.timers = TimerService(notifier=FakeNotifier())
        self.memory = Memory(self.cfg.facts_path)
        self.ctx = SkillContext(
            cfg=self.cfg,
            memory=self.memory,
            notifier=FakeNotifier(),
            runner=self.runner,
            timers=self.timers,
            dry_run=True,
        )

    def tearDown(self):
        self.tmp.cleanup()

    def test_time(self):
        skill = TimeSkill()
        args = skill.match("what time is it")
        self.assertIsNotNone(args)
        result = skill.run(args, self.ctx)
        self.assertIn("It's", result.text)

    def test_timer(self):
        skill = TimerSkill()
        args = skill.match("set a timer for 1 minute")
        self.assertEqual(args["seconds"], 60)
        result = skill.run(args, self.ctx)
        self.assertIn("1 minute", result.text)

    def test_stopwatch(self):
        skill = StopwatchSkill()
        args = skill.match("start a stopwatch")
        self.assertEqual(args["action"], "start")
        skill.run(args, self.ctx)
        stop = skill.match("stop the stopwatch")
        result = skill.run(stop, self.ctx)
        self.assertIn("Stopped at", result.text)

    def test_reminder_parsing(self):
        skill = ReminderSkill(self.cfg)
        args = skill.match("remind me to call mom in 10 minutes")
        self.assertEqual(args["seconds"], 600)
        self.assertIn("call mom", args["message"])
        result = skill.run(args, self.ctx)
        self.assertIn("call mom", result.text)

    def test_open_app(self):
        skill = OpenAppSkill(self.cfg)
        args = skill.match("open firefox")
        self.assertEqual(args["app"], "firefox")
        result = skill.run(args, self.ctx)
        self.assertIn("firefox", result.text)
        self.assertTrue(result.command)

    def test_open_route(self):
        skill = OpenRouteSkill(self.cfg)
        args = skill.match("open teams is434 architecture")
        self.assertIsNotNone(args)
        result = skill.run(args, self.ctx)
        self.assertEqual(result.command[0], "xdg-open")

    def test_remember(self):
        skill = RememberSkill()
        args = skill.match("remember that I like tea")
        result = skill.run(args, self.ctx)
        self.assertIn("tea", result.text)
        self.assertIn("I like tea", self.memory.facts)

    def test_help_lists_skills(self):
        registry = build_registry(self.cfg)
        help_skill = next(s for s in registry.skills if isinstance(s, HelpSkill))
        result = help_skill.run({}, self.ctx)
        self.assertIn("timer", result.text)

    def test_type_text_submits_with_enter(self):
        from assistant.desktop import execute

        command, _ = execute("type_text", {"text": "hello world"})
        joined = " ".join(command)
        self.assertIn("hello world", joined)
        self.assertIn("Return", joined)

    def test_status_interns(self):
        from assistant.skills.builtin import StatusSkill
        from assistant.interns import InternRegistry

        skill = StatusSkill(self.cfg)
        match_status = skill.match("is qweeps interns running in antigravity?")
        self.assertIsNotNone(match_status)
        self.assertEqual(match_status["topic"], "interns")
        res = skill.run(match_status, self.ctx)
        self.assertIn("The Interns are idle", res.text)

        registry = InternRegistry(self.cfg.interns_path)
        tid = registry.start("generate a manim animation about the nitrogen")
        res_running = skill.run(match_status, self.ctx)
        self.assertIn("running (1 active task)", res_running.text)

        match_logs = skill.match("could you look at the intern logs?")
        self.assertIsNotNone(match_logs)
        self.assertEqual(match_logs["topic"], "intern_logs")
        res_logs = skill.run(match_logs, self.ctx)
        self.assertIn("Recent Intern activity", res_logs.text)
        self.assertIn("generate a manim animation", res_logs.text)
        registry.finish(tid, "done")


class WindowQueryTests(unittest.TestCase):
    def setUp(self):
        self.cfg = default_config(Path("/tmp/ws-skill-test"))
        self.ctx = SimpleNamespace(cfg=self.cfg, dry_run=False, run_command=lambda c: (0, "", ""))
        self.skill = WindowQuerySkill()

    def _patch(self, windows, agents):
        original = (workspace.visible_windows, workspace.agent_windows)
        workspace.visible_windows = lambda: windows
        workspace.agent_windows = lambda _cfg: agents
        self.addCleanup(lambda: setattr(workspace, "visible_windows", original[0]))
        self.addCleanup(lambda: setattr(workspace, "agent_windows", original[1]))

    def test_match_opencode_is_not_open_app(self):
        registry = build_registry(self.cfg)
        matched = registry.match("Can you see open code?")
        self.assertIsNotNone(matched)
        self.assertEqual(matched[0].name, "windows")

    def test_reports_open_agent(self):
        self._patch([], [{"kind": "opencode", "title": "x", "workspace": 2, "on_active": True}])
        result = self.skill.run(self.skill.match("Can you see OpenCode"), self.ctx)
        self.assertIn("OpenCode", result.text)
        self.assertIn("yes", result.text.lower())

    def test_reports_missing_agent(self):
        self._patch([], [])
        result = self.skill.run(self.skill.match("Can you see OpenCode"), self.ctx)
        self.assertIn("don't see", result.text)

    def test_question_about_unrelated_thing_is_not_captured(self):
        self.assertIsNone(self.skill.match("can you see my notes?"))


if __name__ == "__main__":
    unittest.main()
