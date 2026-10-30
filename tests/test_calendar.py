import unittest
from pathlib import Path
from types import SimpleNamespace

import assistant.gcal as gcal_mod
from assistant.config import default_config
from assistant.skills.builtin import CalendarSkill


class FakeCal:
    def __init__(self, events=None):
        self.events = events if events is not None else [
            {"summary": "Standup", "start": "2026-01-01T09:00:00-08:00", "end": "", "location": ""}
        ]
        self.created = []

    def list_events(self, start, end, max_results=10):
        return self.events

    def create_event(self, summary, start, end, location="", description=""):
        self.created.append((summary, start, end))
        return {"summary": summary}


class StubLLM:
    def answer(self, prompt, facts="", history=None):
        return '{"summary": "Lunch", "start": "2026-01-01T12:00:00", "end": "2026-01-01T13:00:00"}'


class CalendarTests(unittest.TestCase):
    def setUp(self):
        self.cfg = default_config(Path("/tmp/cal-test"))
        self.skill = CalendarSkill()

    def _ctx(self, llm=None):
        return SimpleNamespace(cfg=self.cfg, dry_run=False, run_command=lambda c: (0, "", ""), llm=llm)

    def test_match(self):
        self.assertIsNotNone(self.skill.match("what's on my calendar"))
        self.assertTrue(self.skill.match("add lunch tomorrow at noon")["add"])
        self.assertIsNone(self.skill.match("what time is it"))

    def test_not_connected(self):
        original = gcal_mod.build_calendar
        gcal_mod.build_calendar = lambda cfg: None
        self.addCleanup(lambda: setattr(gcal_mod, "build_calendar", original))
        result = self.skill.run({"raw": "what's on my calendar", "add": False}, self._ctx())
        self.assertIn("isn't connected", result.text)

    def test_read_events(self):
        original = gcal_mod.build_calendar
        gcal_mod.build_calendar = lambda cfg: FakeCal()
        self.addCleanup(lambda: setattr(gcal_mod, "build_calendar", original))
        result = self.skill.run({"raw": "what's on my calendar today", "add": False}, self._ctx())
        self.assertIn("Standup", result.text)

    def test_add_event(self):
        fake = FakeCal()
        original = gcal_mod.build_calendar
        gcal_mod.build_calendar = lambda cfg: fake
        self.addCleanup(lambda: setattr(gcal_mod, "build_calendar", original))
        result = self.skill.run(
            {"raw": "add lunch tomorrow at noon", "add": True}, self._ctx(llm=StubLLM())
        )
        self.assertIn("Added", result.text)
        self.assertEqual(fake.created[0][0], "Lunch")


if __name__ == "__main__":
    unittest.main()
