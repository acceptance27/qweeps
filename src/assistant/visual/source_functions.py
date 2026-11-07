"""Source-backed function lessons. Parse source; never import or execute it."""
from __future__ import annotations
import ast
import copy
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess


def stable_id(prefix, value):
    return prefix+'-'+hashlib.sha256(value.encode()).hexdigest()[:16]


def symbol_key(file, symbol):
    return file+':'+symbol['name']+':'+str(symbol['line'])


def short(value, size=200):
    return re.sub(r'\s+', ' ', str(value)).strip()[:size] or 'source statement'


_PYTHON_CACHE = {}


def python_symbols(source):
    key=hashlib.sha256(source.encode()).hexdigest()
    if key in _PYTHON_CACHE:return _PYTHON_CACHE[key]
    tree=ast.parse(source)
    source_bytes=source.encode();offsets=[];offset=0
    for line in source_bytes.splitlines(keepends=True):offsets.append(offset);offset+=len(line)
    def segment(node):return source_bytes[offsets[node.lineno-1]+node.col_offset:offsets[node.end_lineno-1]+node.end_col_offset].decode()
    def expression(node):return short(ast.unparse(node)) if node is not None else 'None'
    def calls(node):
        class Visitor(ast.NodeVisitor):
            names=[]
            def visit_Call(self,n):self.names.append(expression(n.func));self.generic_visit(n)
            def visit_FunctionDef(self,n):pass
            visit_AsyncFunctionDef=visit_FunctionDef
            def visit_Lambda(self,n):pass
        v=Visitor();v.names=[];v.visit(node);return list(dict.fromkeys(v.names))[:12]
    def statements(nodes,depth=0):
        result=[]
        for n in nodes[:24]:
            row={'kind':type(n).__name__,'line':n.lineno,'end':n.end_lineno,'text':short(segment(n) or ast.unparse(n),220),'calls':calls(n)}
            if depth<3:
                if isinstance(n,ast.If):row.update(test=expression(n.test),then=statements(n.body,depth+1),**{'else':statements(n.orelse,depth+1)})
                elif isinstance(n,(ast.For,ast.AsyncFor,ast.While)):
                    row.update(test=expression(n.test) if isinstance(n,ast.While) else expression(n.target)+' in '+expression(n.iter),body=statements(n.body,depth+1),**{'else':statements(n.orelse,depth+1)})
                elif isinstance(n,(ast.Try,ast.TryStar)):
                    row.update(body=statements(n.body,depth+1),handler=[op for handler in n.handlers for op in statements(handler.body,depth+1)],finallyBody=statements(n.finalbody,depth+1))
            if isinstance(n,ast.Return):row['result']=expression(n.value)
            result.append(row)
        return result
    result=[]
    def walk(nodes,scope=()):
        for node in nodes:
            if isinstance(node,ast.ClassDef):walk(node.body,(*scope,node.name))
            elif isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)):
                signature=('async ' if isinstance(node,ast.AsyncFunctionDef) else '')+'def '+node.name+'('+ast.unparse(node.args)+')'
                if node.returns:signature+=' -> '+ast.unparse(node.returns)
                result.append({'name':'.'.join((*scope,node.name)),'kind':'function','line':node.lineno,'end':node.end_lineno,'signature':short(signature,300),
                    'parameters':[arg.arg for arg in [*node.args.posonlyargs,*node.args.args,*node.args.kwonlyargs]]+([node.args.vararg.arg] if node.args.vararg else [])+([node.args.kwarg.arg] if node.args.kwarg else []),
                    'description':short(ast.get_docstring(node) or '',250) if ast.get_docstring(node) else '', 'body':statements(node.body)})
                walk(node.body,(*scope,node.name))
            else:
                for field in ('body','orelse','finalbody'):
                    value=getattr(node,field,None)
                    if isinstance(value,list):walk(value,scope)
    walk(tree.body)
    if len(_PYTHON_CACHE)>=8:_PYTHON_CACHE.pop(next(iter(_PYTHON_CACHE)))
    _PYTHON_CACHE[key]=result
    return result


_JAVASCRIPT_CACHE = {}


