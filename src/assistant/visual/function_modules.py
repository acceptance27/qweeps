"""Build inspectable function lessons from the authored, shared operation contract."""
from __future__ import annotations
import copy
import re
from .plan import PlanError
from .source_functions import stable_id, short,python_symbols,operation_graph,module_steps


def complete_authored_functions(raw, *, rebuild=False):
    """One renderer contract for new Learn/Design subjects, not a RAG-only fixture.

    A container already describes its internals. Expand that same data into a
    navigable module rather than silently dropping its Inspect Function action.
    Source-backed repositories use the parser's modules instead.
    """
    if not isinstance(raw,dict) or raw.get('grounding')=='source-backed' or raw.get('renderContract')=='reference':return raw
    value=copy.deepcopy(raw)
    if rebuild:value['functions']={}
    modules=value.setdefault('functions',{})
    if not isinstance(modules,dict):return value
    files=value.get('codeFiles') or []
    if not files:return value
    for node in value.get('graph',{}).get('nodes',[]):
        children=node.get('children') or []
        if not children:
            if node.get('kind') in {'input','store','output'}:continue
            # A model may supply the actual local function without duplicating
            # its body as diagram operations. Derive that view from the same
            # displayed Python source instead of showing a dead-end card.
            ref=node.get('codeReference') or {}
            candidates=[]
            for file in files:
                if file.get('language','python')!='python':continue
                if ref.get('file') and file['file']!=ref['file']:continue
                count=max(line['lineNumber'] for line in file['lines']);source=['']*count
                for line in file['lines']:source[line['lineNumber']-1]=line['text']
                try:symbols=python_symbols('\n'.join(source))
                except SyntaxError:continue
                for symbol in symbols:
                    name=node['label'].split('(')[0].strip()
                    if (ref.get('lines') and symbol['line'] in ref['lines']) or symbol['name']==name:candidates.append((file,symbol))
            if len(candidates)==1:
                file,symbol=candidates[0];fid=node.get('drillDownFunctionId') or stable_id('inspect',node['id'])
                if fid not in modules and len(modules)<48:
                    graph=operation_graph(file['file'],symbol)
                    for row in graph['nodes']:row['confidence']='illustrative'
                    for edge in graph['edges']:edge['confidence']='illustrative'
                    summary=node['description']
                    modules[fid]={'id':fid,'title':node['label'],'summary':summary,'view':'source','graph':graph,'codeFiles':[file],'steps':module_steps(graph,file['file'],summary)}
                    preview_ids={row['id']:stable_id('preview',node['id']+row['id']) for row in graph['nodes']}
                    node['children']=[{'id':preview_ids[row['id']],'label':row['label'],'description':row['description'][:300],'color':row['color'],'value':'L'+str(row['codeReference']['lines'][0]),'codeReference':row['codeReference']} for row in graph['nodes'] if row['kind']!='input'][:4]
                    ids={original for original,preview in preview_ids.items() if preview in {row['id'] for row in node['children']}}
                    node['connections']=[{'id':stable_id('preview-edge',node['id']+edge['id']),'from':{'child':preview_ids[edge['source']]},'to':{'child':preview_ids[edge['target']]},'label':edge['label'],'relationship':'control'} for edge in graph['edges'] if edge['source'] in ids and edge['target'] in ids]
                    node['drillDownFunctionId']=fid
            continue
        fid=node.get('drillDownFunctionId') or stable_id('inspect',node['id'])
        if fid in modules:node['drillDownFunctionId']=fid;continue
        if len(modules)>=48:break
        graph={'id':fid+'-operations','title':node['label'],'nodes':[],'edges':[]}
        for child in children:
            code=child.get('codeReference')
            if not code:
                name=child['label'].split('(')[0].strip()
                matches=[{'file':file['file'],'lines':[line['lineNumber']]} for file in files for line in file['lines'] if name and re.search(r'\b'+re.escape(name)+r'\b',line['text'])]
                code=matches[0] if len(matches)==1 else None
            if not code:raise PlanError('Internal operation '+child['id']+' needs a codeReference to its actual displayed source line before building Inspect Function')
            row={'id':child['id'],'label':child['label'],'kind':'transform','color':child.get('color',node.get('color','blue')),
                 'description':child.get('description') or child['label'],'defaultPreview':child.get('value') or child.get('description') or child['label'],
                 'codeReference':copy.deepcopy(code),'confidence':'illustrative','evidence':copy.deepcopy(child.get('evidence') or node.get('evidence') or [])}
            if child.get('visual'):row['visual']=copy.deepcopy(child['visual'])
            if child.get('valueRef'):row['valueRef']=child['valueRef']
            if child.get('drillDownFunctionId') in modules:row['drillDownFunctionId']=child['drillDownFunctionId']
            graph['nodes'].append(row)
        for conn in node.get('connections') or []:
            graph['edges'].append({'id':conn['id'],'source':conn['from']['child'],'target':conn['to']['child'],'label':conn.get('label') or 'transfer',
                                  'relationship':conn.get('relationship','data'),'description':conn.get('label') or 'Authored operation connection','confidence':'illustrative'})
        steps=[]
        for i,op in enumerate(graph['nodes']):
            code=op['codeReference'];incoming=[e for e in graph['edges'] if e['target']==op['id']]
            narration=short((f"The preceding operation feeds {op['label']}. " if incoming else f"Inspect {op['label']}. ")+op['description']+'. '+op['defaultPreview'],1600)
            steps.append({'id':f'operation-{i+1}','title':op['label'],'question':f"What does {op['label']} contribute?",'narration':narration,
                          'insight':short(op['description'],350),'safeguard':'Prepared teaching example; the displayed source is not executed by this diagram.',
                          'duration':max(8,min(70,len(narration.split())/2.3+2)),
                          'flow':{'focusNodes':[op['id']],'activeEdges':[e['id'] for e in incoming],'packets':[],'code':code,'stateBefore':{},'stateAfter':{},
                                  'nodeDataBefore':{},'nodeDataAfter':{op['id']:{'statusLabel':'Prepared example','previewLines':[op['defaultPreview']]}}}})
        used={n['codeReference']['file'] for n in graph['nodes']}
        modules[fid]={'id':fid,'title':node['label'],'summary':node['description'],'view':'visual' if any(n.get('visual') for n in graph['nodes']) else 'function',
                      'graph':graph,'codeFiles':[f for f in files if f['file'] in used],'steps':steps}
        node['drillDownFunctionId']=fid
    # Keep interface details available for novel Learn/Design modules as well.
    from .source_interfaces import python_interface,with_function_interface
    for fid,module in modules.items():
        if module.get('interface'):continue
        parent=next((n for n in value.get('graph',{}).get('nodes',[]) if n.get('drillDownFunctionId')==fid),None)
        contract=None
        for file in module.get('codeFiles',[]):
            if file.get('language','python')!='python':continue
            lines=file['lines'];source=['']*max(row['lineNumber'] for row in lines)
            for row in lines:source[row['lineNumber']-1]=row['text']
            source='\n'.join(source)
            try:
                candidates=[symbol for symbol in python_symbols(source) if symbol['name'].split('.')[-1]==module['title'].split('(')[0].strip().split('.')[-1]]
                if len(candidates)==1:contract=python_interface(source,candidates[0]['name'],candidates[0]['line']);break
            except (SyntaxError,ValueError):pass
        if contract:
            module['interface']=contract
            if module['graph']['nodes'][0].get('sourceKind')=='signature':modules[fid]=with_function_interface(module,contract)
        elif parent and any((parent.get('ports') or {}).values()):
            module['interface']={'basis':'Authored example contract, not recorded execution.',**{key:[{'name':p['label'],'description':p.get('data') or p['label'],'kind':'input' if key=='inputs' else 'output'} for p in (parent.get('ports') or {}).get(key,[])] for key in ('inputs','outputs')}}
    return value


