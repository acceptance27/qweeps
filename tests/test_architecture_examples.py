import copy
import math
from unittest.mock import Mock,patch
import pytest
from assistant.visual.architecture_examples import compile_example
from assistant.visual.architecture_flow import validate_architecture,step,data_visual
from assistant.visual.browser_lessons import BrowserLessonStore
from assistant.visual.plan import PlanError
from pathlib import Path


def example():
    return {'inputs':{'raw':[3,4],'query':[1,0],'documents':[
        {'id':'policy','text':'Returns within 30 days','vector':[.9,.1]},
        {'id':'support','text':'Include your receipt','vector':[.65,.35]},
        {'id':'shipping','text':'Delivery in three days','vector':[0,1]}]},'calculations':[
        {'id':'unit','operation':'normalize','inputs':['raw']},
        {'id':'scores','operation':'similarities','inputs':['query','documents']},
        {'id':'ranked','operation':'rank','inputs':['scores']},
        {'id':'chosen','operation':'take','inputs':['ranked'],'parameters':{'count':2}},
        {'id':'texts','operation':'get','inputs':['chosen'],'parameters':{'key':'text'}},
        {'id':'context','operation':'concat','inputs':['texts'],'parameters':{'separator':'\n'}}]}


def architecture():
    return {'version':1,'grounding':'illustrative','workedExample':example(),
        'codeFiles':[{'file':'example.py','language':'python','lines':[{'lineNumber':1,'text':'selected = retrieve(query)'}]}],
        'graph':{'id':'worked-rag','title':'One retrieval','nodes':[
            {'id':'query','label':'Query','kind':'input','description':'Toy query vector','color':'blue','valueRef':'unit','visual':{'variant':'vector-bars','floats':[99]}},
            {'id':'retrieval','label':'Retrieval','kind':'search','description':'Calculated cosine scores','color':'green','valueRef':'ranked','visual':{'variant':'podium-rank','rows':[]}},
            {'id':'context','label':'Context','kind':'output','description':'Selected document text','color':'gold','valueRef':'context'}],
            'edges':[{'id':'query-search','source':'query','target':'retrieval','label':'compare vectors','relationship':'data'},
                     {'id':'retrieval-context','source':'retrieval','target':'context','label':'selected document text','relationship':'data'}]}}


def test_actual_vector_math_and_context_are_calculated_from_one_shared_example():
    result=compile_example(example());v=result['values']
    assert v['unit']==[.6,.8]
    assert math.hypot(*v['unit'])==pytest.approx(1)
    assert v['scores'][0]['score']==pytest.approx(.9/math.hypot(.9,.1))
    assert [row['id'] for row in v['chosen']]==['policy','support']
    assert v['context']=='Returns within 30 days\nInclude your receipt'
    assert compile_example(result)==result,'Revalidation recomputes the same receipt'


@pytest.mark.parametrize('change',[
    lambda e:e['inputs'].update(raw=[0,0]),
    lambda e:e['inputs'].update(query=[1,0,0]),
    lambda e:e['inputs'].update(raw=[float('nan'),0]),
    lambda e:e['calculations'][0].update(inputs=['future']),
    lambda e:e['calculations'][0].update(operation='eval'),
    lambda e:e['calculations'][0].update(id='raw'),
])
def test_invalid_or_unexecutable_examples_are_rejected(change):
    value=example();change(value)
    with pytest.raises(PlanError):compile_example(value)


def test_authored_numbers_cannot_override_calculated_visuals_or_state():
    raw=architecture();a=validate_architecture(raw);values=a['workedExample']['values']
    assert a['graph']['nodes'][0]['visual']['floats']==[.6,.8]
    assert a['graph']['nodes'][1]['visual']['rows'][0]['rightValue']=='0.9939'
    flow=step({'focusNodes':['query','retrieval'],'activeEdges':[],'packets':[],
               'code':{'file':'example.py','lines':[1]},'stateAfter':{'selected':['invented']},'stateAfterRefs':{'selected':'chosen'},
               'nodeDataAfter':{'retrieval':{'statusLabel':'Selected','previewLines':['wrong'],'valueRef':'chosen'}}},a['graph'],a['codeFiles'],values=values)
    assert flow['stateAfter']['selected']==values['chosen']
    assert 'policy' in flow['nodeDataAfter']['retrieval']['previewLines'][0]
    assert 'wrong' not in str(flow)
    assert flow['nodeDataAfter']['retrieval']['visual']['rows'][0]['rightValue']=='0.9939'
    assert raw['graph']['nodes'][0]['visual']['floats']==[99],'Compilation must not mutate input data'


