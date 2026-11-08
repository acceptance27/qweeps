import copy
import json
from types import SimpleNamespace
from unittest.mock import Mock
import pytest
from assistant.visual.architecture_narration import (ArchitectureNarrationStore, checked_scope, scene_moments, validate_plan, measured_track)
from assistant.visual.plan import PlanError


def scope():
    return {'title': 'Identity request', 'scope': 'system', 'sourceCode': 'def run(request): return request', 'sampleInput': 'hello',
            'graph': {'nodes': [{'id': 'input', 'label': 'request'}, {'id': 'run', 'label': 'run(request)'}],
                      'edges': [{'id': 'flow', 'source': 'input', 'target': 'run'}]},
            'steps': [{'id': name, 'duration': 4, 'title': name, 'question': 'What changes?', 'narration': 'The request is returned unchanged.',
                       'packets': [{'edgeId': 'flow', 'start': .5, 'end': 1.5, 'payload': 'hello'}], 'takeaway': 'The result is hello.'} for name in ['first', 'second']]}


def plan():
    first = 'A request starts here. It leaves the input. The worker receives it. The result is ready.'
    bridge = 'We keep that result.'
    second = bridge + ' Now a request starts here. It leaves the input. The worker receives it. The result is ready.'
    return {'chapters': [{'id': name, 'narration': text, 'bridge': '' if i == 0 else bridge, 'anchors': [
        {'target': f'cue-{j}', 'phrase': phrase, 'occurrence': 1} for j, phrase in enumerate([
            'A request starts' if i == 0 else 'Now a request starts', 'It leaves the input', 'The worker receives it', 'The result is ready'])]}
        for i, (name, text) in enumerate([('first', first), ('second', second)])]}


def recording(p):
    script = ' '.join(c['narration'] for c in p['chapters'])
    words = script.split()
    return {'words': [{'text': word, 'start': i * .3, 'end': i * .3 + .2} for i, word in enumerate(words)]}, len(words) * .3


def test_recording_maps_actual_packet_events_and_holds_previous_result_through_bridge():
    source = checked_scope(scope()); moments = scene_moments(source)
    authored = validate_plan(plan(), moments); alignment, duration = recording(plan())
    result = measured_track(source, moments, authored, alignment, duration)
    assert result['alignment']['recordingCount'] == 1
    assert result['sceneDuration'] == 8
    assert result['duration'] == pytest.approx(duration + 1.3)
    receive = result['chapters'][0]['cues'][2]
    assert receive['sceneTime'] == 1.5
    assert receive['audioTime'] == pytest.approx(.3 + 8 * .3), 'use the measured phrase, not an estimated share of the beat'
    second = result['chapters'][1]
    bridge_end = second['cues'][0]['audioTime']
    hold = [p for p in result['points'] if second['start'] <= p['audio'] < bridge_end]
    assert len(hold) >= 2 and all(p['scene'] == 4 for p in hold)
    assert all(b['audio'] > a['audio'] and b['scene'] >= a['scene'] for a, b in zip(result['points'], result['points'][1:]))
    assert result['script'] == ' '.join(c['narration'] for c in authored)
    assert scope() == source, 'recording does not rewrite source diagrams or example data'


def test_simultaneous_packets_share_one_moment_instead_of_inventing_a_sequence():
    source = scope(); source['steps'][0]['packets'] *= 2
    moments = scene_moments(source)[0]['moments']
    assert len(moments) == 4 and len(moments[1]['actions']) == 2


@pytest.mark.parametrize('change', ['missing_id', 'backwards', 'bridge', 'invented_phrase'])
def test_bad_spoken_cues_are_rejected_before_speech_is_requested(change):
    p = plan()
    if change == 'missing_id': p['chapters'][0]['id'] = 'invented'
    if change == 'backwards': p['chapters'][0]['anchors'][1]['phrase'] = 'A request starts'
    if change == 'bridge': p['chapters'][1]['anchors'][0]['phrase'] = 'We keep that result'
    if change == 'invented_phrase': p['chapters'][0]['anchors'][0]['phrase'] = 'Never spoken in this recording'
    with pytest.raises(PlanError): validate_plan(p, scene_moments(scope()))


def test_missing_word_alignment_does_not_publish_guessed_packet_or_caption_times():
    p = plan(); authored = validate_plan(p, scene_moments(scope())); alignment, duration = recording(p)
    alignment['words'][8]['text'] = 'unrecognizable'
    with pytest.raises(PlanError, match='scene cue'):
        measured_track(scope(), scene_moments(scope()), authored, alignment, duration)
    with pytest.raises(PlanError, match='closely enough'):
        measured_track(scope(), scene_moments(scope()), authored, {'words': []}, duration)


