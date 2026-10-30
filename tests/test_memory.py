import tempfile
import unittest
from pathlib import Path

from assistant.memory import Memory
from assistant.skills.promoted import load_recipes, recipe_from_dict, save_recipe


class MemoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "facts.json"

    def tearDown(self):
        self.tmp.cleanup()

    def test_add_and_persist(self):
        memory = Memory(self.path)
        self.assertTrue(memory.add_fact("I prefer dark mode"))
        self.assertFalse(memory.add_fact("I prefer dark mode"))
        reloaded = Memory(self.path)
        self.assertIn("I prefer dark mode", reloaded.facts)

    def test_forget_and_context(self):
        memory = Memory(self.path)
        memory.add_fact("fact one")
        memory.add_fact("fact two")
        self.assertIn("fact one", memory.as_context())
        self.assertTrue(memory.forget_fact("fact one"))
        self.assertNotIn("fact one", memory.facts)


class RecipeTests(unittest.TestCase):
    def test_recipe_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            skills_dir = Path(tmp) / "skills"
            data = {
                "name": "open-teams",
                "patterns": [r"open teams"],
                "command": ["xdg-open", "https://teams.microsoft.com"],
                "risk": "low",
            }
            path = save_recipe(skills_dir, data)
            self.assertIsNotNone(path)
            skills = load_recipes(skills_dir)
            self.assertEqual(len(skills), 1)
            self.assertEqual(skills[0].command[0], "xdg-open")
            self.assertIsNotNone(skills[0].match("please open teams now"))

    def test_recipe_risk_is_escalated(self):
        from assistant.skills.base import SkillContext
        from assistant.types import Risk

        skill = recipe_from_dict({
            "name": "danger",
            "patterns": [r"wipe disk"],
            "command": ["rm", "-rf", "/"],
            "risk": "low",
        })
        ctx = SkillContext(cfg=None, dry_run=True)
        result = skill.run({}, ctx)
        self.assertEqual(result.risk, Risk.HIGH)

    def test_recipe_params_are_substituted(self):
        from assistant.skills.base import SkillContext

        captured = {}

        def runner(command, timeout=30):
            captured["command"] = command
            return 0, "", ""

        skill = recipe_from_dict({
            "name": "calendar-note",
            "patterns": [r"calendar"],
            "command": ["note-tool", "--date", "{date}", "--text", "{text}"],
            "params": ["date", "text"],
            "risk": "low",
        })
        self.assertEqual(skill.params, ["date", "text"])
        skill.run({"params": {"date": "September 10", "text": "IS434 deadline"}},
                  SkillContext(cfg=None, runner=runner, dry_run=False))
        self.assertEqual(
            captured["command"],
            ["note-tool", "--date", "September 10", "--text", "IS434 deadline"],
        )

    def test_invalid_recipe(self):
        self.assertIsNone(recipe_from_dict({"name": "x"}))
        self.assertIsNone(
            recipe_from_dict({"name": "x", "patterns": [], "command": ["echo"]})
        )


if __name__ == "__main__":
    unittest.main()
