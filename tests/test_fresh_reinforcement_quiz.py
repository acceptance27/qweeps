import copy
import io
import json
from pathlib import Path
from unittest.mock import Mock
import zipfile

import pytest

from assistant.visual.browser_lessons import BrowserLessonStore
from assistant.visual.documents import DocumentLibrary
from assistant.visual.plan import PlanError
from assistant.visual.reinforcement_generation import generate_current_quiz, source_units, plan_quiz_units, validate_cards, QUIZ_FORMAT


def document(lib, letter, title='Rizal reviewer'):
    doc = {'id': letter * 32, 'title': title, 'filename': title + '.pdf', 'pageCount': 1, 'aliases': [],
           'pages': [{'page': 1, 'text': 'Rizal began the novel in Calamba during October 1887. The reviewer identifies the location and date.'}]}
    folder = lib.folder / doc['id']; folder.mkdir(parents=True)
    (folder / 'document.json').write_text(json.dumps(doc))
    return doc


def response(unit):
    return {'questions': [{'prompt': f'In context {i + 1}, Rizal began the novel in ____ during October 1887.',
            'options': ['Calamba', 'Madrid', 'Paris', 'London'], 'correctIndex': 0,
            'explanation': 'The reviewer identifies Calamba as the location where writing began.',
            'hint': 'Think of his hometown.', 'acceptedAnswers': ['Calamba, Laguna'],
            'sourceDocumentId': unit['pages'][0]['documentId'], 'sourcePage': unit['pages'][0]['page'],
            'sourceQuote': 'Rizal began the novel in Calamba during October 1887.'} for i in range(unit['count'])]}


@pytest.fixture
def store(tmp_path):
    return BrowserLessonStore(Mock(), Path(__file__).resolve().parents[1] / 'visual-studio', tmp_path / 'lessons', DocumentLibrary(tmp_path / 'documents'))


def test_fresh_composite_never_calls_curated_or_saved_quiz_and_includes_all_sources(store, monkeypatch):
    docs = [document(store.documents, x) for x in 'abc']
    # Use the exact ID which previously hijacked an entire multi-document request.
    old = store.documents.folder / docs[2]['id']
    docs[2]['id'] = '727f9c70e0b7a218da27eeaa7b22af81'
    new = store.documents.folder / docs[2]['id']; old.rename(new)
    (new / 'document.json').write_text(json.dumps(docs[2]))
    from assistant.visual import reinforcement_generation as generation
    from assistant.visual import anotasyon_reviewer_quiz as curated
    monkeypatch.setattr(curated, 'get_curated_anotasyon_quiz', lambda: pytest.fail('A fresh quiz must not use the hardcoded reviewer'))
    calls = []
    def model(llm, instruction, payload, validator, **kwargs):
        calls.append(payload)
        unit = {'count': payload['count'], 'pages': payload['pages']}
        return validator(response(unit))
    monkeypatch.setattr(generation, '_model_json', model)
    payload = {'documentIds': [d['id'] for d in docs], 'question': 'Rizal review'}
    first = store.create_quiz(payload)
    second = store.create_quiz(payload)
    assert first['id'] != second['id']
    assert first['quizFormat'] == QUIZ_FORMAT
    assert len(calls) == 6, 'both clicks must invoke generation for every source'
    assert {q['source']['documentId'] for q in first['quiz']} == set(payload['documentIds'])
    assert all('____' in q['prompt'] and q['options'][q['correctIndex']] == 'Calamba' for q in first['quiz'])
    assert store._base_lesson(first['id']) == first