def architecture_context(architecture):
    """Keep chapter planning bounded; complete inspect modules stay in the lesson."""
    if not architecture:return architecture
    context={k:v for k,v in architecture.items() if k not in {'functions','functionCatalog','sourceSnapshots'}}
    context['functionIndex']=[{'id':id,'title':fn['title'],'summary':fn['summary'][:250],'nodes':len(fn['graph']['nodes'])} for id,fn in architecture.get('functions',{}).items()]
    return context


def recover_architecture_skeleton(raw):
    """Recover only a complete root followed by a truncated optional modules map.

    No incomplete code, graph, example or scalar is repaired. Function internals
    are derived from the already complete source/operation contract instead.
    """
    import json
    text=raw.strip()
    if not text.startswith('{'):return raw
    decoder=json.JSONDecoder();position=1;result={}
    while position<len(text):
        while position<len(text) and text[position] in ' \t\r\n,':position+=1
        try:key,end=decoder.raw_decode(text,position)
        except ValueError:return raw
        if not isinstance(key,str):return raw
        position=end
        while position<len(text) and text[position].isspace():position+=1
        if position>=len(text) or text[position]!=':':return raw
        position+=1
        while position<len(text) and text[position].isspace():position+=1
        try:value,end=decoder.raw_decode(text,position)
        except ValueError:
            if key=='functions' and {'version','grounding','codeFiles','graph'}<=result.keys() and result['codeFiles'] and isinstance(result['graph'],dict):
                result['functions']={}
                return json.dumps(result,ensure_ascii=False)
            return raw
        result[key]=value;position=end
        while position<len(text) and text[position].isspace():position+=1
        if position<len(text) and text[position]=='}':return raw
    return raw
