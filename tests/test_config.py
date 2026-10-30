import tempfile
import unittest
from pathlib import Path

from assistant.config import config_from_toml, default_config


class ConfigTests(unittest.TestCase):
    def test_defaults(self):
        cfg = default_config(Path("/tmp/nonexistent-qweeps"))
        self.assertEqual(cfg.llm.model, "nvidia/nemotron-3.5-super-vl:free")
        self.assertEqual(cfg.llm.api_key_env, "OPENROUTER_API_KEY")
        self.assertEqual(cfg.llm.fallback_models, [])
        self.assertEqual(cfg.tts.model, "fish-audio/s2.1-pro-free:free")
        self.assertEqual(cfg.stt.engine, "cohere")
        self.assertEqual(cfg.agent.command[0], "opencode")
        self.assertEqual(cfg.agent.fallback_command[0], "agy")
        self.assertEqual(cfg.llm.fallback_provider, "offline")
        self.assertEqual(cfg.llm.visual_provider, "opencode-go")
        self.assertEqual(cfg.llm.visual_model, "opencode-go/deepseek-v4.1-flash")
        self.assertEqual(cfg.llm.visual_vision_model, "opencode-go/deepseek-v4.1-flash")
        self.assertIn("org.omarchy.opencode", cfg.agent.window_classes)
        self.assertFalse(cfg.tts.split_sentences)
        self.assertIn("teams is434 architecture", cfg.routes)

    def test_merge_overrides(self):
        raw = {
            "llm": {"enabled": True, "model": "anthropic/claude-3.5", "fallback_provider": "antigravity"},
            "agent": {"command": ["claude", "-p", "{prompt}"], "fallback_command": ["agy", "-p", "{prompt}"]},
            "routes": {"standup": ["xdg-open", "https://example.com"]},
        }
        cfg = config_from_toml(raw)
        self.assertTrue(cfg.llm.enabled)
        self.assertEqual(cfg.llm.model, "anthropic/claude-3.5")
        self.assertEqual(cfg.llm.fallback_provider, "antigravity")
        self.assertEqual(cfg.agent.command, ["claude", "-p", "{prompt}"])
        self.assertEqual(cfg.agent.fallback_command, ["agy", "-p", "{prompt}"])
        self.assertEqual(cfg.routes["standup"][0], "xdg-open")
        self.assertEqual(cfg.tts.model, "fish-audio/s2.1-pro-free:free")


if __name__ == "__main__":
    unittest.main()
