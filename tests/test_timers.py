import json
import tempfile
import time
import unittest
from pathlib import Path

from assistant.timers import TimerService


class FakeNotifier:
    def __init__(self):
        self.sent = []

    def send(self, title, body=""):
        self.sent.append((title, body))
        return True


class TimerTests(unittest.TestCase):
    def test_persist_and_reload(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "t.json"
            service = TimerService(notifier=FakeNotifier(), path=path)
            tid = service.start_timer("check oven", 999, kind="reminder")
            data = json.loads(path.read_text())
            self.assertEqual(data[0]["id"], tid)
            reloaded = TimerService(notifier=FakeNotifier(), path=path)
            self.assertEqual(len(reloaded.active()), 1)
            for t in reloaded.active():
                self.assertEqual(t["kind"], "reminder")

    def test_adopt_external(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "t.json"
            service = TimerService(path=path)
            path.write_text(json.dumps([
                {"id": "abc", "label": "x", "kind": "timer", "fire_at": time.time() + 999}
            ]))
            self.assertEqual(service.adopt_external(), 1)
            self.assertEqual(service.adopt_external(), 0)

    def test_fire_notifies_and_clears_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "t.json"
            notifier = FakeNotifier()
            service = TimerService(notifier=notifier, path=path)
            tid = service.start_timer("stretch", 999, kind="reminder")
            service._fire(tid)
            self.assertEqual(service.active(), [])
            self.assertEqual(json.loads(path.read_text()), [])
            self.assertTrue(notifier.sent)
            self.assertIn("stretch", notifier.sent[0][1])

    def test_cancel_removes_from_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "t.json"
            service = TimerService(path=path)
            service.start_timer("do not fire", 999)
            self.assertEqual(service.cancel(), 1)
            self.assertEqual(json.loads(path.read_text()), [])

    def test_none_path_never_writes(self):
        service = TimerService()
        service.start_timer("ephemeral", 999)
        self.assertEqual(len(service.active()), 1)


if __name__ == "__main__":
    unittest.main()
