"""Verify the loopback wrapper and Android's portable PDF extraction path."""
import base64
import io
import importlib.util
from pathlib import Path
import threading
import urllib.error
import urllib.request
from types import SimpleNamespace

import pytest

from assistant.visual.server import create_server
from assistant.visual.documents import DocumentLibrary
from assistant.visual.plan import PlanError


@pytest.mark.parametrize('provider', ['fish', 'openrouter', 'piper'])
@pytest.mark.parametrize('has_key', [False, True])
def test_android_start_preserves_remote_speech_selection(monkeypatch, tmp_path, provider, has_key):
    from assistant.config import TTSConfig
    from assistant import config, llm
    from assistant.visual import server as server_module
    monkeypatch.setenv('HOME', str(tmp_path))
    monkeypatch.setenv('QWEEPS_PLATFORM', 'test')
    monkeypatch.setenv('QWEEPS_STUDIO_DIR', str(tmp_path))
    cfg = SimpleNamespace(tts=TTSConfig(provider=provider), llm=SimpleNamespace(enabled=True),
                          secret=lambda name: 'synthetic-fish-test-key' if has_key and name == 'FISH_API_KEY' else None)
    monkeypatch.setattr(config, 'load_config', lambda: cfg)
    monkeypatch.setattr(llm, 'build_visual_llm', lambda cfg: object())
    captured = []
    def make_service(cfg):
        captured.append(cfg.tts.provider)
        return SimpleNamespace(live=SimpleNamespace(folder=tmp_path/'lessons'),
                               narration=SimpleNamespace(folder=tmp_path/'narration'))
    monkeypatch.setattr(server_module, 'VisualService', make_service)
    monkeypatch.setattr(server_module, 'create_server', lambda **kwargs: SimpleNamespace(serve_forever=lambda: None))
    path = Path(__file__).resolve().parents[1]/'android/app/src/main/python/qweeps_android.py'
    spec = importlib.util.spec_from_file_location('android_speech_test_runtime', path)
    runtime = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runtime)
    runtime.start(str(tmp_path), str(tmp_path/'studio'))
    assert captured == [provider if provider in {'fish', 'openrouter'} else 'none']
    assert cfg.tts.voice == '278d128593e44753a522dd52a5a63645'


def test_embedded_server_serves_same_origin_api_and_assets(tmp_path):
    (tmp_path / 'dist').mkdir()
    (tmp_path / 'dist' / 'index.html').write_text('<title>QWEEPS</title>')
    server = create_server(0, tmp_path, service=SimpleNamespace(health=lambda: {'service': 'qweeps-visual'}))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        address = f'http://127.0.0.1:{server.server_address[1]}'
        assert server.server_address[0] == '127.0.0.1'
        assert b'QWEEPS' in urllib.request.urlopen(address).read()
        assert b'qweeps-visual' in urllib.request.urlopen(address + '/api/visual/health').read()
        request = urllib.request.Request(address + '/api/visual/health', headers={'Origin': 'https://unrelated.example'})
        with pytest.raises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(request)
        assert error.value.code == 403
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)


def pdf_upload(encrypt=False):
    pypdf = pytest.importorskip('pypdf')
    from pypdf.generic import NameObject, DictionaryObject, DecodedStreamObject
    writer = pypdf.PdfWriter()
    page = writer.add_blank_page(width=600, height=800)
    font = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})
    page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): writer._add_object(font)})})
    stream = DecodedStreamObject()
    stream.set_data(b'BT /F1 12 Tf 40 700 Td (QWEEPS source material explains polynomial algorithms and fast verification. A verifier checks a supplied witness in polynomial time.) Tj ET')
    page[NameObject('/Contents')] = writer._add_object(stream)
    writer.add_metadata({'/Title': 'Portable lesson source'})
    if encrypt:
        writer.encrypt('a-private-password')
    output = io.BytesIO()
    writer.write(output)
    return {'filename': 'source.pdf', 'base64': base64.b64encode(output.getvalue()).decode()}


def test_android_extracts_pdf_without_desktop_programs(monkeypatch, tmp_path):
    monkeypatch.setenv('QWEEPS_PLATFORM', 'android')
    library = DocumentLibrary(tmp_path)
    result = library.ingest(pdf_upload())
    assert result['title'] == 'Portable lesson source'
    assert result['pageCount'] == 1
    assert 'verifier checks a supplied witness' in library.get(result['id'])['pages'][0]['text']


def test_android_rejects_encrypted_source(monkeypatch, tmp_path):
    monkeypatch.setenv('QWEEPS_PLATFORM', 'android')
    with pytest.raises(PlanError, match='encrypted'):
        DocumentLibrary(tmp_path).ingest(pdf_upload(encrypt=True))
