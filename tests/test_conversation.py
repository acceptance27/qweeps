import tempfile
import unittest
from pathlib import Path

from assistant.conversation import Conversation, SessionStore


class ConversationTests(unittest.TestCase):
    def test_add_and_messages(self):
        conv = Conversation()
        conv.add("user", "hello")
        conv.add("assistant", "hi there")
        conv.add("user", "  ")
        self.assertEqual(conv.messages(), [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi there"},
        ])

    def test_turn_cap(self):
        conv = Conversation(max_turns=4)
        for i in range(10):
            conv.add("user", f"m{i}")
        self.assertEqual(len(conv.turns), 4)
        self.assertEqual(conv.turns[0].content, "m6")

    def test_char_budget(self):
        conv = Conversation(max_turns=100, max_chars=10)
        conv.add("user", "aaaaaaaaaa")
        conv.add("user", "bbbbbbbbbb")
        conv.add("user", "cccccccccc")
        self.assertLessEqual(sum(len(t.content) for t in conv.turns), 20)

    def test_persist_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "s.json"
            conv = Conversation(path)
            conv.add("user", "remember me")
            conv.add("assistant", "sure")
            reloaded = Conversation(path)
            self.assertEqual(reloaded.messages(), conv.messages())

    def test_corrupt_file_is_tolerated(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "s.json"
            path.write_text("{not json")
            self.assertEqual(Conversation(path).turns, [])


class SessionStoreTests(unittest.TestCase):
    def test_get_names_safely(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = SessionStore(tmp)
            conv = store.get("my session/../x")
            self.assertIsNotNone(conv)
            self.assertIn("..", conv.path.name)  # sanitised of separators

    def test_none_returns_none(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertIsNone(SessionStore(tmp).get(None))

    def test_list_and_clear(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = SessionStore(tmp)
            store.get("alpha").add("user", "x")
            store.get("beta").add("user", "y")
            self.assertEqual(store.list_sessions(), ["alpha", "beta"])
            self.assertTrue(store.clear("alpha"))
            self.assertEqual(store.list_sessions(), ["beta"])


if __name__ == "__main__":
    unittest.main()
