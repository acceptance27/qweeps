import unittest

from assistant.api import _for_speech


class ForSpeechTests(unittest.TestCase):
    def test_short_text_unchanged(self):
        self.assertEqual(_for_speech("Yes — I can see OpenCode open."), "Yes — I can see OpenCode open.")

    def test_long_text_is_capped(self):
        text = "This is a sentence about the fix. " * 100
        result = _for_speech(text)
        self.assertLessEqual(len(result), 810)
        self.assertTrue(result.endswith("\u2026"))

    def test_code_blocks_are_stripped(self):
        self.assertEqual(_for_speech("Here ```print('x')\nmore``` done"), "Here done")


if __name__ == "__main__":
    unittest.main()