def test_selected_documents_override_old_lesson_sources_and_old_quiz_is_untouched(store, monkeypatch):
    a, b = [document(store.documents, x) for x in 'ab']
    lesson_id = 'f' * 32
    folder = store.folder / lesson_id; folder.mkdir(parents=True)
    original = {'id': lesson_id, 'title': 'Old lesson', 'documentId': a['id'], 'chapters': [{'id': 'old'}], 'quiz': [{'id': 'old'}]}
    (folder / 'lesson.json').write_text(json.dumps(original))
    (folder / 'request.json').write_text(json.dumps({'documentIds': [a['id']]}))
    from assistant.visual import reinforcement_generation as generation
    selected = []
    def generate(llm, *, document, **kwargs):
        selected.append(document['id']); return [{'id': 'fresh'}]
    monkeypatch.setattr(generation, 'generate_current_quiz', generate)
    result = store.create_quiz({'lessonId': lesson_id, 'documentIds': [b['id']]})
    assert selected == [b['id']]
    assert result['sourceLessonId'] == lesson_id
    assert result['documentIds'] == [b['id']]
    assert result['id'] != lesson_id
    assert store._base_lesson(lesson_id) == original
    store.create_quiz({'lessonId': lesson_id})
    assert selected[-1] == a['id'], 'a lesson-only request recovers its original PDF'


def test_current_format_rejects_old_style_duplicate_options_and_invented_citations(store):
    doc = document(store.documents, 'a')
    unit = source_units(doc)[0]
    valid = response(unit)
    cards = validate_cards(valid, unit, 0)
    assert cards[0]['options'][cards[0]['correctIndex']] == 'Calamba'
    for change, message in [
        ({'prompt': 'Where did Rizal begin his novel?'}, 'blank'),
        ({'options': ['Calamba', 'calamba', 'Paris', 'Madrid']}, 'distinct'),
        ({'correctIndex': 8}, 'correctIndex'),
        ({'sourceQuote': 'An unsupported and wholly invented historical quotation.'}, 'verbatim'),
        ({'sourceDocumentId': 'b' * 32}, 'verbatim'),
        ({'options': ['This correct answer is far too verbose and explanatory to be a choice', 'Madrid', 'Paris', 'London']}, 'short'),
    ]:
        bad = copy.deepcopy(valid); bad['questions'][0].update(change)
        with pytest.raises(PlanError, match=message): validate_cards(bad, unit, 0)


def test_recall_difficulty_survives_validation_for_challenge_scoring(store):
    unit = source_units(document(store.documents, 'a'))[0]
    for difficulty in ('easy', 'medium', 'hard'):
        raw = response(unit)
        for card in raw['questions']:
            card['difficulty'] = difficulty
        assert all(card['difficulty'] == difficulty for card in validate_cards(raw, unit, 0))
    # Older model responses remain usable, without inventing a hard rating.
    assert all(card['difficulty'] == 'easy' for card in validate_cards(response(unit), unit, 0))
    raw = response(unit)
    raw['questions'][0]['difficulty'] = 'legendary'
    with pytest.raises(PlanError, match='difficulty'):
        validate_cards(raw, unit, 0)


def test_one_source_failure_cannot_publish_a_partial_quiz(store, monkeypatch):
    docs = [document(store.documents, x) for x in 'ab']
    from assistant.visual import reinforcement_generation as generation
    def model(llm, instruction, payload, validator, **kwargs):
        if payload['pages'][0]['documentId'] == docs[1]['id']:
            raise PlanError('Provider could not generate the second source')
        return validator(response({'count': payload['count'], 'pages': payload['pages']}))
    monkeypatch.setattr(generation, '_model_json', model)
    with pytest.raises(PlanError, match='second source'):
        store.create_quiz({'documentIds': [d['id'] for d in docs]})
    assert not list(store.folder.glob('*/lesson.json'))


def test_large_sources_keep_the_end_of_long_pages_and_all_source_pages():
    doc = {'id': 'a' * 32, 'title': 'Long reviewer', 'pages': [{'page': 1, 'text': 'A' * 35000 + 'FINAL FACT'}, {'page': 2, 'text': 'Second page facts.'}]}
    units = source_units(doc)
    supplied = ''.join(p['text'] for u in units for p in u['pages'])
    assert 'FINAL FACT' in supplied and 'Second page facts.' in supplied
    assert len(supplied) == sum(len(p['text']) for p in doc['pages'])


