import unittest

from assistant.agent import extract_capability, extract_recipe, strip_recipe


class RecipeExtractionTests(unittest.TestCase):
    def test_extract(self):
        output = (
            "All done.\n"
            'SKILL_RECIPE: {"name":"x","patterns":["do x"],"command":["echo","x"]}'
        )
        recipe = extract_recipe(output)
        self.assertIsNotNone(recipe)
        self.assertEqual(recipe["name"], "x")

    def test_extract_missing(self):
        self.assertIsNone(extract_recipe("no recipe here"))

    def test_extract_invalid_json(self):
        self.assertIsNone(extract_recipe("SKILL_RECIPE: {not json}"))

    def test_strip(self):
        output = "Result text\nSKILL_RECIPE: {\"a\":1}"
        self.assertEqual(strip_recipe(output), "Result text")

    def test_extract_capability(self):
        output = 'built it\nCAPABILITY: {"name":"cal","description":"calendar"}'
        cap = extract_capability(output)
        self.assertEqual(cap["name"], "cal")
        self.assertIsNone(extract_recipe(output))
        self.assertEqual(strip_recipe(output), "built it")

    def test_extract_capability_requires_name(self):
        self.assertIsNone(extract_capability('CAPABILITY: {"description":"x"}'))


class AgentFallbackTests(unittest.TestCase):
    def test_fallback_when_primary_fails(self):
        from assistant.agent import Agent
        from assistant.config import default_config

        cfg = default_config()
        cfg.agent.command = ["nonexistent_opencode_cmd", "run", "{prompt}"]
        cfg.agent.fallback_command = ["echo", "fallback: {prompt}"]

        agent = Agent(cfg)
        self.assertTrue(agent.available())
        output = agent.run("hello")
        self.assertEqual(output, "fallback: hello")

    def test_fallback_when_primary_exits_nonzero(self):
        from assistant.agent import Agent
        from assistant.config import default_config

        cfg = default_config()
        cfg.agent.command = ["false"]
        cfg.agent.fallback_command = ["echo", "fallback_from_error"]

        agent = Agent(cfg)
        output = agent.run("test")
        self.assertEqual(output, "fallback_from_error")


if __name__ == "__main__":
    unittest.main()
