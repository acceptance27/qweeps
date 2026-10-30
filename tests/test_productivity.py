import tempfile
import unittest
from pathlib import Path

from assistant.config import default_config
from assistant.skills.base import SkillContext
from assistant.skills.builtin import RememberSkill
from assistant.skills.productivity import DocumentSkill, NotesSkill, ResearchSkill


class StubLLM:
    def compose(self, instruction, system=""):
        return f"# Draft\n\nContent about the topic.\n"


class StubAgent:
    def available(self):
        return True

    def run(self, prompt):
        return "Researched it. Saved to file."


class Runner:
    def __call__(self, command, timeout=30):
        return 0, "", ""


class ProductivityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.cfg = default_config(root)
        self.cfg.notes.dir = str(root / "Notes")
        self.cfg.documents.dir = str(root / "Documents")
        self.runner = Runner()

    def tearDown(self):
        self.tmp.cleanup()

    def _ctx(self, **kw):
        return SkillContext(cfg=self.cfg, runner=self.runner, **kw)

    def test_notes_add_read_search_list(self):
        self.cfg.notes.mode = "inbox"
        self.cfg.notes.frontmatter = False
        skill = NotesSkill()
        args = skill.match("make a note buy oat milk")
        self.assertEqual(args["text"], "buy oat milk")
        skill.run(args, self._ctx())
        inbox = Path(self.cfg.notes.dir) / "inbox.md"
        self.assertTrue(inbox.exists())
        self.assertIn("buy oat milk", inbox.read_text())

        self.assertIn("Recent notes", skill.run({"action": "read"}, self._ctx()).text)
        self.assertIn("buy oat milk", skill.run({"action": "search", "query": "milk"}, self._ctx()).text)
        self.assertIn("inbox.md", skill.run({"action": "list"}, self._ctx()).text)

    def test_notes_daily_mode_writes_frontmatter(self):
        self.cfg.notes.mode = "daily"
        self.cfg.notes.frontmatter = True
        skill = NotesSkill()
        skill.run(skill.match("make a note call mom"), self._ctx())
        files = list(Path(self.cfg.notes.dir).glob("*.md"))
        self.assertEqual(len(files), 1)
        text = files[0].read_text()
        self.assertIn("tags: [qweeps]", text)
        self.assertIn("call mom", text)

    def test_notes_append_to_named_note(self):
        skill = NotesSkill()
        Path(self.cfg.notes.dir).mkdir(parents=True, exist_ok=True)
        (Path(self.cfg.notes.dir) / "Project.md").write_text("# Project\n")
        args = skill.match("add to my note Project: ship the demo")
        self.assertEqual(args["action"], "append")
        skill.run(args, self._ctx())
        self.assertIn("ship the demo", (Path(self.cfg.notes.dir) / "Project.md").read_text())

    def test_notes_do_not_hijack_a_calendar_request(self):
        self.assertIsNone(NotesSkill().match("Can you add a note to my calendar?"))

    def test_document_generates_content(self):
        skill = DocumentSkill()
        args = skill.match("write a document about the water cycle")
        self.assertEqual(args["topic"], "the water cycle")
        self.assertFalse(args["docx"])
        result = skill.run(args, self._ctx(llm=StubLLM()))
        path = Path(self.cfg.documents.dir) / "the-water-cycle.md"
        self.assertTrue(path.exists())
        self.assertIn("Draft", path.read_text())
        self.assertIn(str(path), result.text)

    def test_document_only_converts_when_asked(self):
        skill = DocumentSkill()
        self.assertTrue(skill.match("draft a report about taxes as a word document")["docx"])
        self.assertTrue(skill.match("write a docx about taxes")["docx"])
        self.assertFalse(skill.match("write a document about taxes")["docx"])

    def test_research_uses_agent(self):
        skill = ResearchSkill()
        args = skill.match("deep research the history of the bicycle")
        self.assertEqual(args["topic"], "the history of the bicycle")
        result = skill.run(args, self._ctx(agent=StubAgent()))
        self.assertIn("Researched it", result.text)

    def test_research_without_agent(self):
        skill = ResearchSkill()
        args = skill.match("research quantum computing")
        result = skill.run(args, self._ctx())
        self.assertIn("Interns", result.text)

    def test_remember_still_targets_facts(self):
        from assistant.config import default_config as dc

        cfg = dc(Path(self.tmp.name))
        skill = RememberSkill()
        self.assertIsNotNone(skill.match("remember that I like tea"))
        self.assertIsNone(skill.match("make a note buy milk"))


if __name__ == "__main__":
    unittest.main()