def test_docx_ingestion_reads_tables_and_uses_sections_instead_of_fake_pdf_pages(tmp_path):
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, 'w') as z:
        z.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
                   '<w:p><w:r><w:t>Rizal returned to the Philippines in 1892.</w:t></w:r></w:p>'
                   '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>La Liga Filipina was founded in July 1892.</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
                   '</w:body></w:document>')
    import base64
    library = DocumentLibrary(tmp_path / 'docs')
    meta = library.ingest({'filename': 'Rizal.docx', 'base64': base64.b64encode(archive.getvalue()).decode()})
    doc = library.get(meta['id'])
    assert meta['pageLabel'] == 'sections'
    assert 'La Liga Filipina' in doc['pages'][0]['text']
    assert doc['pages'][0]['label'] == 'Section 1'
    assert not (library.folder / meta['id'] / 'source.pdf').exists()
    assert source_units(doc)[0]['pages'][0]['locator'] == 'Section 1'
    with pytest.raises(PlanError, match='valid Word'):
        library.ingest({'filename': 'Bad.docx', 'base64': base64.b64encode(b'not a word document').decode()})


def test_missing_model_never_becomes_old_questions(store):
    from assistant.llm import OfflineLLM
    with pytest.raises(PlanError, match='no old quiz'):
        generate_current_quiz(OfflineLLM(), question='Rizal')


def test_composite_rebuilds_when_source_extraction_changes(store):
    a, b = [document(store.documents, x) for x in 'ab']
    first = store.documents.combine([a['id'], b['id']])
    b['pages'][0]['text'] += ' Newly extracted Word table facts.'
    (store.documents.folder / b['id'] / 'document.json').write_text(json.dumps(b))
    second = store.documents.combine([a['id'], b['id']])
    assert second['id'] == first['id']
    assert first['sourceFingerprints'] != second['sourceFingerprints']
    assert 'Newly extracted Word table facts.' in second['pages'][-1]['text']


def test_coverage_plan_keeps_every_review_question_and_note_instead_of_capping_at_33(store):
    docs = [document(store.documents, x) for x in 'abc']
    for doc, count in zip(docs, [50, 48, 83]):
        if count == 83:
            text = '\n'.join(f'· Person {i} led campaign {i} during a distinct event in 1892.' for i in range(count))
        else:
            text = '\n'.join(f'{i + 1}. Who led campaign {i}? Person {i} led campaign {i} in 1892.' for i in range(count))
        doc['pages'][0]['text'] = text
        (store.documents.folder / doc['id'] / 'document.json').write_text(json.dumps(doc))
    plan = store.quiz_plan({'documentIds': [d['id'] for d in docs]})
    assert plan['count'] == 181
    assert [source['count'] for source in plan['sources']] == [50, 48, 83]
    units = plan_quiz_units(store.documents.combine([d['id'] for d in docs]))
    assert max(u['count'] for u in units) <= 12, 'batching bounds response size, never total coverage'
    assert sum(len(u['items']) for u in units) == 181


def test_each_card_must_cover_its_assigned_source_item(store):
    doc = document(store.documents, 'a')
    doc['pages'][0]['text'] = '\n'.join(f'{i + 1}. Who led campaign {i}? Person {i} led campaign {i} in 1892.' for i in range(4))
    unit = plan_quiz_units(doc)[0]
    raw = {'questions': []}
    for i, item in enumerate(unit['items']):
        raw['questions'].append({'coverageId': item['id'], 'prompt': f'Campaign {i} in 1892 was led by ____.',
            'options': [f'Person {i}', 'Other Person', 'Another Person', 'Different Person'], 'correctIndex': 0,
            'explanation': 'The reviewer identifies the leader of this particular campaign.', 'hint': 'Recall the named campaign leader.',
            'sourceDocumentId': doc['id'], 'sourcePage': 1, 'sourceQuote': f'Person {i} led campaign {i} in 1892.'})
    assert len(validate_cards(raw, unit, 0)) == 4
    bad = copy.deepcopy(raw); bad['questions'][1]['coverageId'] = raw['questions'][0]['coverageId']
    with pytest.raises(PlanError, match='coverageId'): validate_cards(bad, unit, 0)
    bad = copy.deepcopy(raw); bad['questions'][1]['sourceQuote'] = raw['questions'][0]['sourceQuote']
    with pytest.raises(PlanError, match='assigned coverage item'): validate_cards(bad, unit, 0)


