from pathlib import Path
import pytest
from assistant.visual.source_interfaces import python_interface
from assistant.visual.source_functions import materialize_function
from assistant.visual.repo_architecture import scan_repository
from assistant.visual.source_system import compile_source_system
from assistant.visual.plan import PlanError


def test_interface_separates_caller_inputs_return_values_and_outward_changes():
    source='''class Store:
    def prepare(self, request, retries=2):
        candidate = self.client.build(request)
        self.jobs.append(candidate)
        candidate["ready"] = True
        return candidate
'''
    contract=python_interface(source,'Store.prepare')
    assert {i['name'] for i in contract['inputs']}=={'request','retries','client','jobs'}
    assert any(o['name']=='candidate' and o['kind']=='return' for o in contract['outputs'])
    assert any(o['name']=='self.jobs' and o['kind']=='effect' for o in contract['outputs'])
    assert not any(i['name']=='self' for i in contract['inputs'])


def test_outputs_come_from_the_entire_body_and_exclude_nested_function_returns():
    source='def run(value):\n    def helper():\n        return "unrelated"\n'+''.join(f'    step_{i} = value\n' for i in range(30))+'    return final_result\n'
    contract=python_interface(source,'run')
    assert [o['name'] for o in contract['outputs'] if o['kind']=='return']==['final_result']
    fn=materialize_function(source,'run.py','run')
    assert fn['interface']==contract
    assert any(n.get('sourceKind')=='result' and n['interface']['outputs'] for n in fn['graph']['nodes'])


def test_javascript_arrow_return_and_mutation_have_an_interface(tmp_path):
    from assistant.visual.source_functions import javascript_index
    from assistant.visual.source_interfaces import symbol_interface
    path=tmp_path/'worker.ts';path.write_text('export const run = (jobs: string[]) => { jobs.push("ready"); return jobs; };')
    symbol=javascript_index(path)['symbols'][0];contract=symbol_interface(path.read_text(),'worker.ts',symbol)
    assert any(o['kind']=='return' and o['name']=='jobs' for o in contract['outputs'])
    assert any(o['kind']=='effect' for o in contract['outputs'])


def system_fixture(tmp_path):
    source='def prepare(request):\n    return request.upper()\n'
    (tmp_path/'app.py').write_text(source);index=scan_repository(tmp_path,include_snapshots=True);snapshots=index.pop('sourceSnapshots');fid=index['functionCatalog'][0]['id']
    evidence=[{'kind':'file','path':'app.py','lines':[1]}]
    def node(id,kind,label):return {'id':id,'kind':kind,'label':label,'description':label,'confidence':'inferred','evidence':evidence,'codeReference':{'file':'app.py','lines':[1]},'ports':{'inputs':[] if kind=='input' else [{'id':'in','label':'Request'}],'outputs':[] if kind=='output' else [{'id':'out','label':'Prepared result'}]}}
    nodes=[node('request','input','Request'),{**node('prepare','transform','Prepare'),'drillDownFunctionId':fid},node('result','output','Prepared result')]
    edges=[{'id':'incoming','source':'request','target':'prepare','label':'request','relationship':'data','confidence':'inferred','evidence':evidence},{'id':'outgoing','source':'prepare','target':'result','label':'prepared result','relationship':'data','confidence':'inferred','evidence':evidence}]
    return {'graph':{'id':'system','title':'Request to result','nodes':nodes,'edges':edges}},index,snapshots


def test_system_uses_real_boundaries_and_pinned_function_bodies(tmp_path):
    raw,index,snapshots=system_fixture(tmp_path);(tmp_path/'app.py').write_text('raise RuntimeError("changed live file")')
    architecture=compile_source_system(raw,index,snapshots)
    assert architecture['view']=='system'
    assert {'input','output'}<={n['kind'] for n in architecture['graph']['nodes']}
    fn=next(iter(architecture['functions'].values()))
    assert fn['interface']['inputs'][0]['name']=='request'
    assert any('request.upper()' in line['text'] for f in fn['codeFiles'] for line in f['lines'])


@pytest.mark.parametrize('defect',['missing-output','reference-only','unknown-function','fake-source'])
def test_system_rejects_incomplete_or_unsupported_architecture(tmp_path,defect):
    raw,index,snapshots=system_fixture(tmp_path)
    if defect=='missing-output':raw['graph']['nodes'][-1]['kind']='store'
    elif defect=='reference-only':
        for edge in raw['graph']['edges']:edge['relationship']='reference'
    elif defect=='unknown-function':raw['graph']['nodes'][1]['drillDownFunctionId']='invented'
    else:raw['graph']['nodes'][1]['evidence'][0]['path']='not-in-source.py'
    with pytest.raises(PlanError):compile_source_system(raw,index,snapshots)


def test_call_evidence_resolves_real_http_entry_and_service_binding():
    from assistant.visual.source_call_evidence import python_call_evidence
    source='''class Service:
    def __init__(self):
        self.lessons = LessonStore()
class Handler:
    def post(self, route, payload):
        if route == "/api/lesson/jobs":
            return self.service.lessons.start(payload)
'''
    evidence=python_call_evidence(source)
    assert evidence['boundObjects']==[{'owner':'Service','attribute':'lessons','constructor':'LessonStore','line':3}]
    route=evidence['routes'][0]
    assert route['route']=='/api/lesson/jobs'
    assert route['calls'][0]['callee']=='self.service.lessons.start'
    assert route['calls'][0]['arguments']==['payload']


def test_void_local_response_writer_is_an_effect_not_an_invented_return_value():
    source='''class Handler:
    def respond(self, payload):
        self.response.write(payload)
    def run(self, payload):
        return self.respond(payload)
'''
    contract=python_interface(source,'Handler.run')
    assert not any(o['kind']=='return' for o in contract['outputs'])
