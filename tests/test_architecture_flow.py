import copy
import json
import math
from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from assistant.visual.architecture_flow import validate_architecture, module_lesson
from assistant.visual.browser_lessons import BrowserLessonStore, validate_lesson
from assistant.visual.alignment import cue_objects
from assistant.visual.plan import PlanError

ROOT = Path(__file__).resolve().parents[1]
STUDIO = ROOT / 'visual-studio'


def draft():
    code = [{'file':'trace.py','language':'python','lines':[
        {'lineNumber':1,'text':'value = 3','explanation':'Start with three.'},
        {'lineNumber':2,'text':'result = value * 2','explanation':'Double the input.'}]}]
    graph = {'id':'doubling','title':'One value through a function','nodes':[
        {'id':'input','label':'Input','kind':'input','color':'blue','description':'The input value is three.',
         'defaultPreview':'3','codeReference':{'file':'trace.py','lines':[1]}},
        {'id':'output','label':'Output','kind':'output','color':'green','description':'Doubling three gives six.',
         'defaultPreview':'6','codeReference':{'file':'trace.py','lines':[2]}}],
        'edges':[{'id':'value-path','source':'input','target':'output','label':'value × 2','relationship':'data'}]}
    flow={'focusNodes':['input','output'],'activeEdges':['value-path'],
          'packets':[{'id':'double-value','edgeId':'value-path','start':2,'end':5,'payload':'3 → 6'}],
          'code':{'file':'trace.py','lines':[2]},'stateBefore':{'value':3},'stateAfter':{'result':6},
          'nodeDataBefore':{'input':{'statusLabel':'Input','previewLines':['3']}},
          'nodeDataAfter':{'output':{'statusLabel':'Result','previewLines':['6']}}}
    chapter={'id':'double','title':'Double the value','question':'What does doubling change?',
             'insight':'Doubling three produces six.','safeguard':'A displayed trace, not execution of arbitrary code.',
             'duration':12,'narration':'Start with the input. The value three enters the function, where doubling gives six.',
             'teaching':'architecture','layout':'architecture_flow','sourcePages':[],
             'continuity':{'from':None,'bridge':'Start with the input.'},'takeaway':'Doubling three produces six.',
             'presentation':{'method':'Worked code trace','why':'Track a real input through one operation.',
                             'visualEvidence':'The displayed input three becomes output six.','textMode':'labels'},'flow':flow}
    return {'title':'Double a value','question':'How does the value change?','representation':'Follow one input and its output.',
            'example':{'title':'Three becomes six','description':'One illustrative function call.','icon':'code'},
            'architecture':{'version':1,'illustrative':True,'graph':graph,'codeFiles':code,'functions':{}},
            'chapters':[chapter]}


def test_flow_is_derived_from_one_shared_graph_and_roundtrips(tmp_path):
    raw=draft()
    lesson=validate_lesson(raw,None,{'code'},require_continuity=True,require_presentation=True)
    assert [n['id'] for n in lesson['chapters'][0]['visual']['nodes']]==['input','output']
    assert lesson['architecture']['graph']['edges'][0]['source']=='input'
    store=BrowserLessonStore(Mock(),STUDIO,tmp_path)
    roundtrip=validate_lesson(store._raw(lesson),None,{'code'})
    assert roundtrip['architecture']==lesson['architecture']
    assert roundtrip['chapters'][0]['visual']['flow']==lesson['chapters'][0]['visual']['flow']


@pytest.mark.parametrize('mutation,match',[
    (lambda a:a['graph']['nodes'][0].update(x=50),'coordinates'),
    (lambda a:a['graph']['edges'][0].update(target='absent'),'existing'),
    (lambda a:a['graph']['nodes'][0]['codeReference'].update(lines=[88]),'exist'),
    (lambda a:a['codeFiles'][0]['lines'].append(copy.deepcopy(a['codeFiles'][0]['lines'][0])),'unique'),
    (lambda a:a['graph']['nodes'][0].update(visual={'variant':'vector-bars','floats':[float('nan')]}),'JSON'),
    (lambda a:a['graph']['nodes'][0].update(visual={'variant':'paper-card','rows':['invalid']}),'structured'),
])
def test_architecture_rejects_unrenderable_or_unbound_data(mutation,match):
    arch=draft()['architecture'];mutation(arch)
    with pytest.raises(PlanError,match=match):validate_architecture(arch)


def test_packet_references_and_times_are_checked():
    raw=draft();raw['chapters'][0]['flow']['packets'][0]['end']=1
    with pytest.raises(PlanError,match='visible transfer'):validate_lesson(raw,None,{'code'})
    raw=draft();raw['chapters'][0]['flow']['activeEdges']=[]
    with pytest.raises(PlanError,match='active existing edge'):validate_lesson(raw,None,{'code'})


