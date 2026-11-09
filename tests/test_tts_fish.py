import base64
import json
from types import SimpleNamespace
from unittest.mock import Mock, patch

from assistant.config import Config
from assistant.tts import FishTTS, build_tts
from assistant.visual.narration import NarrationStore


def config(**tts):
    cfg = Config()
    for key, value in tts.items():
        setattr(cfg.tts, key, value)
    return cfg


def test_fish_is_the_default_speech_route():
    cfg = Config()
    assert cfg.tts.provider == "fish"
    assert cfg.tts.base_url == "https://api.fish.audio"
    assert cfg.tts.model == "s2.1-pro-free"
    assert cfg.tts.api_key_env == "FISH_API_KEY"


def test_fish_payload_uses_the_voice_and_never_sends_openrouter_fields():
    cfg = config()
    engine = FishTTS(cfg, "key")
    assert engine.url == "https://api.fish.audio/v1/tts"
    assert engine.stream_url == "https://api.fish.audio/v1/tts/stream/with-timestamp"
    assert engine.rate_limit == 0.0
    payload = engine._payload("Hello")
    assert payload["reference_id"] == cfg.tts.voice
    assert payload["format"] == "mp3"
    assert payload["normalize"] is True
    assert "temperature" not in payload
    assert engine._headers()["model"] == "s2.1-pro-free"


def test_build_tts_selects_fish_with_the_configured_key():
    cfg = config()
    with patch.object(Config, "secret", return_value="sk-fish-test"):
        engine = build_tts(cfg)
    assert isinstance(engine, FishTTS)


def test_fish_token_stream_merges_chunks_into_absolute_word_times():
    cfg = config()
    engine = FishTTS(cfg, "key")
    store = NarrationStore(cfg)
    events = [
        {"chunk_seq": 0, "chunk_audio_offset_sec": 0, "audio_base64": base64.b64encode(b"aa").decode(),
         "alignment": {"segments": [{"text": "Why", "start": 0.0, "end": 0.4}, {"text": "blue?", "start": 0.4, "end": 0.9}]}},
        {"chunk_seq": 1, "chunk_audio_offset_sec": 5.0, "audio_base64": base64.b64encode(b"bb").decode(),
         "alignment": {"segments": [{"text": "Air", "start": 0.0, "end": 0.3}]}},
    ]
    lines = [("data: " + json.dumps(event) + "\n").encode() for event in events]

    class Response:
        def __enter__(self):
            return iter(lines)
        def __exit__(self, *exc):
            return False

    with patch("urllib.request.urlopen", return_value=Response()):
        audio, alignment = store._stream_fish(engine, engine._payload("Why blue? Air"), None)
    assert audio == b"aabb"
    words = alignment["words"]
    assert [(w["text"], w["start"], w["end"]) for w in words] == [
        ("Why", 0.0, 0.4), ("blue?", 0.4, 0.9), ("Air", 5.0, 5.3)]
    assert alignment["duration"] == 5.3
