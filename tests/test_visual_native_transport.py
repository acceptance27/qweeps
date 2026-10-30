"""Boundaries shared by the native renderer, model branches and Fish transport."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
from unittest.mock import Mock

import pytest

from assistant.config import Config
from assistant.tts import OpenRouterTTS
from assistant.visual.narration import NarrationStore
from assistant.visual.native_host import NativeHost
from assistant.visual.plan import PlanError, validate_plan, manim_source, validate_svg
from assistant.visual.production import parameter_branch

ROOT = Path(__file__).resolve().parents[1]
REPORT = json.loads((ROOT / 'visual-studio/public/production/report.json').read_text())


def test_generated_paths_are_bounded_data_and_survive_native_export():
    scene = {'title':'Path', 'summary':'A drawn curve', 'beats':[{'title':'Curve',
        'narration':'A curve is drawn.', 'duration':6, 'elements':[{'id':'curve','kind':'path',
        'points':[[-1,0],[0,1],[1,0]], 'smooth':True, 'closed':False}]}]}
    result=validate_plan(scene)
    assert result['beats'][0]['elements'][0]['points'] == [[-1,0],[0,1],[1,0]]
    assert 'set_points_smoothly' in manim_source(result)
    scene['beats'][0]['elements'][0]['points'][0][0] = 2
    with pytest.raises(PlanError, match='path x'):
        validate_plan(scene)


def test_svg_is_self_contained_geometry_only():
    safe='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M 0 0 L 10 10" stroke="#fff"/></svg>'
    assert validate_svg(safe)==safe
    for unsafe in ['<svg viewBox="0 0 1 1"><script>bad</script></svg>',
                   '<svg viewBox="0 0 1 1"><path d="M 0 0" onclick="bad"/></svg>',
                   '<svg viewBox="0 0 1 1"><image href="https://example.com/a"/></svg>',
                   '<!DOCTYPE svg [<!ENTITY x "bad">]><svg viewBox="0 0 1 1"/>']:
        with pytest.raises(PlanError): validate_svg(unsafe)


def test_generated_state_validates_playhead_before_starting_worker(monkeypatch):
    host=NativeHost(ROOT/'visual-studio')
    worker=Mock()
    monkeypatch.setattr(host,'ensure',worker)
    plan={'title':'Test','summary':'A test','beats':[{'title':'Beat','narration':'Watch.',
          'duration':4,'elements':[{'id':'a','kind':'circle'}]}]}
    with pytest.raises(PlanError, match='playhead'):
        host.update('session',{'lessonId':'generated','plan':plan,'time':5})
    assert not worker.mock_calls


def test_frame_lookup_keeps_existing_generated_worker():
    host=NativeHost(ROOT/'visual-studio')
    process=Mock()
    process.poll.return_value=None
    job={'process':process,'lesson_id':'generated','plan_hash':'a-generated-plan'}
    host.jobs['session']=job
    assert host.ensure('session') is job
    process.terminate.assert_not_called()


def test_concurrent_narration_requests_synthesize_once_and_voice_changes_invalidate_cache(tmp_path, monkeypatch):
    engine = OpenRouterTTS(Config(), 'test-only')
    monkeypatch.setattr('assistant.visual.narration.build_tts', lambda _: engine)
    synth = Mock(return_value=b'fake-mp3')
    monkeypatch.setattr('assistant.visual.narration.post_raw', synth)
    store = NarrationStore(Config(), tmp_path)
    with ThreadPoolExecutor(max_workers=4) as pool:
        replies = list(pool.map(store.prepare, ['Same narration'] * 4))
    assert len({r['url'] for r in replies}) == 1
    assert synth.call_count == 1
    assert synth.call_args.args[1]['response_format'] == 'mp3'
    engine.voice = 'a-different-voice'
    assert store.prepare('Same narration')['url'] != replies[0]['url']
    assert synth.call_count == 2


@pytest.mark.parametrize('state', [
    {'time': float('nan')}, {'time': True}, {'time': 121},
    {'camera': {'zoom': 0}}, {'camera': {'x': float('inf')}},
    {'selected': ['a'] * 81}, {'experiment': {'fps': 1000}},
])
def test_native_state_rejects_invalid_values_before_writing_to_worker(state, monkeypatch):
    host = NativeHost(ROOT / 'visual-studio')
    worker = Mock()
    monkeypatch.setattr(host, 'ensure', lambda *args: worker)
    with pytest.raises(PlanError):
        host.update('session', state)
    assert not worker.mock_calls


def test_model_branch_preserves_scope_and_only_changes_reviewed_parameters():
    model = Mock(spec=['compose'])
    model.compose.return_value = json.dumps({'answer': 'Reuse changes the hypothetical input cost.',
        'nativeBranch': {'chapter': 3, 'experiment': {'cache': False},
                         'visualReason': 'The same categories change width under fresh pricing.'}})
    context = {'selection': ['cached-input'], 'time': 73,
               'productionMeasurement': {'experiment': {'scope': 'five_examples'}}}
    reply = parameter_branch(model, 'Without cache?', context, [], REPORT)
    assert reply['scene'] is None
    assert reply['nativeBranch']['experiment']['scope'] == 'five_examples'
    assert reply['nativeBranch']['experiment']['cache'] is False
    sent = json.loads(model.compose.call_args.args[0])
    assert sent['context']['selection'] == ['cached-input']
    assert sent['withoutCacheCost']['total'] > sent['currentCost']['total']
    bad = json.loads(model.compose.return_value)
    bad['nativeBranch']['experiment']['python'] = 'untrusted'
    model.compose.return_value = json.dumps(bad)
    with pytest.raises(PlanError, match='Unsupported native experiment'):
        parameter_branch(model, 'Without cache?', context, [], REPORT)