def test_transfers_are_real_speech_anchor_targets():
    lesson=validate_lesson(draft(),None,{'code'})
    assert [n['id'] for n in cue_objects(lesson['chapters'][0])]==['input','output','double-value']


def test_reference_preserves_all_function_levels_and_correct_worked_normalization():
    lesson=json.loads((ROOT/'bundled-lessons/browser-lessons/a7c4e71f90d3426b84c719ea064bd230/lesson.json').read_text())
    architecture=validate_architecture(lesson['architecture'])
    assert len(architecture['functions'])==17
    child=module_lesson(lesson,'fn-embed');inner=module_lesson(child,'emb-pool')
    assert child['rootLessonId']==inner['rootLessonId']==lesson['id']
    assert child['architectureScope']=='fn-embed' and inner['architectureScope']=='emb-pool'
    assert child['id']!=inner['id'] and child['chapters'][0]['visual']['flow']['code']['file']
    unit=architecture['functions']['fn-embed']['steps'][-1]['flow']['stateAfter']['query_vector']
    raw=[.24,-.88,.16,1.42,-.42,.72]
    norm=math.sqrt(sum(n*n for n in raw))
    assert norm==pytest.approx(1.8891267824)
    assert unit==pytest.approx([n/norm for n in raw],abs=5e-5)
    assert math.sqrt(sum(n*n for n in unit))==pytest.approx(1,abs=5e-5)


def test_function_navigation_cycles_are_rejected():
    raw=draft();a=raw['architecture'];chapter=raw['chapters'][0]
    a['functions']['again']={'title':'Again','summary':'A cyclic drill-down.',
        'graph':copy.deepcopy(a['graph']),'codeFiles':copy.deepcopy(a['codeFiles']),
        'steps':[{k:copy.deepcopy(chapter[k]) for k in ('id','title','question','narration','insight','safeguard','duration','flow')}]}
    a['functions']['again']['graph']['nodes'][0]['drillDownFunctionId']='again'
    with pytest.raises(PlanError,match='acyclic'):validate_architecture(a)


def test_synchronized_saved_lesson_is_published_only_after_speech_returns(tmp_path):
    store=BrowserLessonStore(Mock(),STUDIO,tmp_path)
    lesson=validate_lesson(draft(),None,{'code'});lesson['id']='d'*32
    recorded={**lesson,'audioTrack':{'url':'/narration/recorded.wav','duration':12,'key':'recorded','clock':'audio'}}
    job={'lessonId':lesson['id']}
    def compile_saved(*_):
        assert (tmp_path/lesson['id']).is_dir(), 'Bundled lessons need a writable speech checkpoint folder before synthesis'
        return recorded
    with patch('assistant.visual.synchronization.compile_speech',side_effect=compile_saved):
        store._synchronization_worker(job,lesson)
    saved=json.loads((tmp_path/lesson['id']/'lesson.json').read_text())
    assert job['status']=='ready' and saved['audioTrack']==recorded['audioTrack']
    assert 'audioTrack' not in lesson
    assert not list((tmp_path/lesson['id']).glob('*.tmp'))


def test_director_uses_the_validated_shared_graph_instead_of_repeated_model_geometry(tmp_path):
    raw=draft()
    class Model:
        def compose(self,instruction,system='',**kwargs):
            response=copy.deepcopy(raw)
            response['architecture']['graph']['nodes'][0]['x']=999
            return json.dumps(response)
    store=BrowserLessonStore(Model(),STUDIO,tmp_path)
    story={k:copy.deepcopy(raw[k]) for k in ('title','question','representation','example','architecture')}
    story['beats']=[{**raw['chapters'][0],'visibleOperation':'Follow three through a doubling operation to six.'}]
    job={'id':'job','lessonId':'e'*32,'revision':1,'document':None,'storyboard':story,'request':{'question':raw['question']}}
    lesson=store._direct(job)
    assert 'x' not in lesson['architecture']['graph']['nodes'][0]
    assert lesson['chapters'][0]['visual']['flow']['packets'][0]['id']=='double-value'


def test_source_indentation_and_blank_lines_are_preserved():
    architecture=draft()['architecture']
    architecture['codeFiles'][0]['lines'][1]['text']='    return value * 2'
    architecture['codeFiles'][0]['lines'].append({'lineNumber':3,'text':'','explanation':''})
    lines=validate_architecture(architecture)['codeFiles'][0]['lines']
    assert lines[1]['text']=='    return value * 2'
    assert lines[2]['text']==''