def javascript_index(path):
    source=Path(path).read_text(errors='replace');key=hashlib.sha256(source.encode()).hexdigest()
    if key in _JAVASCRIPT_CACHE:return _JAVASCRIPT_CACHE[key]
    node=shutil.which('node')
    if not node:return {'symbols':[],'imports':[],'error':'Node.js is required for TypeScript/JavaScript function inspection'}
    try:
        parsed=subprocess.run([node,str(Path(__file__).with_name('source_index.mjs'))],input=json.dumps([{'path':str(path),'source':source}]),capture_output=True,text=True,timeout=30,check=True)
        result=json.loads(parsed.stdout)[0]
    except (subprocess.SubprocessError,ValueError,IndexError) as exc:
        result={'symbols':[],'imports':[],'error':'Source parser unavailable: '+short(str(exc),150)}
    if len(_JAVASCRIPT_CACHE)>=32:_JAVASCRIPT_CACHE.pop(next(iter(_JAVASCRIPT_CACHE)))
    _JAVASCRIPT_CACHE[key]=result
    return result


def index_functions(records):
    result={};warnings=[]
    for record in records:
        path=Path(record['resolved'])
        if path.suffix=='.py':
            try:result[record['rel']]=python_symbols(path.read_text(errors='replace'))
            except SyntaxError as exc:result[record['rel']]=[];warnings.append(record['rel']+': '+str(exc)[:120])
        else:
            parsed=javascript_index(path);result[record['rel']]=parsed['symbols']
            if parsed.get('error'):warnings.append(record['rel']+': '+parsed['error'])
    return result,warnings


def evidence(file,line):return [{'kind':'file','path':file,'lines':[line]}]


def node_for(file,id,label,line,description,kind='transform',color='blue',**extra):
    return {'id':id,'label':short(label,65),'kind':kind,'color':color,'description':short(description,1200),'defaultPreview':short(description,300),
            'codeReference':{'file':file,'lines':[line]},'confidence':'exact','evidence':evidence(file,line),'structure':'source',**extra}


def op_style(op):
    kind=op['kind'];text=op['text']
    if kind in ('Return','ReturnStatement'):return 'Return '+short(op.get('result','value'),44),'output','green'
    if kind in ('If','IfStatement'):return 'Check '+short(op.get('test','condition'),42),'search','gold'
    if kind in ('For','AsyncFor','While','ForStatement','ForOfStatement','ForInStatement','WhileStatement','DoWhileStatement'):return 'Loop: '+short(op.get('test','condition'),42),'search','purple'
    if kind in ('Raise','ThrowStatement'):return 'Raise / throw','output','coral'
    if kind in ('Try','TryStar','TryStatement'):return 'Try / exception handling','transform','gold'
    if op.get('calls'):return short(op['calls'][0]+'()',55),'transform','blue'
    if kind in ('Assign','AnnAssign','AugAssign','VariableDeclaration'):return 'Assign '+short(text.split('=')[0].replace('const ','').replace('let ',''),42),'transform','green'
    return short(text,56),'transform','muted'