@pytest.mark.parametrize('variant',['funnel-pool','blueprint-slots','gate-keep-drop','heatmap-spotlight','citation-verifier'])
def test_existing_line_payloads_populate_the_real_row_renderer(variant):
    visual=data_visual({'variant':variant,'title':'Operation','lines':['input -> output']})
    assert visual['rows'][0]['rightValue']=='input -> output'
    with pytest.raises(PlanError,match='visible rows'):data_visual({'variant':variant,'title':'Empty'})


def test_design_and_inspect_goals_validate_before_starting_generation(tmp_path):
    store=BrowserLessonStore(Mock(spec=()),Path(__file__).parents[1]/'visual-studio',tmp_path)
    with pytest.raises(PlanError,match='Inspect needs'):store.start({'question':'Explain a system','presentation':'architecture_flow','architectureMode':'inspect'})
    with patch('assistant.visual.browser_lessons.threading.Thread'):
        job=store.start({'question':'Design a school search system','presentation':'architecture_flow','architectureMode':'design'})
    assert store.jobs[job['id']]['architectureMode']=='design'
    saved=__import__('json').loads((tmp_path/job['lessonId']/'request.json').read_text())
    assert saved['architectureMode']=='design'


def test_toy_filtering_and_template_slots_have_explicit_inputs():
    result=compile_example({'inputs':{'question':'HOW do I request a refund?'},'calculations':[
        {'id':'tokens','operation':'tokenize','inputs':['question'],'parameters':{'stopwords':['do','i','a']}},
        {'id':'prompt','operation':'format','inputs':['question'],'parameters':{'keys':['question'],'template':'Question: {question}'}}]})
    assert result['values']['tokens']==['how','request','refund']
    assert result['values']['prompt']=='Question: HOW do I request a refund?'


@pytest.mark.parametrize('mode,grounding,has_example,tradeoffs,error',[
    ('learn','proposed',True,['Simplicity over scale'],'grounding=illustrative'),
    ('learn','illustrative',False,[],'workedExample'),
    ('design','proposed',False,[],'tradeoffs'),
    ('inspect','illustrative',True,[],'grounding=source-backed'),
])
def test_generator_enforces_goal_contract_on_saved_architecture(tmp_path,mode,grounding,has_example,tradeoffs,error):
    import json
    raw=architecture();raw.update(grounding=grounding,assumptions=['Small toy system'],tradeoffs=tradeoffs)
    if not has_example:
        raw.pop('workedExample')
        for node in raw['graph']['nodes']:node.pop('valueRef',None);node.pop('visual',None)
    folder=tmp_path/'draft';folder.mkdir();(folder/'architecture.json').write_text(json.dumps(raw))
    store=BrowserLessonStore(Mock(spec=()),Path(__file__).parents[1]/'visual-studio',tmp_path)
    with pytest.raises(PlanError,match=error):store._ensure_architecture({'lessonId':'draft','architectureMode':mode,'storyboard':{}})


def test_calculated_packet_and_vector_state_cannot_keep_authored_values():
    raw=architecture();a=validate_architecture(raw)
    flow=step({'focusNodes':['query','retrieval'],'activeEdges':['query-search'],
        'packets':[{'id':'unit-packet','edgeId':'query-search','start':0,'end':2,'payload':'wrong','valueRef':'unit'}],
        'code':{'file':'example.py','lines':[1]},
        'nodeDataAfter':{'query':{'statusLabel':'Unit','valueRef':'unit'}}},a['graph'],a['codeFiles'],values=a['workedExample']['values'])
    assert flow['packets'][0]['payload']=='[0.6, 0.8]'
    assert flow['nodeDataAfter']['query']['visual']['floats']==[.6,.8]
    assert flow['nodeDataAfter']['query']['visual']['normLabel']=='L2 norm: 1.0000'


def test_document_context_requires_explicit_text_extraction():
    e=example();e['calculations'][-1]['inputs']=['chosen']
    with pytest.raises(PlanError,match='extract document text'):compile_example(e)


def test_valid_saved_response_is_recovered_without_another_provider_call(tmp_path):
    import json
    folder=tmp_path/'draft';folder.mkdir();(folder/'architecture-attempt-saved.json').write_text(json.dumps(architecture()))
    model=Mock(spec=());store=BrowserLessonStore(model,Path(__file__).parents[1]/'visual-studio',tmp_path)
    job={'lessonId':'draft','architectureMode':'learn','storyboard':{}}
    store._ensure_architecture(job)
    assert job['storyboard']['architecture']['workedExample']['values']['unit']==[.6,.8]
    assert (folder/'architecture.json').is_file()
    assert not model.mock_calls


