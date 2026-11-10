"""Quiz chat must return the model's conversation or an error, never canned card text."""
import json
from pathlib import Path
import threading
import time
import urllib.error
import urllib.request

import pytest

from assistant.llm import ModelProviderError
from assistant.visual.browser_lessons import BrowserLessonStore
from assistant.visual.documents import DocumentLibrary
from assistant.visual.server import VisualService, create_server


class TutorModel:
    provider = 'opencode-go'

    def __init__(self):
        self.calls = []
        self.failure = None
        self.invalid = False

    def compose(self, text, system=''):
        request = json.loads(text.split('\n\n--- VALIDATION ERROR')[0])
        self.calls.append((request, system))
        if self.failure:
            raise self.failure
        if self.invalid:
            return '{"answer":""}'
        return json.dumps({'answer': "Yes, I'm here. What would you like help with?"
                           if request['question'] == 'are you there?'
                           else 'I mean you can ask a follow-up about any concept you want to understand.'})


@pytest.fixture(params=['desktop', 'android'])
def tutor(request, monkeypatch, tmp_path):
    monkeypatch.setenv('QWEEPS_PLATFORM', request.param)
    model = TutorModel()
    studio = Path(__file__).resolve().parents[1] / 'visual-studio'
    store = BrowserLessonStore(model, studio, folder=tmp_path / 'lessons',
                               documents=DocumentLibrary(tmp_path / 'documents'))
    card = {'id': 'recall-card', 'chapterTitle': 'Rizal in London',
            'prompt': 'Rizal improved his ____ in London.', 'options': ['English', 'French', 'German', 'Latin'],
            'correctIndex': 0, 'correctAnswer': 'English',
            'explanation': 'STORED CARD EXPLANATION: Rizal improved his English in London.',
            'source': {'documentId': 'a' * 32, 'title': 'Original reviewer', 'page': 1,
                       'quote': 'Nag-aral ng Ingles si Rizal sa London.'}}
    # A transferred quiz can retain a documentId while the PDF is absent on Android.
    lesson = store.import_lesson({'id': 'b' * 32, 'title': 'Imported quiz', 'chapters': [],
                                  'documentId': 'a' * 32, 'quiz': [card]})
    monkeypatch.setattr(store, '_fallback_answer', lambda *a, **k: pytest.fail('Canned quiz fallback used'))
    service = VisualService.__new__(VisualService)
    service.llm = model
    service.live = store
    service.sessions = {}
    service.lock = threading.RLock()
    service.active_requests = 0
    service.active_id = None
    server = create_server(0, studio, service=service)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    context = {'sceneId': 'live_generated', 'lessonId': lesson['id'], 'quizCard': card}
    try:
        yield f'http://127.0.0.1:{server.server_address[1]}', context, model, service
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)


def send(address, context, question, session=None):
    request = urllib.request.Request(address + '/api/visual/ask',
        data=json.dumps({'question': question, 'context': context, 'sessionId': session}).encode(),
        headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=5) as response:
        return json.load(response)


def assert_idle(service):
    # The client can finish reading a short JSON response before the handler's
    # finally block releases Android's active-request counter.
    deadline = time.monotonic() + 1
    while time.monotonic() < deadline:
        with service.lock:
            if service.active_requests == 0:
                return
        time.sleep(.005)
    assert service.active_requests == 0


def test_greeting_and_follow_up_use_real_model_history_without_the_pdf(tutor):
    address, context, model, service = tutor
    first = send(address, context, 'are you there?')
    assert first['answer'] == "Yes, I'm here. What would you like help with?"
    second = send(address, context, 'What do you mean?', first['sessionId'])
    assert 'follow-up' in second['answer']
    request, _ = model.calls[-1]
    assert request['question'] == 'What do you mean?'
    assert request['history'] == [{'role': 'user', 'content': 'are you there?'},
                                  {'role': 'assistant', 'content': first['answer']}]
    assert request['quizCard']['source']['quote'] == context['quizCard']['source']['quote']
    assert 'STORED CARD EXPLANATION' not in first['answer'] + second['answer']
    assert_idle(service)


def test_model_failure_is_an_error_and_never_a_card_recitation(tutor):
    address, context, model, service = tutor
    model.failure = ModelProviderError('The configured model is unavailable. Please retry.')
    with pytest.raises(urllib.error.HTTPError) as error:
        send(address, context, 'are you there?')
    assert error.value.code == 502
    result = json.load(error.value)
    assert 'error' in result and 'answer' not in result
    assert 'STORED CARD EXPLANATION' not in json.dumps(result)
    assert all(not session['history'] for session in service.sessions.values())
    assert_idle(service)


def test_invalid_model_answer_cannot_be_replaced_by_the_card(tutor):
    address, context, model, _ = tutor
    model.invalid = True
    with pytest.raises(urllib.error.HTTPError) as error:
        send(address, context, 'are you there?')
    result = json.load(error.value)
    assert error.value.code == 400
    assert 'error' in result and 'answer' not in result
    assert 'STORED CARD EXPLANATION' not in json.dumps(result)
