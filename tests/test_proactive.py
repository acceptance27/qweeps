import unittest

from assistant.proactive import event_prompt, mood_for


class ProactiveTests(unittest.TestCase):
    def test_known_event(self):
        self.assertIn("Greet", event_prompt("post-boot"))

    def test_hourly_formats_time(self):
        self.assertIn("09:30", event_prompt("hourly", time="09:30"))

    def test_missing_kwarg_falls_back(self):
        self.assertIn("battery", event_prompt("battery-low").lower())

    def test_unknown_event(self):
        self.assertIn("event", event_prompt("nonsense"))

    def test_moods(self):
        self.assertEqual(mood_for("[excited] yay"), "\U0001F604")
        self.assertEqual(mood_for("[sad] oh no"), "\U0001F614")
        self.assertEqual(mood_for("plain text"), "\U0001F642")


if __name__ == "__main__":
    unittest.main()
