"""Fish defaults and local credential setup must work without shipping a key."""
import json
import threading

import pytest

from assistant.config import load_config, write_default_config, set_config_value
from assistant.llm import OfflineLLM
from assistant.tts import FishTTS, build_tts
from assistant.visual.server import VisualService


@pytest.fixture
def service(monkeypatch, tmp_path):
    monkeypatch.setenv('HOME', str(tmp_path))
    for name in ['FISH_API_KEY', 'OPENROUTER_API_KEY', 'OPENCODE_API_KEY', 'QWEEPS_TTS_VOICE']:
        monkeypatch.delenv(name, raising=False)
    # Register later writes for environment cleanup too.
    monkeypatch.setenv('FISH_API_KEY', '')
    from assistant.visual import server
    monkeypatch.setattr(server, 'build_visual_llm', lambda cfg: OfflineLLM())
    write_default_config(tmp_path)
    result = VisualService.__new__(VisualService)
    result.cfg = load_config(config_dir=tmp_path)
    result.lock = threading.RLock()
    return result


def test_fish_defaults_recommendation_and_saved_key_are_usable(service):
    before = service.get_settings()
    assert before['processes']['tts']['provider'] == 'fish'
    assert before['processes']['tts']['recommended']['provider'] == 'fish'
    assert not before['api_keys']['fish']['configured']
    result = service.save_settings({'api_keys': {'fish_key': 'synthetic-fish-key-12345'}})
    key_state = result['settings']['api_keys']['fish']
    assert key_state['configured'] is True
    assert key_state['masked'] == '••••••••2345'
    assert 'synthetic-fish-key-12345' not in json.dumps(result)
    assert 'synthetic-fish-key-12345' not in (service.cfg.config_dir/'config.toml').read_text()
    engine = build_tts(service.cfg)
    assert isinstance(engine, FishTTS)
    assert engine.model == 's2.1-pro-free'
    assert engine._payload('Test')['reference_id'] == '278d128593e44753a522dd52a5a63645'
    # Leaving a key field empty or submitting its masked display must not erase it.
    service.save_settings({'api_keys': {'fish_key': key_state['masked']}})
    assert service.cfg.secret('FISH_API_KEY') == 'synthetic-fish-key-12345'


def test_switching_remote_provider_selects_its_endpoint_and_key(service):
    result = service.save_settings({'processes': {'tts': {'provider': 'openrouter', 'model': 'fish-audio/s2.1-pro-free:free'}}})
    assert result['ok']
    assert service.cfg.tts.base_url == 'https://openrouter.ai/api/v1'
    assert service.cfg.tts.api_key_env == 'OPENROUTER_API_KEY'
    service.save_settings({'processes': {'tts': {'provider': 'fish', 'model': 's2.1-pro-free'}}})
    assert service.cfg.tts.base_url == 'https://api.fish.audio'
    assert service.cfg.tts.api_key_env == 'FISH_API_KEY'
