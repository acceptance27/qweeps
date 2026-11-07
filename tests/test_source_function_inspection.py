from pathlib import Path
from assistant.visual.repo_architecture import scan_repository
from assistant.visual.architecture_flow import validate_architecture


def test_python_inspection_links_file_to_function_to_true_and_false_source_branches(tmp_path):
    (tmp_path/'api').mkdir();(tmp_path/'web').mkdir()
    (tmp_path/'api'/'server.py').write_text('def handle(question):\n    if not question:\n        return None\n    answer = retrieve(question)\n    return answer\n')
    (tmp_path/'web'/'player.py').write_text('def show(lesson):\n    return lesson\n')
    architecture=validate_architecture(scan_repository(tmp_path,question='Trace request handling and playback'))
    child=next(c for n in architecture['graph']['nodes'] for c in n.get('children',[]) if c['label']=='server.py')
    file=architecture['functions'][child['drillDownFunctionId']]
    function=next(n for n in file['graph']['nodes'] if n['label']=='handle()')
    body=architecture['functions'][function['drillDownFunctionId']]
    assert body['view']=='source'
    labels={e['label'] for e in body['graph']['edges']}
    assert {'true branch','false branch'}<=labels
    nodes={n['id']:n for n in body['graph']['nodes']}
    for e in body['graph']['edges']:
        if nodes[e['source']]['kind']=='output' and nodes[e['target']].get('sourceKind')!='result':raise AssertionError('Return cannot fall through to a subsequent source operation')
    assert all(s['flow']['packets']==[] and s['flow']['stateAfter']=={} for s in body['steps'])
    assert all(n['evidence'] and n['codeReference']['file']=='api/server.py' for n in body['graph']['nodes'])


def test_tsx_parser_indexes_actual_functions_and_ignores_imports_in_comments_and_strings(tmp_path):
    (tmp_path/'ui').mkdir();(tmp_path/'api').mkdir()
    (tmp_path/'ui'/'Player.tsx').write_text('import { build } from "../api/build";\n// import { fake } from "./fake"\nconst text = "import pretend from something";\nexport function Player({ready}: {ready: boolean}) {\n  if (ready) return <div>{build()}</div>;\n  return <span>Wait</span>;\n}\nexport const double = (n: number) => n * 2;\n')
    (tmp_path/'api'/'build.ts').write_text('export function build() { return "lesson"; }\n')
    architecture=validate_architecture(scan_repository(tmp_path))
    names={n['label'] for f in architecture['functions'].values() for n in f['graph']['nodes']}
    assert {'Player()','double()','build()'}<=names
    assert not any('fake' in e['label'] or 'pretend' in e['label'] for e in architecture['graph']['edges'])
    double=next(f for f in architecture['functions'].values() if f['title']=='double()')
    assert any('n * 2' in n['description'] for n in double['graph']['nodes'])


def test_unsampled_import_targets_are_not_redirected_into_an_unrelated_file_container(tmp_path):
    (tmp_path/'ui').mkdir();(tmp_path/'lib').mkdir()
    (tmp_path/'ui'/'Player.ts').write_text('import { a } from "../lib/Hidden";\nexport function player() { return a; }\n')
    (tmp_path/'lib'/'Hidden.ts').write_text('export function a() { return 1; }\n')
    (tmp_path/'lib'/'Server.ts').write_text('export function server() { return 2; }\n')
    architecture=validate_architecture(scan_repository(tmp_path,max_files=2,question='Player Server'))
    paths={f['file'] for f in architecture['codeFiles']}
    assert paths=={'ui/Player.ts','lib/Server.ts'}
    assert architecture['graph']['edges']==[]


def test_generated_function_modules_keep_actual_source_and_shared_ids_are_not_rag_modules(tmp_path):
    (tmp_path/'app.py').write_text('def embed(value):\n    return value + 1\n')
    architecture=validate_architecture(scan_repository(tmp_path))
    assert architecture['functions']
    body=next(f for f in architecture['functions'].values() if f['title']=='embed()')
    assert body['id'].startswith('function-')
    assert body['codeFiles'][0]['file']=='app.py'
    assert any('value + 1' in n['defaultPreview'] for n in body['graph']['nodes'])


def test_generic_learning_containers_expand_to_real_inspect_modules_without_rag_data():
    from assistant.visual.function_modules import complete_authored_functions
    code={'file':'queue.py','language':'python','lines':[{'lineNumber':1,'text':'def run(q): return send(take(q))'}]}
    raw={'version':1,'grounding':'illustrative','codeFiles':[code],'graph':{'id':'queue','title':'Queue','nodes':[{'id':'worker','label':'run()','kind':'transform','description':'Drain pending messages','children':[{'id':'take','label':'take()','color':'blue','description':'Take the next pending message','value':'message A'},{'id':'send','label':'send()','color':'green','description':'Deliver the selected message','value':'delivered'}],'connections':[{'id':'take-send','from':{'child':'take'},'to':{'child':'send'},'label':'message','relationship':'data'}]}],'edges':[]},'functions':{}}
    architecture=validate_architecture(complete_authored_functions(raw))
    fid=architecture['graph']['nodes'][0]['drillDownFunctionId'];fn=architecture['functions'][fid]
    assert [n['label'] for n in fn['graph']['nodes']]==['take()','send()']
    assert fn['graph']['edges'][0]['id']=='take-send'
    assert all(f['file']=='queue.py' for f in fn['codeFiles'])
    assert raw['functions']=={}


