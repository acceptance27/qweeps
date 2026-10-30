import unittest
from pathlib import Path
from types import SimpleNamespace

import assistant.gdrive as gdrive_mod
from assistant.config import default_config
from assistant.skills.builtin import DriveSkill


class FakeDrive:
    def __init__(self, files=None):
        self.files = files if files is not None else [{"name": "Budget.xlsx", "id": "1"}]
        self.folders = []

    def list_files(self, query="", page_size=10):
        return self.files

    def search(self, name, page_size=10):
        return [f for f in self.files if name.lower() in f["name"].lower()]

    def create_folder(self, name, parent=None):
        self.folders.append(name)
        return {"name": name}


class DriveTests(unittest.TestCase):
    def setUp(self):
        self.cfg = default_config(Path("/tmp/drive-test"))
        self.ctx = SimpleNamespace(cfg=self.cfg, dry_run=False, run_command=lambda c: (0, "", ""))
        self.skill = DriveSkill()

    def test_match(self):
        self.assertIsNotNone(self.skill.match("find my report on drive"))
        self.assertIsNotNone(self.skill.match("what's in my drive"))
        self.assertIsNone(self.skill.match("open my email"))

    def test_not_connected(self):
        original = gdrive_mod.build_drive
        gdrive_mod.build_drive = lambda cfg: None
        self.addCleanup(lambda: setattr(gdrive_mod, "build_drive", original))
        result = self.skill.run({"raw": "what's in my drive", "add": False}, self.ctx)
        self.assertIn("isn't connected", result.text)

    def test_search_lists_files(self):
        original = gdrive_mod.build_drive
        gdrive_mod.build_drive = lambda cfg: FakeDrive()
        self.addCleanup(lambda: setattr(gdrive_mod, "build_drive", original))
        result = self.skill.run({"raw": "find budget on drive", "add": False}, self.ctx)
        self.assertIn("Budget.xlsx", result.text)

    def test_create_folder(self):
        fake = FakeDrive()
        original = gdrive_mod.build_drive
        gdrive_mod.build_drive = lambda cfg: fake
        self.addCleanup(lambda: setattr(gdrive_mod, "build_drive", original))
        result = self.skill.run({"raw": "create a folder called Reports on drive", "add": True}, self.ctx)
        self.assertIn("Reports", result.text)
        self.assertEqual(fake.folders, ["Reports"])


if __name__ == "__main__":
    unittest.main()