def test_resume_preserves_completed_storyboard_before_artwork_exists(tmp_path):
    model=Mock(spec=());studio=Path(__file__).parents[1]/'visual-studio'
    with patch('assistant.visual.browser_lessons.threading.Thread'):
        first=BrowserLessonStore(model,studio,tmp_path).start({'question':'Teach retrieval','presentation':'architecture_flow','architectureMode':'learn'})
        folder=tmp_path/first['lessonId'];(folder/'storyboard.json').write_text('{}')
        restarted=BrowserLessonStore(model,studio,tmp_path)
        resumed=restarted.start({'question':'Teach retrieval','presentation':'architecture_flow','architectureMode':'learn','resumeLessonId':first['lessonId']})
        assert resumed['lessonId']==first['lessonId']
        with pytest.raises(PlanError,match='same question'):restarted.start({'question':'An unrelated system','presentation':'architecture_flow','architectureMode':'learn','resumeLessonId':first['lessonId']})


def test_calculated_cards_show_compact_documents_and_proportional_score_bars():
    from assistant.visual.architecture_examples import bind_visual
    values=compile_example(example())['values']
    docs=bind_visual({'variant':'lookup-table'},values['documents'])
    assert docs['rows'][0]['rightValue']=='[0.9, 0.1]'
    assert docs['rows'][0]['note']=='Returns within 30 days'
    scores=bind_visual({'variant':'score-meter'},values['scores'])
    assert scores['rows'][0]['barPercent']==100
    assert 0<scores['rows'][1]['barPercent']<100
    assert scores['rows'][2]['barPercent']==0
    citations=bind_visual({'variant':'citation-verifier'},values['chosen'])
    assert citations['rows'][0]['rightValue']=='Returns within 30 days'
    many=bind_visual({'variant':'lookup-table'},list(range(12)))
    assert len(many['rows'])==6
    assert '6 of 12' in many['footerNote']


def test_shared_fact_repair_recomputes_bound_values_instead_of_changing_derived_numbers(tmp_path):
    import json
    class Model:
        calls=0
        def compose(self,*args,**kwargs):
            self.calls+=1
            return json.dumps({'patches':[{'op':'add','path':'/workedExample/calculations/1/parameters/metric','value':'dot'}]})
    model=Model();store=BrowserLessonStore(model,Path(__file__).parents[1]/'visual-studio',tmp_path)
    a=validate_architecture(architecture());(tmp_path/'draft').mkdir()
    candidate={'architecture':a,'chapters':[]};job={'lessonId':'draft','storyboard':{}}
    findings=[{'beat':'rank','problem':'Dot-product code disagrees with cosine values','revision':'Use dot for this example'}]
    fixed=store._repair_architecture(job,candidate,findings)
    assert fixed['workedExample']['values']['scores'][0]['score']==.9
    assert fixed['graph']['nodes'][1]['visual']['rows'][0]['rightValue']=='0.9000'
    assert a['workedExample']['values']['scores'][0]['score']!=.9
    assert job['storyboard']['architecture']==fixed
    assert store._repair_architecture(job,candidate,findings)==fixed
    assert model.calls==1,'Validated shared corrections should survive interruption without another call'


def test_shared_repair_cannot_overwrite_calculated_receipts_or_graph_identity(tmp_path):
    import json
    for path in ['/workedExample/values/scores','/graph/nodes/0/id']:
        class Model:
            def compose(self,*args,**kwargs):return json.dumps({'patches':[{'op':'replace','path':path,'value':'invented'}]})
        store=BrowserLessonStore(Model(),Path(__file__).parents[1]/'visual-studio',tmp_path)
        (tmp_path/'draft').mkdir(exist_ok=True)
        with pytest.raises(PlanError):store._repair_architecture({'lessonId':'draft','storyboard':{}},{'architecture':validate_architecture(architecture()),'chapters':[]},[])


def test_early_failure_exposes_the_same_resume_path_in_the_preparation_ui(tmp_path):
    store=BrowserLessonStore(Mock(spec=()),Path(__file__).parents[1]/'visual-studio',tmp_path)
    with patch('assistant.visual.browser_lessons.threading.Thread'):
        job=store.start({'question':'Teach retrieval','presentation':'architecture_flow','architectureMode':'learn'})
    (tmp_path/job['lessonId']/'storyboard.json').write_text('{}')
    store.jobs[job['id']]['status']='failed'
    assert store.status(job['id'])['canResume'] is True
