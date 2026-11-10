"""Exercise large JSON imports through the same HTTP handler bundled on Android."""
import json
from pathlib import Path
import threading
from types import SimpleNamespace
import urllib.error
import urllib.request

import pytest

from assistant.visual.browser_lessons import BrowserLessonStore
from assistant.visual.documents import DocumentLibrary
from assistant.visual.server import MAX_LESSON_IMPORT_BYTES, create_server


@pytest.fixture(params=['desktop', 'android'])
def import_server(request, monkeypatch, tmp_path):
    monkeypatch.setenv('QWEEPS_PLATFORM', request.param)
    studio = Path(__file__).resolve().parents[1] / 'visual-studio'
    store = BrowserLessonStore(
        None, studio, folder=tmp_path / 'lessons',
        documents=DocumentLibrary(tmp_path / 'documents'),
    )
    service = SimpleNamespace(live=store, lock=threading.RLock(), active_requests=0)
    server = create_server(0, studio, service=service)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f'http://127.0.0.1:{server.server_address[1]}', store, service
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)


@pytest.mark.parametrize('wrapped', [False, True])
def test_large_quiz_import_preserves_every_card_and_ordered_blank(import_server, wrapped):
    address, store, service = import_server
    questions = [{
        'id': f'card-{i}', 'prompt': f'What does source item {i} explain?',
        'options': ['A', 'B', 'C', 'D'], 'correctIndex': 0,
        'explanation': 'Source detail: José Rizal studied and annotated Morga. ' * 400,
    } for i in range(181)]
    questions[-1].update({
        'kind': 'ordered_cloze',
        'prompt': 'Rizal went to ____ to study ____ and ____ Morga.',
        'orderedAnswers': ['London', 'English', 'annotate'],
        'options': ['London', 'English', 'annotate', 'Paris', 'Spanish', 'translate', 'Berlin', 'German'],
    })
    lesson = {'title': '181-card reviewer', 'quiz': questions, 'chapters': []}
    body = json.dumps({'lesson': lesson} if wrapped else lesson, ensure_ascii=False).encode('utf-8')
    # Larger than both the old 250 KB ceiling and the user's approximate 3.2 MB.
    assert 3_200_000 < len(body) < MAX_LESSON_IMPORT_BYTES
    request = urllib.request.Request(
        address + '/api/visual/live/import-lesson?source=phone', data=body,
        headers={'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        result = json.load(response)
    assert result['ok'] is True
    assert result['quizCount'] == 181
    saved = json.loads((store.folder / result['lessonId'] / 'lesson.json').read_text())
    assert saved['quiz'] == questions
    assert saved['kind'] == 'standalone_quiz'
    assert saved['quizOnly'] is True
    with urllib.request.urlopen(address + '/api/visual/live/lessons/' + result['lessonId']) as response:
        assert json.load(response)['quiz'] == questions
    assert service.active_requests == 0


def test_oversized_import_is_rejected_before_reading_or_saving(import_server):
    address, store, service = import_server
    request = urllib.request.Request(
        address + '/api/visual/live/import-lesson', data=b'{}',
        headers={'Content-Type': 'application/json', 'Content-Length': str(MAX_LESSON_IMPORT_BYTES + 1)},
    )
    with pytest.raises(urllib.error.HTTPError) as error:
        urllib.request.urlopen(request, timeout=5)
    assert error.value.code == 400
    assert '32 MiB' in json.load(error.value)['error']
    assert not list(store.folder.iterdir())
    assert service.active_requests == 0


def test_other_requests_keep_their_existing_size_limit(import_server):
    address, store, _ = import_server
    request = urllib.request.Request(
        address + '/api/visual/session', data=b'{}',
        headers={'Content-Type': 'application/json', 'Content-Length': '250001'},
    )
    with pytest.raises(urllib.error.HTTPError) as error:
        urllib.request.urlopen(request, timeout=5)
    assert error.value.code == 400
    assert '250000 bytes' in json.load(error.value)['error']
    assert not list(store.folder.iterdir())