def operation_graph(file,symbol):
    """A bounded syntactic control-flow view, including branches and loop returns."""
    nodes=[];edges=[];budget=30
    def add(op):
        label,kind,color=op_style(op);id=stable_id('op',symbol_key(file,symbol)+str(op['line'])+str(len(nodes)))
        from .source_interfaces import semantic_operation
        teaching_label,teaching_description=semantic_operation(op)
        row=node_for(file,id,label,op['line'],op['text'],kind,color,sourceKind='operation',teachingLabel=teaching_label,teachingDescription=teaching_description)
        row['evidence'][0]['lines']=list(dict.fromkeys([op['line'],op.get('end',op['line'])]));nodes.append(row)
        return id
    def connect(a,b,label,line):
        if not a or not b:return
        id=stable_id('control',a+b+label)
        if any(e['id']==id for e in edges):return
        edges.append({'id':id,'source':a,'target':b,'label':label,'relationship':'control','description':'Syntactic control-flow possibility; not recorded execution.','confidence':'exact','evidence':evidence(file,line)})
    def build(ops,reserve=0):
        first=None;exits=[]
        for index,op in enumerate(ops):
            if len(nodes)>=budget-reserve:break
            current=add(op);first=first or current
            for previous,label in exits:connect(previous,current,label,op['line'])
            kind=op['kind'];remaining=reserve+len(ops)-index-1
            if kind in ('If','IfStatement'):
                yes,yes_exits=build(op.get('then',[])[:3],remaining);no,no_exits=build(op.get('else',[])[:3],remaining)
                if yes:connect(current,yes,'true branch',op['line'])
                if no:connect(current,no,'false branch',op['line'])
                exits=(yes_exits if yes else [(current,'true branch')])+(no_exits if no else [(current,'false branch')])
            elif kind in ('For','AsyncFor','While','ForStatement','ForOfStatement','ForInStatement','WhileStatement','DoWhileStatement'):
                body,ends=build(op.get('body',[])[:3],remaining)
                if body:connect(current,body,'loop body',op['line'])
                for end,_ in ends:connect(end,current,'next iteration',op['line'])
                exits=[(current,'loop ends')]
            elif kind in ('Try','TryStar','TryStatement'):
                body,ends=build(op.get('body',[])[:2],remaining);handler,handler_ends=build(op.get('handler',[])[:2],remaining)
                if body:connect(current,body,'try body',op['line'])
                if handler:connect(current,handler,'exception handler',op['line'])
                exits=ends+handler_ends or [(current,'source continuation')]
            elif kind in ('Return','ReturnStatement','Raise','ThrowStatement','Break','BreakStatement','Continue','ContinueStatement'):exits=[]
            else:exits=[(current,'next statement')]
        return first,exits
    entry=node_for(file,stable_id('signature',symbol_key(file,symbol)),symbol['name']+'()',symbol['line'],symbol['signature'],'input','blue',sourceKind='signature',parameters=symbol['parameters'])
    nodes.append(entry);first,exits=build(symbol['body'][:24])
    if first:connect(entry['id'],first,'function body',symbol['line'])
    if len(nodes)==1:
        nodes.append(node_for(file,stable_id('empty',entry['id']),'Body / declaration',symbol['line'],'No executable body is present in this source declaration.','output','muted',sourceKind='operation'))
        connect(entry['id'],nodes[-1]['id'],'declaration',symbol['line'])
    return {'id':stable_id('body',symbol_key(file,symbol)),'title':short(symbol['name']+' — source operations',160),'nodes':nodes,'edges':edges}


def code_excerpt(record,lines):
    source=Path(record['resolved']).read_text(errors='replace').splitlines()
    wanted=set(lines)
    for at in list(wanted):wanted.update(range(max(1,at-1),min(len(source)+1,at+3)))
    return {'file':record['rel'],'language':'python' if record['rel'].endswith('.py') else 'typescript',
            'lines':[{'lineNumber':at,'text':source[at-1].replace('\t','    ')[:600],'explanation':'Source line '+str(at)} for at in sorted(wanted) if 1<=at<=len(source)][:400]}


def module_steps(graph,file,summary):
    nodes=graph['nodes'];chunks=[nodes[:1]]+[nodes[i:i+2] for i in range(1,len(nodes),2)]
    steps=[]
    for index,group in enumerate(chunks):
        if not group:continue
        ids=[n['id'] for n in group][:8];active=[e['id'] for e in graph['edges'] if e['source'] in ids or e['target'] in ids][:12]
        texts=' '.join(n.get('teachingDescription',n['description']) for n in group[:3])
        narration=short(f'{summary} Focus on '+', '.join(n.get('teachingLabel',n['label']) for n in group[:3])+'. '+texts+'.',1700)
        steps.append({'id':'inspect-'+str(index+1),'title':short(group[0].get('teachingLabel',group[0]['label']),100),'question':'What does this part of the source declare?',
            'narration':narration,'insight':short(texts,350),'safeguard':'Static source inspection, not execution. Branches describe possible paths; dynamic dispatch may differ.',
            'duration':max(8,min(70,len(narration.split())/2.3+2)),
            'flow':{'focusNodes':ids,'activeEdges':active,'packets':[],'code':{'file':file,'lines':[n['codeReference']['lines'][0] for n in group[:6]]},
                    'stateBefore':{},'stateAfter':{},'nodeDataBefore':{},'nodeDataAfter':{}}})
    return steps


