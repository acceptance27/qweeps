import tempfile
import unittest
from pathlib import Path

from assistant.config import default_config
from assistant.llm import FallbackLLM, OfflineLLM, OpenRouterLLM
from assistant.memory import Memory
from assistant.router import Router, iter_sentences
from assistant.skills import build_registry
from assistant.timers import TimerService


class SentenceTests(unittest.TestCase):
    def test_split_on_punctuation(self):
        chunks = ["Hello wor", "ld. How are ", "you? I am fine"]
        self.assertEqual(
            list(iter_sentences(chunks)),
            ["Hello world.", "How are you?", "I am fine"],
        )

    def test_trailing_buffer_is_flushed(self):
        self.assertEqual(list(iter_sentences(["no punctuation here"])), ["no punctuation here"])

    def test_newline_gap_after_period(self):
        self.assertEqual(list(iter_sentences(["A. B. C."])), ["A.", "B.", "C."])


class OfflineStreamTests(unittest.TestCase):
    def test_offline_stream_yields_whole_answer(self):
        llm = OfflineLLM()
        chunks = list(llm.stream_answer("hello"))
        self.assertEqual(len(chunks), 1)
        self.assertIn("language model", chunks[0])

    def test_fallback_stream_uses_primary(self):
        llm = FallbackLLM(OfflineLLM())
        self.assertEqual(list(llm.stream_answer("hi")), list(OfflineLLM().stream_answer("hi")))


class FakeStream:
    def __init__(self, lines):
        self._lines = lines

    def __iter__(self):
        return iter(self._lines)

    def close(self):
        pass


class SSEParseTests(unittest.TestCase):
    def test_parses_deltas(self):
        import assistant.llm as llmmod

        with tempfile.TemporaryDirectory() as tmp:
            cfg = default_config(Path(tmp))
            llm = OpenRouterLLM(cfg, "key")
            lines = [
                b'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
                b'data: {"choices":[{"delta":{"content":"lo!"}}]}\n',
                b"data: [DONE]\n",
            ]
            original = llmmod.open_stream
            llmmod.open_stream = lambda *a, **k: FakeStream(lines)
            try:
                self.assertEqual(list(llm.stream_answer("hi")), ["Hel", "lo!"])
            finally:
                llmmod.open_stream = original


class StubStreamLLM:
    def answer(self, question, facts="", history=None):
        return "Hello. World."

    def stream_answer(self, question, facts="", history=None):
        yield "Hello. "
        yield "World."

    def classify(self, text):
        return "question"

    def plan(self, task):
        return task

    def route_capability(self, text, capabilities):
        return None


class OnSentenceTests(unittest.TestCase):
    def test_only_first_sentence_is_announced(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = default_config(Path(tmp))
            seen = []
            router = Router(
                cfg=cfg,
                registry=build_registry(cfg),
                llm=StubStreamLLM(),
                memory=Memory(cfg.facts_path),
                confirmer=lambda _p: True,
                timers=TimerService(),
            )
            response = router.route("hi there", on_sentence=seen.append)
            self.assertEqual(seen, ["Hello."])
            self.assertTrue(response.data.get("streamed"))
            self.assertEqual(response.text, "Hello. World.")


class StubTTS:
    def __init__(self):
        self.spoken = []

    def speak(self, text: str) -> bool:
        self.spoken.append(text)
        return True


class OrchestratorSentenceTests(unittest.TestCase):
    def test_handle_text_speaks_full_sentence_at_once_by_default(self):
        from assistant.orchestrator import Orchestrator

        with tempfile.TemporaryDirectory() as tmp:
            cfg = default_config(Path(tmp))
            self.assertFalse(cfg.tts.split_sentences)
            router = Router(
                cfg=cfg,
                registry=build_registry(cfg),
                llm=StubStreamLLM(),
                memory=Memory(cfg.facts_path),
                confirmer=lambda _p: True,
                timers=TimerService(),
            )
            orch = Orchestrator(cfg, router=router)
            stub_tts = StubTTS()
            orch.tts = stub_tts
            orch.handle_text("hi there", speak=True)
            self.assertEqual(stub_tts.spoken, ["Hello. World."])

    def test_handle_text_splits_when_split_sentences_enabled(self):
        from assistant.orchestrator import Orchestrator

        with tempfile.TemporaryDirectory() as tmp:
            cfg = default_config(Path(tmp))
            cfg.tts.split_sentences = True
            router = Router(
                cfg=cfg,
                registry=build_registry(cfg),
                llm=StubStreamLLM(),
                memory=Memory(cfg.facts_path),
                confirmer=lambda _p: True,
                timers=TimerService(),
            )
            orch = Orchestrator(cfg, router=router)
            stub_tts = StubTTS()
            orch.tts = stub_tts
            orch.handle_text("hi there", speak=True)
            self.assertEqual(stub_tts.spoken, ["Hello.", "World."])


if __name__ == "__main__":
    unittest.main()