def test_bad_graph_packet_and_nonfinite_times_cannot_enter_the_recording_queue():
    for mutate in [lambda s: s['steps'][0]['packets'][0].update(edgeId='unknown'),
                   lambda s: s['steps'][0].update(duration=float('nan')),
                   lambda s: s['graph']['edges'][0].update(target='unknown')]:
        data = scope(); mutate(data)
        with pytest.raises(PlanError): checked_scope(data)


def test_cache_is_bound_to_source_scope_model_and_voice_and_cancelled_jobs_can_retry(tmp_path):
    cfg = SimpleNamespace(llm=SimpleNamespace(visual_model='opencode-go/muse-spark-1.3-contributor'))
    narration = Mock(folder=tmp_path / 'audio'); narration.folder.mkdir()
    narration.signature.return_value = {'voice': 'one'}
    store = ArchitectureNarrationStore(tmp_path / 'cache'); store.pool.shutdown()
    store.pool = Mock()
    first = store.start(scope(), cfg, narration)
    assert store.start(scope(), cfg, narration)['id'] == first['id']
    store.cancel(first['id'])
    retry = store.start(scope(), cfg, narration)
    assert retry['id'] != first['id'] and retry['status'] == 'preparing'
    store.cancel(retry['id'])
    job = store.jobs[retry['id']]
    key = job['key']
    track = {'key': 'a' * 64, 'url': '/narration/' + 'a' * 64 + '.wav', 'captionVersion': 1}
    (narration.folder / (track['key'] + '.wav')).write_bytes(b'cached real recording placeholder')
    (store.folder / (key + '.json')).write_text(json.dumps(track))
    assert store.start(scope(), cfg, narration)['status'] == 'ready'
    narration.signature.return_value = {'voice': 'two'}
    changed = store.start(scope(), cfg, narration)
    assert changed['status'] == 'preparing' and store.jobs[changed['id']]['key'] != key
    store.cancel(changed['id'])
    data = scope(); data['sourceCode'] += '\n# new revision'
    revised = store.start(data, cfg, narration)
    assert store.jobs[revised['id']]['key'] != key


def test_cancelled_provider_completion_never_publishes_a_ready_track(tmp_path, monkeypatch):
    store = ArchitectureNarrationStore(tmp_path / 'cache')
    store.pool.shutdown(); store.folder.mkdir()
    job = {'id': 'job', 'key': 'b' * 64, 'status': 'preparing', 'stage': ''}; store.jobs['job'] = job
    from assistant.visual import architecture_remix
    monkeypatch.setattr('assistant.visual.architecture_narration.runtime', lambda: None)
    monkeypatch.setattr('assistant.visual.architecture_narration.shutil.which', lambda _: '/usr/bin/ffmpeg')
    def provider(*args, **kwargs):
        store.cancel('job')
        return 200, {'plan': plan()}
    monkeypatch.setattr(architecture_remix, 'request', provider)
    narration = Mock()
    store._prepare(job, scope(), None, narration)
    assert job['status'] == 'cancelled' and 'track' not in job
    narration.prepare_lesson.assert_not_called()
    assert not (store.folder / (job['key'] + '.json')).exists()


def test_missing_alignment_runtime_fails_before_any_paid_provider_request(tmp_path, monkeypatch):
    store = ArchitectureNarrationStore(tmp_path); store.pool.shutdown()
    job = {'id': 'job', 'key': 'b' * 64, 'status': 'preparing', 'stage': ''}; store.jobs['job'] = job
    def unavailable(): raise PlanError('Alignment runtime missing')
    monkeypatch.setattr('assistant.visual.architecture_narration.runtime', unavailable)
    from assistant.visual import architecture_remix
    request = Mock(); monkeypatch.setattr(architecture_remix, 'request', request)
    narration = Mock(); store._prepare(job, scope(), None, narration)
    assert job['status'] == 'failed' and 'runtime missing' in job['error']
    request.assert_not_called(); narration.prepare_lesson.assert_not_called()


def test_long_spoken_sentences_have_readable_subtitles_without_changing_the_recording():
    from assistant.visual.architecture_narration import measured_captions
    words = ['word' + str(i) for i in range(61)]
    script = ' '.join(words)
    from assistant.visual.alignment import tokens
    count = len(tokens(script))
    times = [(i * .2, i * .2 + .1) for i in range(count)]
    captions = measured_captions(script, times)
    assert ' '.join(c['text'] for c in captions) == script
    assert max(len(c['text'].split()) for c in captions) <= 18
    cursor = 0
    for c in captions:
        assert c['at'] == pytest.approx(.3 + times[cursor][0])
        cursor += len(tokens(c['text']))