def attach_source_functions(architecture,records,question=''):
    """Folder → file → selected callable → real operation graph, within 48 modules."""
    indexed,warnings=index_functions(records)
    files={f['file']:f for f in architecture['codeFiles']}
    record_map={r['rel']:r for r in records}
    modules={};selected={}
    words=set(re.findall(r'[a-z]+',question.lower()))
    for record in records:
        symbols=indexed.get(record['rel'],[])
        def score(s):
            name=s['name'].split('.')[-1]
            return (-len(set(re.findall(r'[a-z]+',name.lower()))&words)*5-(2 if name in {'start','review','serve','compile_speech','render','prepare','_prepare','do_POST'} else 0)+(4 if name.startswith('__') else 0)+max(0,s['name'].count('.')-1)*10,s['line'])
        selected[record['rel']]=sorted(symbols,key=score)[:2]
    reserve=sum(bool(v) for v in selected.values())+sum(bool(n.get('children')) for n in architecture['graph']['nodes'])
    remaining=48-reserve-sum(map(len,selected.values()))
    for record in records:
        more=[s for s in indexed.get(record['rel'],[]) if s not in selected[record['rel']]]
        if more and remaining>0:selected[record['rel']].append(sorted(more,key=score)[0]);remaining-=1
    for record in records:
        file=record['rel'];symbols=selected[file]
        if not symbols:continue
        function_nodes=[];body_graphs=[]
        for symbol in symbols:
            fid=stable_id('function',symbol_key(file,symbol));g=operation_graph(file,symbol);body_graphs.append(g)
            excerpt=code_excerpt(record,range(symbol['line'],min(symbol['end']+1,symbol['line']+396)))
            summary=(symbol['description'] or 'Follow this function from its inputs to its results and outward changes.')[:500]
            from .source_interfaces import symbol_interface,with_function_interface
            modules[fid]=with_function_interface({'id':fid,'title':short(symbol['name']+'()',160),'summary':summary,'view':'source','graph':g,'codeFiles':[excerpt],'steps':module_steps(g,file,summary)},symbol_interface(Path(record['resolved']).read_text(errors='replace'),file,symbol))
            previews=[n for n in g['nodes'] if n['kind']!='input'][:4]
            child_ids={n['id'] for n in previews}
            function_nodes.append(node_for(file,stable_id('symbol',symbol_key(file,symbol)),symbol['name']+'()',symbol['line'],summary,
                drillDownFunctionId=fid,sourceKind='function',parameters=symbol['parameters'],signature=symbol['signature'],
                children=[{'id':n['id'],'label':n['label'],'description':n['description'][:300],'value':'L'+str(n['codeReference']['lines'][0]),'color':n['color'],'icon':'FileCode2','codeReference':n['codeReference']} for n in previews],
                connections=[{'id':e['id'],'from':{'child':e['source']},'to':{'child':e['target']},'label':e['label'],'relationship':'control'} for e in g['edges'] if e['source'] in child_ids and e['target'] in child_ids]))
        file_id=stable_id('file',file);graph={'id':file_id+'-symbols','title':file,'nodes':function_nodes,'edges':[]}
        # A source call links selected symbols only when its lexical target is unambiguous.
        for symbol,node in zip(symbols,function_nodes):
            for call in {c for op in symbol['body'] for c in op.get('calls',[])}:
                target_name=(symbol['name'].rsplit('.',1)[0]+'.'+call[5:]) if call.startswith('self.') and '.' in symbol['name'] else call
                targets=[(s,n) for s,n in zip(symbols,function_nodes) if s['name']==target_name]
                if len(targets)!=1 or targets[0][1]['id']==node['id']:continue
                target=targets[0][1];eid=stable_id('call',node['id']+target['id'])
                if any(e['id']==eid for e in graph['edges']):continue
                graph['edges'].append({'id':eid,'source':node['id'],'target':target['id'],'label':'references '+short(call,60),'relationship':'reference','description':'Inferred lexical call target; not a recorded invocation.','confidence':'inferred','evidence':evidence(file,symbol['line'])})
        lines={n['codeReference']['lines'][0] for n in function_nodes}
        for g in body_graphs:lines.update(n['codeReference']['lines'][0] for n in g['nodes'])
        excerpt=code_excerpt(record,lines);summary=f'{file}: {len(symbols)} selected functions/methods out of {len(indexed[file])}. Inspect a function to see its real body and possible control paths.'
        for symbol, function_node in zip(symbols,function_nodes):
            for line in excerpt['lines']:
                if line['lineNumber']==symbol['line']:
                    line['drillDownFunctionId']=function_node['drillDownFunctionId'];line['goalText']=function_node['description']
        modules[file_id]={'id':file_id,'title':file,'summary':summary,'view':'source','graph':graph,'codeFiles':[excerpt],'steps':module_steps(graph,file,summary)}
        # Retain the root source excerpt and augment it with callable definitions.
        by_line={line['lineNumber']:line for line in files[file]['lines']}
        definition_lines={s['line'] for s in symbols}
        by_line.update({line['lineNumber']:line for line in excerpt['lines'] if line['lineNumber'] in definition_lines})
        for symbol,node in zip(symbols,function_nodes):
            by_line[symbol['line']]={**by_line[symbol['line']],'drillDownFunctionId':node['drillDownFunctionId'],'goalText':node['description']}
        files[file]['lines']=[by_line[k] for k in sorted(by_line)][:400]
        for parent in architecture['graph']['nodes']:
            if parent.get('codeReference',{}).get('file')==file and not parent.get('children'):parent['drillDownFunctionId']=file_id
            for child in parent.get('children',[]):
                if child.get('codeReference',{}).get('file')==file:child['drillDownFunctionId']=file_id;child['value']=str(len(symbols))+' functions · inspect'
    for parent in architecture['graph']['nodes']:
        if not parent.get('children'):continue
        fid=stable_id('folder',parent['id']);g={'id':fid+'-files','title':parent['label'],'nodes':[],'edges':[]}
        for child in parent['children']:
            file=child['codeReference']['file'];ref=child['codeReference'];g['nodes'].append(node_for(file,child['id'],child['label'],ref['lines'][0],child['description'],drillDownFunctionId=child.get('drillDownFunctionId'),sourceKind='file'))
        for conn in parent.get('connections',[]):
            source=next(n for n in g['nodes'] if n['id']==conn['from']['child']);g['edges'].append({'id':conn['id'],'source':conn['from']['child'],'target':conn['to']['child'],'label':conn['label'],'relationship':'reference','description':'Static file import.','confidence':'exact','evidence':conn.get('evidence') or source['evidence']})
        used={n['codeReference']['file'] for n in g['nodes']};source_files=[files[f] for f in files if f in used]
        summary=parent['label']+': inspect a source file, then a function. References are static imports, not runtime inputs.'
        modules[fid]={'id':fid,'title':parent['label'],'summary':summary,'view':'source','graph':g,'codeFiles':source_files,'steps':module_steps(g,source_files[0]['file'],summary)}
        # Folder steps can reference several files; bind each to its first focused file.
        for step in modules[fid]['steps']:
            node=next(n for n in g['nodes'] if n['id']==step['flow']['focusNodes'][0]);step['flow']['code']=node['codeReference']
        parent['drillDownFunctionId']=fid
    architecture['functionCatalog']=[{'id':stable_id('function',symbol_key(file,symbol)),'name':symbol['name'],'file':file,'line':symbol['line'],'end':symbol['end'],'signature':symbol['signature'],'parentFunctionId':stable_id('file',file)} for file,symbols in indexed.items() for symbol in symbols][:2048]
    architecture['functions']=modules
    architecture['limitations'].extend(warnings[:3])
    architecture['limitations'].append('Function inspection shows a bounded selection of callable bodies and syntactic control paths. It does not execute the repository or resolve all dynamic calls.')
    return architecture


