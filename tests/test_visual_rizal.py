"""Historical evidence, measured narration timing and native branch boundaries."""
import json
from pathlib import Path
from unittest.mock import Mock
import pytest
from assistant.visual.plan import PlanError
from assistant.visual.rizal import reply, settings

ROOT=Path(__file__).resolve().parents[1]
MANIFEST=json.loads((ROOT/'visual-studio/public/lessons/jose_rizal.json').read_text())


def test_audio_measured_chapters_are_contiguous_without_fixed_slot_silence():
    end=0
    lengths=[]
    for chapter in MANIFEST['chapters']:
        assert chapter['start']==pytest.approx(end,abs=.0002)
        if (ROOT/'visual-studio/public'/chapter['audio'].lstrip('/')).exists():
            assert (ROOT/'visual-studio/public'/chapter['audio'].lstrip('/')).is_file()
        assert len(chapter['cues'])==3
        assert chapter['cues'][0]['at']==chapter['narrationAt']
        for before,after in zip(chapter['cues'],chapter['cues'][1:]):
            assert after['at']-before['at']-before['duration']==pytest.approx(.22,abs=.0002)
        end=chapter['end']
        last=chapter['cues'][-1]
        assert end-chapter['start']-last['at']-last['duration']==pytest.approx(.4,abs=.0002)
        lengths.append(round(end-chapter['start'],1))
    assert end==MANIFEST['duration']
    assert len(set(lengths))>3


def test_history_controls_change_focus_without_changing_dates():
    assert settings(MANIFEST,{'focus':'chronology-test'})=={'focus':'chronology-test'}
    for bad in [{'year':1895},{'focus':'unknown'},{'scope':'all'}]:
        with pytest.raises(PlanError):settings(MANIFEST,bad)
    chronology=next(c for c in MANIFEST['chapters'] if c['id']=='1896')
    assert 'August 1896' in chronology['roles']['revolution-august']
    assert '30 December 1896' in chronology['roles']['execution-december']
    source_ids={source['id'] for source in MANIFEST['sources']}
    assert all(set(ch['sources'])<=source_ids for ch in MANIFEST['chapters'])


def test_question_branch_is_grounded_and_cannot_focus_an_unrelated_chapter():
    model=Mock(spec=['compose'])
    value={'answer':'The uprising began in August, before the December execution.',
           'nativeBranch':{'chapter':4,'focus':'chronology-test','visualReason':'Align the two dated tracks.'}}
    model.compose.return_value=json.dumps(value)
    result=reply(model,'Did his execution start it?',{'time':170,'selection':['execution-december']},[],MANIFEST,'branch')
    assert result['nativeBranch']['lessonId']=='jose_rizal'
    sent=json.loads(model.compose.call_args.args[0])
    assert sent['paused']['selection']==['execution-december']
    assert sent['evidence'][4]['roles']['chronology-test']
    value['nativeBranch']['focus']='noli'
    model.compose.return_value=json.dumps(value)
    with pytest.raises(PlanError,match='chosen chapter'):
        reply(model,'Did his execution start it?',{},[],MANIFEST,'branch')