def test_retry_resumes_verified_batches_without_reusing_an_old_finished_quiz(store, monkeypatch):
    docs = [document(store.documents, x) for x in 'ab']
    payload = {'documentIds': [d['id'] for d in docs]}
    plan = store.quiz_plan(payload)
    calls = {doc['id']: 0 for doc in docs}
    fail = True
    from assistant.visual import reinforcement_generation as generation
    def model(llm, instruction, request, validator, **kwargs):
        doc_id = request['pages'][0]['documentId']; calls[doc_id] += 1
        if fail and doc_id == docs[1]['id']:
            raise PlanError('Second source failed')
        return validator(response({'count': request['count'], 'pages': request['pages']}))
    monkeypatch.setattr(generation, '_model_json', model)
    with pytest.raises(PlanError, match='Second source'):
        store.create_quiz({**payload, 'quizBuildId': plan['buildId']})
    progress = store.quiz_progress(plan['buildId'])
    assert progress['status'] == 'failed' and progress['completedCards'] == 6
    assert not (store.folder / plan['buildId'] / 'lesson.json').exists()
    fail = False
    resumed = store.quiz_plan({**payload, 'resumeQuizBuild': plan['buildId']})
    result = store.create_quiz({**payload, 'quizBuildId': resumed['buildId']})
    assert result['id'] == plan['buildId']
    assert calls == {docs[0]['id']: 1, docs[1]['id']: 2}
    assert store.quiz_progress(result['id'])['status'] == 'ready'
    assert len(result['quiz']) == 12


def test_source_changes_prevent_resuming_cards_from_another_input(store):
    doc = document(store.documents, 'a')
    plan = store.quiz_plan({'documentIds': [doc['id']]})
    doc['pages'][0]['text'] += ' A newly corrected historical fact.'
    (store.documents.folder / doc['id'] / 'document.json').write_text(json.dumps(doc))
    with pytest.raises(PlanError, match='sources changed'):
        store.quiz_plan({'documentIds': [doc['id']], 'resumeQuizBuild': plan['buildId']})


def test_short_date_quotes_are_valid_when_bound_to_the_actual_review_question(store):
    doc = document(store.documents, 'a')
    doc['pages'][0]['text'] = '\n'.join(f'{i + 1}. When did event {i} happen?\n○ {1872 + i}' for i in range(4))
    unit = plan_quiz_units(doc)[0]
    raw = {'questions': [{'coverageId': entry['id'], 'prompt': f'Event {i} happened in ____.',
        'options': [str(1872 + i), '1887', '1891', '1892'], 'correctIndex': 0,
        'explanation': 'The reviewer explicitly gives this year for the specified event.', 'hint': 'Recall the event date.',
        'sourceDocumentId': doc['id'], 'sourcePage': 1, 'sourceQuote': str(1872 + i)} for i, entry in enumerate(unit['items'])]}
    assert len(validate_cards(raw, unit, 0)) == 4
    raw['questions'][0]['sourceQuote'] = '1900'
    with pytest.raises(PlanError, match='verbatim source quote'):
        validate_cards(raw, unit, 0)


def test_cached_visuals_get_a_new_quiz_copy_without_reusing_old_questions(store, monkeypatch):
    doc = document(store.documents, 'a')
    old = {'id': 'f' * 32, 'title': 'Reviewed visuals', 'quiz': [{'id': 'old-style'}],
           'chapters': [{'id': 'beat', 'audio': '/saved-clip.wav'}], 'audioTrack': {'url': '/saved-track.wav'}}
    folder = store.folder / old['id']; folder.mkdir(parents=True)
    (folder / 'lesson.json').write_text(json.dumps(old))
    (folder / 'request.json').write_text(json.dumps({'documentIds': [doc['id']]}))
    store.jobs['job'] = {'lessonId': old['id'], 'question': 'Review this PDF', 'document': doc, 'status': 'preparing'}
    from assistant.visual import reinforcement_generation as generation
    calls = []
    def generate(llm, **kwargs):
        calls.append(kwargs); return [{'id': 'fresh-style', 'formatVersion': 2}]
    monkeypatch.setattr(generation, 'generate_current_quiz', generate)
    store._prepare_cached_quiz('job', old)
    job = store.jobs['job']
    assert job['status'] == 'ready' and job['lessonId'] != old['id']
    saved = store._base_lesson(job['lessonId'])
    assert saved['quiz'][0]['id'] == 'fresh-style' and saved['quizFormat'] == QUIZ_FORMAT
    assert saved['audioTrack'] == old['audioTrack'] and saved['chapters'] == old['chapters']
    assert store._base_lesson(old['id']) == old
    assert calls[0]['document']['id'] == doc['id']