def materialize_function(source,file,name,line=None):
    """Build a selected callable view from a pinned source snapshot."""
    import tempfile
    if file.endswith('.py'):symbols=python_symbols(source)
    else:
        with tempfile.TemporaryDirectory(prefix='qweeps-parse-') as temp:
            path=Path(temp)/Path(file).name;path.write_text(source)
            parsed=javascript_index(path)
            if parsed.get('error'):
                from .plan import PlanError
                raise PlanError(parsed['error'])
            symbols=parsed['symbols']
    symbol=next((s for s in symbols if s['name']==name and (line is None or s['line']==line)),None)
    if not symbol:
        from .plan import PlanError
        raise PlanError('The indexed function is absent from the saved source snapshot')
    g=operation_graph(file,symbol);source_lines=source.splitlines();wanted=set(range(symbol['line'],min(symbol['end']+1,symbol['line']+396)))
    for at in list(wanted):wanted.update(range(max(1,at-1),min(len(source_lines)+1,at+3)))
    code={'file':file,'language':'python' if file.endswith('.py') else 'typescript','lines':[{'lineNumber':at,'text':source_lines[at-1].replace('\t','    ')[:600],'explanation':'Source line '+str(at)} for at in sorted(wanted) if at<=len(source_lines)][:400]}
    summary=(symbol['description'] or 'Follow this function from its inputs to its results and outward changes.')[:500]
    from .source_interfaces import symbol_interface,with_function_interface
    return with_function_interface({'id':stable_id('function',symbol_key(file,symbol)),'title':short(name+'()',160),'summary':summary,'view':'source','graph':g,'codeFiles':[code],'steps':module_steps(g,file,summary)},symbol_interface(source,file,symbol))