def test_learning_function_with_only_displayed_code_gains_an_inspector_from_that_body():
    from assistant.visual.function_modules import complete_authored_functions
    raw={'version':1,'grounding':'illustrative','codeFiles':[{'file':'worker.py','language':'python','lines':[
        {'lineNumber':1,'text':'def worker(job):'}, {'lineNumber':2,'text':'    if not job:'}, {'lineNumber':3,'text':'        return None'}, {'lineNumber':4,'text':'    return job["payload"]'}]}],
        'graph':{'id':'worker','title':'Worker','nodes':[{'id':'worker','label':'worker()','kind':'transform','color':'green','description':'Check the pending job before returning its payload.','codeReference':{'file':'worker.py','lines':[1]}}],'edges':[]},'functions':{}}
    result=validate_architecture(complete_authored_functions(raw))
    node=result['graph']['nodes'][0];assert node['children'];fn=result['functions'][node['drillDownFunctionId']]
    assert any(edge['label']=='true branch' for edge in fn['graph']['edges'])
    assert any('job[\'payload\']' in n['description'] or 'job["payload"]' in n['description'] for n in fn['graph']['nodes'])


def test_child_focus_becomes_parent_focus_plus_internal_operation_without_dropping_it():
    from assistant.visual.architecture_flow import step
    graph={'nodes':[{'id':'folder','children':[{'id':'server-file'}]}],'edges':[]}
    files=[{'file':'server.py','lines':[{'lineNumber':1,'text':'def serve(): pass'}]}]
    flow=step({'focusNodes':['server-file'],'code':{'file':'server.py','lines':[1]}},graph,files)
    assert flow['focusNodes']==['folder'];assert flow['focusOperations']==['server-file']


def test_truncated_optional_module_map_can_be_derived_only_after_source_and_graph_are_complete():
    import json
    from assistant.visual.function_modules import recover_architecture_skeleton
    complete={'version':1,'grounding':'illustrative','codeFiles':[{'file':'f.py','lines':[{'lineNumber':1,'text':'def f(): return 1'}]}],'graph':{'id':'g','title':'G','nodes':[],'edges':[]}}
    prefix=json.dumps(complete)[:-1]
    raw=prefix+', "functions": {"f":{"title":"unfinished'
    recovered=json.loads(recover_architecture_skeleton(raw))
    assert recovered=={**complete,'functions':{}}
    broken='{"version":1,"grounding":"illustrative","codeFiles":[{"file":"unfinished'
    assert recover_architecture_skeleton(broken)==broken


def test_function_catalog_covers_unsampled_functions_and_materializes_from_pinned_text(tmp_path):
    from assistant.visual.source_functions import materialize_function
    source='\n'.join(f'def helper_{i}(value):\n    return value + {i}\n' for i in range(12))
    (tmp_path/'helpers.py').write_text(source)
    raw=scan_repository(tmp_path,include_snapshots=True)
    architecture=validate_architecture(raw)
    assert len(architecture['functionCatalog'])==12
    selected={f['id'] for f in architecture['functions'].values()}
    entry=next(row for row in architecture['functionCatalog'] if row['id'] not in selected)
    (tmp_path/'helpers.py').write_text('raise RuntimeError("do not execute")')
    fn=materialize_function(raw['sourceSnapshots']['helpers.py'],'helpers.py',entry['name'])
    validated=validate_architecture({'version':1,'grounding':'source-backed','codeFiles':fn['codeFiles'],'graph':fn['graph'],'functions':{fn['id']:fn}})
    assert fn['id']==entry['id'];assert fn['id'] in validated['functions']
    assert any('value +' in n['description'] for n in fn['graph']['nodes'])


def test_same_name_javascript_callbacks_have_distinct_source_locations(tmp_path):
    from assistant.visual.source_functions import materialize_function
    source="export function player() {\n if (true) { const close = () => 1; }\n if (false) { const close = () => 2; }\n}\n"
    (tmp_path/'player.ts').write_text(source)
    raw=scan_repository(tmp_path,include_snapshots=True)
    architecture=validate_architecture(raw)
    callbacks=[x for x in architecture['functionCatalog'] if x['name']=='player.close']
    assert len(callbacks)==2 and len({x['id'] for x in callbacks})==2
    for entry in callbacks:
        module=materialize_function(source,entry['file'],entry['name'],entry['line'])
        assert module['id']==entry['id']
        assert module['graph']['nodes'][0]['codeReference']['lines']==[entry['line']]


def test_python_source_offsets_preserve_unicode_on_the_same_line():
    from assistant.visual.source_functions import python_symbols
    source='def choose():\n    value = "é文"; return value\n'
    symbol=python_symbols(source)[0]
    assert symbol['body'][0]['text']=='value = "é文"'
    assert symbol['body'][1]['text']=='return value'