def ordered_response():
    text = 'In London he improved English, continued reform safely, studied Morga, and annotated the book.'
    unit = {'id': 'ordered', 'title': 'Recall', 'count': 1,
            'pages': [{'documentId': 'a' * 32, 'page': 1, 'text': text}],
            'items': [{'id': 'item-1', 'text': text}]}
    card = {'kind': 'ordered_cloze', 'prompt': 'In London he improved ____, continued ____ safely, ____ Morga, and ____ the book.',
            'options': ['English', 'reform', 'studied', 'annotated', 'Spanish', 'commerce', 'translated', 'illustrated'],
            'orderedAnswers': ['English', 'reform', 'studied', 'annotated'],
            'orderedExplanations': ['The language was English.', 'Reform remained his aim.', 'Studied describes reading.', 'Annotated means adding notes.'],
            'orderedEvidence': ['improved English', 'continued reform safely', 'studied Morga', 'annotated the book'],
            'difficulty': 'medium', 'explanation': 'The source lists his four purposes.', 'hint': 'Follow the distinct cues.',
            'coverageId': 'item-1', 'sourceDocumentId': 'a' * 32, 'sourcePage': 1, 'sourceQuote': text}
    return {'questions': [card]}, unit


def test_ordered_cards_preserve_each_blank_and_support_eight_to_ten_choices():
    raw, unit = ordered_response()
    for extra in ([], ['published'], ['published', 'printed']):
        data = copy.deepcopy(raw); data['questions'][0]['options'] += extra
        card = validate_cards(data, unit, 0)[0]
        assert card['kind'] == 'ordered_cloze' and card['formatVersion'] == 3
        assert card['orderedAnswers'] == ['English', 'reform', 'studied', 'annotated']
        assert card['options'][card['correctIndex']] == 'English'
        assert card['orderedAliases'] == [['English'], ['reform'], ['studied'], ['annotated']]
        assert card['orderedEvidence'] == raw['questions'][0]['orderedEvidence']


@pytest.mark.parametrize('change, message', [
    ({'prompt': 'One ____ only.'}, 'blanks'),
    ({'options': ['English', 'reform', 'studied', 'annotated']}, '8–10'),
    ({'orderedAnswers': ['English', 'reform', 'studied', 'invented']}, 'shared bank'),
    ({'orderedAnswers': ['English', 'reform', 'studied', 'studied']}, 'distinct'),
    ({'orderedExplanations': ['too short']}, 'explanation'),
    ({'orderedEvidence': ['invented evidence'] * 4}, 'verbatim'),
    ({'orderedAliases': [['English']]}, 'variants'),
])
def test_ordered_cards_reject_missing_blanks_answers_or_source_support(change, message):
    raw, unit = ordered_response(); raw['questions'][0].update(change)
    with pytest.raises(PlanError, match=message):
        validate_cards(raw, unit, 0)


def test_bare_lists_must_name_and_follow_verified_source_order():
    raw, unit = ordered_response()
    card = raw['questions'][0]
    card['prompt'] = 'His purposes were ____, ____, ____, and ____.'
    validated = validate_cards(raw, unit, 0)[0]
    assert validated['prompt'].startswith('In the order listed in the source, ')
    card['orderedEvidence'] = list(reversed(card['orderedEvidence']))
    with pytest.raises(PlanError, match='source’s listed order'):
        validate_cards(raw, unit, 0)


def test_ordered_feedback_cannot_give_away_a_later_blank():
    raw, unit = ordered_response()
    raw['questions'][0]['orderedExplanations'][0] = 'English was used alongside the goal of reform.'
    with pytest.raises(PlanError, match='reveals a later answer'):
        validate_cards(raw, unit, 0)
