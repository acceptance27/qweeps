import tempfile
import unittest
from pathlib import Path

from assistant.capabilities import AVAILABLE, PLANNED, Capability, CapabilityStore
from assistant.config import default_config
from assistant.memory import Memory
from assistant.router import Router
from assistant.skills import build_registry
from assistant.timers import TimerService


class StoreTests(unittest.TestCase):
    def test_add_persist_load(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "caps.json"
            store = CapabilityStore(path)
            store.add(Capability(name="calendar", description="calendar notes", status=PLANNED))
            reloaded = CapabilityStore(path)
            self.assertEqual(reloaded.get("calendar").status, PLANNED)

    def test_context_lists_available_and_missing(self):
        store = CapabilityStore()
        store.add(Capability(name="time", description="tell the time", status=AVAILABLE))
        store.add(Capability(name="calendar", description="calendar notes", status=PLANNED))
        context = store.context()
        self.assertIn("time", context)
        self.assertIn("calendar", context)
        self.assertIn("still being learned", context)
        self.assertIn("Interns", context)
        self.assertNotIn("cannot do", context)

    def test_sync_from_skills_flips_planned_to_available(self):
        store = CapabilityStore()
        store.add(Capability(name="timer", description="old", status=PLANNED))

        class FakeSkill:
            name = "timer"
            description = "Set a countdown timer"

        store.sync_from_skills([FakeSkill()])
        self.assertEqual(store.get("timer").status, AVAILABLE)
        self.assertEqual(store.get("timer").description, "Set a countdown timer")


class RecordingLLM:
    def __init__(self, kind="question"):
        self.facts = []
        self.kind = kind

    def answer(self, question, facts="", history=None):
        self.facts.append(facts)
        return "ok"

    def classify(self, text):
        return self.kind

    def plan(self, task):
        return task


class FakeAgent:
    def __init__(self, output):
        self.output = output

    def available(self):
        return True

    def run(self, task):
        return self.output


class RouterCapabilityTests(unittest.TestCase):
    def _router(self, tmp, agent=None, llm=None):
        cfg = default_config(Path(tmp))
        build_registry(cfg)
        capabilities = CapabilityStore(cfg.capabilities_path)
        capabilities.sync_from_skills(build_registry(cfg).skills)
        return Router(
            cfg=cfg,
            registry=build_registry(cfg),
            llm=llm or RecordingLLM(),
            memory=Memory(cfg.facts_path),
            confirmer=lambda _p: True,
            agent=agent,
            timers=TimerService(),
            runner=lambda c, t=30: (0, "", ""),
            capabilities=capabilities,
        )

    def test_capabilities_are_injected_into_answers(self):
        with tempfile.TemporaryDirectory() as tmp:
            llm = RecordingLLM()
            router = self._router(tmp, llm=llm)
            router.route("who are you exactly?")
            self.assertIn("Things you can already do", llm.facts[0])
            self.assertIn("timer", llm.facts[0])

    def test_promoted_skill_becomes_a_capability(self):
        with tempfile.TemporaryDirectory() as tmp:
            recipe = (
                "done\nSKILL_RECIPE: "
                '{"name":"calendar-note","description":"Add a calendar note",'
                '"patterns":["calendar note"],"command":["echo","note"],"risk":"low"}'
            )
            router = self._router(tmp, agent=FakeAgent(recipe), llm=RecordingLLM("action"))
            router.route("install nginx")
            self.assertIsNotNone(router.capabilities.get("calendar-note"))
            self.assertEqual(router.capabilities.get("calendar-note").status, AVAILABLE)

    def test_learn_without_recipe_still_registers_capability(self):
        with tempfile.TemporaryDirectory() as tmp:
            router = self._router(tmp, agent=FakeAgent("did some work, no recipe"),
                                  llm=RecordingLLM("action"))
            response = router.route("build me a thing")
            self.assertIsNone(response.promoted)
            names = [c.name for c in router.capabilities.available() if c.source == "learned"]
            self.assertTrue(names)

    def test_capability_marker_registers_named_capability(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = (
                "built a calendar bridge\n"
                'CAPABILITY: {"name":"calendar-notes","description":"Add calendar notes"}'
            )
            router = self._router(tmp, agent=FakeAgent(output), llm=RecordingLLM("action"))
            response = router.route("make me calendar notes")
            cap = router.capabilities.get("calendar-notes")
            self.assertIsNotNone(cap)
            self.assertEqual(cap.status, AVAILABLE)
            self.assertNotIn("CAPABILITY:", response.text)

    def test_semantic_route_runs_learned_skill_with_params(self):
        from assistant.skills import SkillRegistry
        from assistant.skills.promoted import RecipeSkill
        from assistant.types import Risk

        with tempfile.TemporaryDirectory() as tmp:
            cfg = default_config(Path(tmp))
            skill = RecipeSkill(
                name="calendar-notes",
                description="Add a note to the calendar",
                patterns=["zzz-never-matches"],
                command=["note-tool", "--date", "{date}", "--text", "{text}"],
                params=["date", "text"],
                risk=Risk.LOW,
            )
            registry = SkillRegistry([skill])
            capabilities = CapabilityStore(cfg.capabilities_path)
            capabilities.sync_from_skills(registry.skills)

            class RouteLLM(RecordingLLM):
                def route_capability(self, text, caps):
                    return {"name": "calendar-notes",
                            "params": {"date": "September 10", "text": "IS434 deadline"}}

            captured = {}

            def runner(command, timeout=30):
                captured["command"] = command
                return 0, "", ""

            router = Router(
                cfg=cfg, registry=registry, llm=RouteLLM(), memory=Memory(cfg.facts_path),
                confirmer=lambda _p: True, agent=None, timers=TimerService(),
                runner=runner, capabilities=capabilities,
            )
            router.route("put the IS434 deadline on my calendar for September 10")
            self.assertEqual(
                captured["command"],
                ["note-tool", "--date", "September 10", "--text", "IS434 deadline"],
            )

    def test_offline_capability_router(self):
        from assistant.llm import OfflineLLM

        caps = [Capability(name="calendar-notes", description="add calendar notes")]
        self.assertEqual(
            OfflineLLM().route_capability("put this on my calendar notes", caps)["name"],
            "calendar-notes",
        )
        self.assertIsNone(OfflineLLM().route_capability("what is the weather", caps))


if __name__ == "__main__":
    unittest.main()
