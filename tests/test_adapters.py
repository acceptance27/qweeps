import tempfile
import unittest
from pathlib import Path

from assistant.config import default_config, write_secret
from assistant.llm import OpenRouterLLM, OfflineLLM, build_llm, looks_like_reasoning
from assistant.stt import OpenRouterSTT, build_stt
from assistant.tts import OpenRouterTTS, build_tts


class AdapterTests(unittest.TestCase):
    def _cfg(self, tmp):
        cfg = default_config(Path(tmp))
        write_secret(cfg.config_dir, "OPENROUTER_API_KEY", "test-key-123")
        return cfg

    def test_openrouter_tts_headers(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = self._cfg(tmp)
            cfg.tts.provider = "openrouter"
            engine = build_tts(cfg)
            self.assertIsInstance(engine, OpenRouterTTS)
            self.assertEqual(engine._headers()["Authorization"], "Bearer test-key-123")

    def test_openrouter_tts_payload_carries_voice_and_temperature(self):
        import assistant.audio as audio
        import assistant.tts as ttsmod

        with tempfile.TemporaryDirectory() as tmp:
            cfg = self._cfg(tmp)
            cfg.tts.provider = "openrouter"
            cfg.tts.stream = False
            cfg.tts.voice = "vid-123"
            cfg.tts.temperature = 1.2
            cfg.tts.top_p = 0.95
            captured = {}
            orig_post = ttsmod.post_raw
            orig_play = audio.play
            ttsmod.post_raw = lambda url, payload, headers=None, timeout=120: (
                captured.update(payload) or b"\x00"
            )
            audio.play = lambda path, timeout=120: True
            try:
                build_tts(cfg).speak("hello")
            finally:
                ttsmod.post_raw = orig_post
                audio.play = orig_play
            self.assertEqual(captured["voice"], "vid-123")
            self.assertEqual(captured["temperature"], 1.2)
            self.assertEqual(captured["top_p"], 0.95)

    def test_openrouter_tts_streams_to_player(self):
        import assistant.tts as ttsmod

        with tempfile.TemporaryDirectory() as tmp:
            cfg = self._cfg(tmp)
            cfg.tts.provider = "openrouter"
            cfg.tts.stream = True
            engine = build_tts(cfg)
            state = {"chunks": 0, "closed": False, "waited": False}

            class FakeResponse:
                def __init__(self):
                    self._chunks = [b"a" * 8, b"b" * 8, b""]
                    self._i = 0

                def read(self, n):
                    value = self._chunks[self._i]
                    self._i += 1
                    return value

                def close(self):
                    state["closed"] = True

            class FakeStdin:
                def write(self, data):
                    state["chunks"] += 1

                def close(self):
                    pass

            class FakeProc:
                def __init__(self):
                    self.stdin = FakeStdin()
                    self.returncode = 0
                    self.pid = 4242

                def wait(self, timeout=None):
                    state["waited"] = True
                    return 0

                def kill(self):
                    pass

            orig_open = ttsmod.open_stream
            orig_player = ttsmod._stream_player
            orig_popen = ttsmod.subprocess.Popen
            ttsmod.open_stream = lambda *a, **k: FakeResponse()
            ttsmod._stream_player = lambda: ["mpv", "-"]
            ttsmod.subprocess.Popen = lambda *a, **k: FakeProc()
            try:
                ok = engine.speak("hello there")
            finally:
                ttsmod.open_stream = orig_open
                ttsmod._stream_player = orig_player
                ttsmod.subprocess.Popen = orig_popen
            self.assertTrue(ok)
            self.assertEqual(state["chunks"], 2)
            self.assertTrue(state["closed"])
            self.assertTrue(state["waited"])

    def test_openrouter_stt_headers(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = self._cfg(tmp)
            cfg.stt.provider = "openrouter"
            engine = build_stt(cfg)
            self.assertIsInstance(engine, OpenRouterSTT)
            self.assertEqual(engine._headers()["Authorization"], "Bearer test-key-123")

    def test_openrouter_llm_headers(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = self._cfg(tmp)
            cfg.llm.enabled = True
            llm = build_llm(cfg)
            self.assertTrue(hasattr(llm, "primary"))
            self.assertTrue(llm.primary._headers()["Authorization"].startswith("Bearer "))

    def test_direct_llm_headers(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = self._cfg(tmp)
            llm = OpenRouterLLM(cfg, "abc")
            self.assertEqual(llm._headers()["Authorization"], "Bearer abc")

    def test_reasoning_detector(self):
        self.assertTrue(looks_like_reasoning("Here's a thinking process:\n1. **Analyze"))
        self.assertFalse(looks_like_reasoning("[excited] Oh, WOW, hello there!"))

    def test_model_fallback_list(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = self._cfg(tmp)
            cfg.llm.model = "primary:free"
            cfg.llm.fallback_models = ["backup-a", "backup-b", "primary:free"]
            llm = OpenRouterLLM(cfg, "k")
            self.assertEqual(llm.models, ["primary:free", "backup-a", "backup-b"])


    def test_fallback_circuit_breaker_on_403(self):
        from assistant.llm import FallbackLLM

        class FailingPrimary:
            def __init__(self):
                self.calls = 0

            def answer(self, question, facts="", history=None):
                self.calls += 1
                raise RuntimeError("HTTP 403: An active OpenCode Go subscription is required")

        class WorkingFallback:
            def __init__(self):
                self.calls = 0

            def answer(self, question, facts="", history=None):
                self.calls += 1
                return "fallback answer"

        primary = FailingPrimary()
        fallback = WorkingFallback()
        router_llm = FallbackLLM(primary, fallback=fallback)

        ans1 = router_llm.answer("test 1")
        self.assertEqual(ans1, "fallback answer")
        self.assertEqual(primary.calls, 1)
        self.assertEqual(fallback.calls, 1)
        self.assertTrue(router_llm._primary_disabled)

        # Second call should bypass primary completely without calling it
        ans2 = router_llm.answer("test 2")
        self.assertEqual(ans2, "fallback answer")
        self.assertEqual(primary.calls, 1)
        self.assertEqual(fallback.calls, 2)


if __name__ == "__main__":
    unittest.main()


class NemotronDefaultTests(unittest.TestCase):
    def test_conversation_and_tts_text_use_free_nemotron_without_json_wrapper(self):
        from unittest.mock import patch
        cfg = default_config(Path('/tmp/qweeps-nemotron-default-test'))
        with patch.object(type(cfg), 'llm_key', return_value='test-key'):
            model = build_llm(cfg)
        self.assertEqual(model.primary.model, 'nvidia/nemotron-3.5-super-vl:free')
        self.assertIsInstance(model.fallback, OfflineLLM)
        reply = {'choices': [{'message': {'content': 'ROUTE: CHAT\nSAY: Four.'}}]}
        with patch('assistant.llm.post_json', return_value=reply) as send:
            self.assertIn('SAY: Four.', model.talk('What is two plus two?'))
        payload = send.call_args.args[1]
        self.assertEqual(payload['model'], cfg.llm.model)
        self.assertEqual(payload['provider']['max_price'], {'prompt': 0, 'completion': 0})
        self.assertFalse(payload['provider']['allow_fallbacks'])
        self.assertEqual(payload['reasoning'], {'enabled': False})
        self.assertNotIn('response_format', payload, 'spoken replies retain the ordinary talker protocol')

    def test_streamed_tts_text_keeps_the_same_model_and_free_route(self):
        from unittest.mock import patch
        cfg = default_config(Path('/tmp/qweeps-nemotron-default-test'))
        model = OpenRouterLLM(cfg, 'test-key')
        response = iter([b'data: {"choices":[{"delta":{"content":"ROUTE: CHAT\\nSAY: Four."}}]}', b'data: [DONE]'])
        class Stream:
            def __iter__(self):return response
            def close(self):pass
        with patch('assistant.llm.open_stream', return_value=Stream()) as send:
            self.assertIn('SAY: Four.', ''.join(model.stream_talk('What is two plus two?')))
        payload = send.call_args.args[1]
        self.assertEqual(payload['model'], cfg.llm.model)
        self.assertEqual(payload['provider']['max_price'], {'prompt': 0, 'completion': 0})
        self.assertEqual(payload['reasoning'], {'enabled': False})
