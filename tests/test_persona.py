import os
import tempfile
import unittest
from pathlib import Path

from assistant.config import default_config
from assistant.llm import OpenRouterLLM
from assistant.persona import (
    DEFAULT_NAME,
    Persona,
    active_register,
    normalise,
    spoken,
    words,
)


class PersonaPromptTests(unittest.TestCase):
    def setUp(self):
        self._env = dict(os.environ)
        self.tmp = tempfile.TemporaryDirectory()
        self.cfg = default_config(Path(self.tmp.name))

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self._env)
        self.tmp.cleanup()

    def test_name_and_no_sentinel(self):
        prompt = Persona(self.cfg).system_prompt()
        self.assertIn("QWEEPS", prompt)
        self.assertNotIn("Nothing to report", prompt)

    def test_registers_have_no_unfilled_placeholders(self):
        for register in ("gush", "report"):
            cfg = default_config(Path(self.tmp.name))
            cfg.persona.register = register
            prompt = Persona(cfg).system_prompt()
            self.assertNotIn("{name}", prompt)
            self.assertNotIn("{hands}", prompt)

    def test_rules_come_last(self):
        prompt = Persona(self.cfg).system_prompt()
        self.assertLess(prompt.index("Role and core identity"), prompt.index("outrank the voice"))

    def test_general_conversation_rule_present(self):
        prompt = Persona(self.cfg).system_prompt()
        self.assertIn("conversationalist", prompt)

    def test_interns_are_named(self):
        prompt = Persona(self.cfg).system_prompt()
        self.assertIn("my Interns", prompt)
        self.assertIn("never 'the coding agent'", prompt)

    def test_hands_clause_is_configurable(self):
        self.cfg.persona.hands = "OpenCode is your hands"
        prompt = Persona(self.cfg).system_prompt()
        self.assertIn("OpenCode is your hands", prompt)


class PersonaMechanicsTests(unittest.TestCase):
    def test_spoken_keeps_known_and_unknown_tags(self):
        out = spoken("[EXCITED] Wow *really* [whisper in a small voice]")
        self.assertIn("[excited]", out)
        self.assertIn("[whisper in a small voice]", out)
        self.assertNotIn("*", out)

    def test_normalise_lowercases_known_only(self):
        self.assertEqual(normalise("[SAD]"), "[sad]")
        self.assertEqual(normalise("[MyCustomTag]"), "[MyCustomTag]")

    def test_words_ignore_tags(self):
        self.assertEqual(words("[sad] hello there"), 2)


class LLMPersonaTests(unittest.TestCase):
    def test_answer_uses_persona_system_prompt(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = default_config(Path(tmp))
            llm = OpenRouterLLM(cfg, "k", persona=Persona(cfg))
            captured = {}

            def fake_chat(messages, max_tokens=400):
                captured["messages"] = messages
                return "ok"

            llm._chat = fake_chat
            llm.answer("hi there")
            self.assertIn("QWEEPS", captured["messages"][0]["content"])
            self.assertNotIn("Nothing to report", captured["messages"][0]["content"])


class RegisterSelectionTests(unittest.TestCase):
    def setUp(self):
        self._env = dict(os.environ)
        self.tmp = tempfile.TemporaryDirectory()
        os.environ["YESMAN_HOME"] = self.tmp.name

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self._env)
        self.tmp.cleanup()

    def test_default_is_gush(self):
        self.assertEqual(active_register(None), "gush")

    def test_env_override(self):
        os.environ["YESMAN_STYLE"] = "report"
        self.assertEqual(active_register(None), "report")

    def test_file_beats_env_and_default(self):
        (Path(self.tmp.name) / "style.txt").write_bytes(b"\xef\xbb\xbfgush")
        os.environ["YESMAN_STYLE"] = "report"
        self.assertEqual(active_register(None), "gush")

    def test_typo_falls_through(self):
        (Path(self.tmp.name) / "style.txt").write_text("nonsense")
        self.assertEqual(active_register(None), "gush")


if __name__ == "__main__":
    unittest.main()
