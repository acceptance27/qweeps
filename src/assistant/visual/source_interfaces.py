"""Declared function boundaries, extracted without executing inspected source."""
from __future__ import annotations
import ast
import copy
import re


def readable(value):
    value=re.sub(r'([a-z])([A-Z])',r'\1 \2',str(value))
    return re.sub(r'[_\s]+',' ',value).strip()


def python_interface(source,name,line=None):
    tree=ast.parse(source);found=[];definitions={}
    def walk(nodes,scope=()):
        for node in nodes:
            if isinstance(node,ast.ClassDef):walk(node.body,(*scope,node.name))
            elif isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)):
                qualified='.'.join((*scope,node.name));definitions[qualified]=node
                if qualified==name and (line is None or node.lineno==line):found.append(node)
                walk(node.body,(*scope,node.name))
            else:
                for key in ('body','orelse','finalbody'):
                    if isinstance(getattr(node,key,None),list):walk(getattr(node,key),scope)
    walk(tree.body)
    if len(found)!=1:raise ValueError('Choose one declared function location')
    fn=found[0];inputs=[];outputs=[]
    def item(name,description,kind,line):
        keys=re.findall(r"\[['\"]([^'\"]+)['\"]\]",name)
        label=readable(keys[-1] if keys else name.removeprefix('self.').removeprefix('cls.').replace('.',' '))
        if name in {'self','cls'}:label=description
        return {'name':name[:160],'label':label[:160],'description':description[:350],'kind':kind,'line':line}
    args=[*fn.args.posonlyargs,*fn.args.args,*fn.args.kwonlyargs]
    for arg in args:
        if arg.arg in {'self','cls'}:continue
        annotation=ast.unparse(arg.annotation) if arg.annotation else 'value supplied by the caller'
        inputs.append(item(arg.arg,annotation,'parameter',arg.lineno))
    for arg in [fn.args.vararg,fn.args.kwarg]:
        if arg:inputs.append(item(arg.arg,'Additional arguments supplied by the caller','parameter',arg.lineno))
    class Visit(ast.NodeVisitor):
        def visit_FunctionDef(self,n):pass
        visit_AsyncFunctionDef=visit_FunctionDef
        visit_Lambda=visit_FunctionDef
        def visit_Return(self,n):
            if n.value is None or (isinstance(n.value,ast.Constant) and n.value.value is None):
                outputs.append(item('no returned value','Returns without a value','completion',n.lineno))
            else:
                if isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Attribute) and isinstance(n.value.func.value,ast.Name) and n.value.func.value.id in {'self','cls'}:
                    target=definitions.get(name.rsplit('.',1)[0]+'.'+n.value.func.attr)
                    if isinstance(target,ast.FunctionDef):
                        class Returned(ast.NodeVisitor):
                            has_value=False
                            def visit_FunctionDef(self,n):pass
                            visit_AsyncFunctionDef=visit_FunctionDef
                            visit_Lambda=visit_FunctionDef
                            def visit_Return(self,n):
                                if n.value is not None and not (isinstance(n.value,ast.Constant) and n.value.value is None):self.has_value=True
                            def visit_Yield(self,n):self.has_value=True
                            visit_YieldFrom=visit_Yield
                        returned=Returned()
                        for statement in target.body:returned.visit(statement)
                        if not returned.has_value:
                            self.generic_visit(n);return
                expression=ast.unparse(n.value)
                label=expression if isinstance(n.value,(ast.Name,ast.Attribute)) else (ast.unparse(n.value.func).split('.')[-1]+' result' if isinstance(n.value,ast.Call) else 'returned '+type(n.value).__name__.lower())
                outputs.append(item(label,'Returned to the caller'+(' · '+ast.unparse(fn.returns) if fn.returns else ''),'return',n.lineno))
            self.generic_visit(n)
        def visit_Yield(self,n):outputs.append(item('yielded value','Produced for the caller to consume','yield',n.lineno));self.generic_visit(n)
        visit_YieldFrom=visit_Yield
        def visit_Call(self,n):
            if isinstance(n.func,ast.Attribute):
                method=n.func.attr;target=ast.unparse(n.func.value)
                if method in {'write','write_text','write_bytes','send','send_json','emit','put','append','extend','add','update','save','replace'}:
                    action={'send_json':'JSON response','write_text':'Saved text file','write_bytes':'Saved binary file','write':'Written content','append':'Appended item','extend':'Added items','update':'Updated state','put':'Queued item','emit':'Emitted event','save':'Saved content','replace':'Replaced content','send':'Sent message','add':'Added item'}[method]
                    outputs.append(item(target,action,'effect',n.lineno))
            self.generic_visit(n)
        def visit_Assign(self,n):
            for target in n.targets:
                if isinstance(target,(ast.Attribute,ast.Subscript)):
                    outputs.append(item(ast.unparse(target),'Updated state','effect',n.lineno))
            self.generic_visit(n)
        def visit_Attribute(self,n):
            if isinstance(n.ctx,ast.Load) and isinstance(n.value,ast.Name) and n.value.id in {'self','cls'}:
                # Bound dependencies are inputs too, but method calls are not arguments.
                if n.attr not in method_names:inputs.append(item(n.attr,'Read from the bound object or configured service','dependency',n.lineno))
            self.generic_visit(n)
    method_names={n.func.attr for n in ast.walk(fn) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute)}
    visit=Visit()
    for statement in fn.body:visit.visit(statement)
    def unique(items):
        result=[];seen=set()
        for row in items:
            key=(row['name'],row['kind'])
            if key not in seen:seen.add(key);result.append(row)
        return result[:16]
    outputs=sorted(unique(outputs),key=lambda o:{'return':0,'yield':1,'effect':2,'completion':3}.get(o['kind'],2));inputs=unique(inputs)
    if not outputs:outputs=[item('completion','Completes without a declared result or detected outward write','completion',fn.end_lineno)]
    return {'inputs':inputs,'outputs':outputs,'basis':'Declared interface and source-detected effects; no runtime values were recorded.'}


def symbol_interface(source,file,symbol):
    if file.endswith('.py'):return python_interface(source,symbol['name'],symbol['line'])
    # Babel supplies explicit returns and mutations, including later statements.
    return {'inputs':[{'name':p,'description':'Supplied by the caller','kind':'parameter','line':symbol['line']} for p in symbol.get('parameters',[])][:16],
            'outputs':symbol.get('outputs') or [{'name':'completion','description':'No returned value or outward effect was detected','kind':'completion','line':symbol['end']}],
            'basis':'Declared interface and source-detected effects; no runtime values were recorded.'}


def semantic_operation(op):
    """Readable source explanation; code remains retained as evidence."""
    kind=op['kind'];label=op.get('text','')
    if kind in {'If','IfStatement'}:return 'Choose a branch','Check the condition and follow its matching path.'
    if kind in {'For','AsyncFor','While','ForStatement','ForOfStatement','ForInStatement','WhileStatement','DoWhileStatement'}:return 'Repeat the operation','Process the loop body while its source condition allows it.'
    if kind in {'Try','TryStar','TryStatement'}:return 'Handle success or failure','Attempt the work and route a raised error to its declared handler.'
    if kind in {'Return','ReturnStatement'}:return 'Return to the caller','End this path and hand control back to the caller.'
    if kind in {'Raise','ThrowStatement'}:return 'Report a failure','Stop this path by raising the declared error.'
    if kind in {'Assign','AnnAssign','AugAssign','VariableDeclaration'}:
        target=label.split('=')[0].replace('const ','').replace('let ','').strip()
        return 'Update '+readable(target)[:40],'Store the result for later operations.'
    if op.get('calls'):
        name=op['calls'][0].split('.')[-1]
        return readable(name).capitalize()[:55],'Call this source operation and use its result or side effect.'
    return 'Prepare the next operation','Continue with the declared source operation.'


def with_function_interface(module,contract):
    from .source_functions import node_for,stable_id,module_steps
    result=copy.deepcopy(module);result['interface']=copy.deepcopy(contract)
    g=result['graph'];first=g['nodes'][0];file=result['codeFiles'][0]['file']
    first['label']='Function inputs';first['description']='Receives the incoming arguments and configured dependencies shown in this contract.' if contract['inputs'] else 'This function declares no caller arguments or detected bound dependencies.'
    first['defaultPreview']=first['description'];first['interface']={'inputs':contract['inputs'],'outputs':[],'basis':contract['basis']}
    out=next((n for n in g['nodes'] if n.get('sourceKind')=='result'),None)
    if not out:
        line=contract['outputs'][0]['line'];out=node_for(file,stable_id('outcomes',module['id']),'Outputs & effects',line,'Declared results and outward changes','output','green',sourceKind='result')
        out['defaultPreview']=' · '.join(readable(o['description'] if o['kind']=='effect' else o['name']) for o in contract['outputs'])[:500]
        out['interface']={'inputs':[],'outputs':contract['outputs'],'basis':contract['basis']};g['nodes'].append(out)
        source_lines={l['lineNumber']:l for l in result['codeFiles'][0]['lines']}
        # Outcome evidence may be outside the old excerpt. Caller adds exact source lines.
        if line not in source_lines:
            # Use an already retained source line for the card anchor; item.line retains the actual outcome evidence.
            out['codeReference']['lines']=[first['codeReference']['lines'][0]]
        returns=[n for n in g['nodes'] if n['id']!=out['id'] and n.get('sourceKind')=='operation' and n['kind']=='output']
        for n in returns:g['edges'].append({'id':stable_id('outcome-edge',n['id']+out['id']),'source':n['id'],'target':out['id'],'label':'returned result or failure','relationship':'control','description':'Declared outcome, not recorded execution','confidence':n.get('confidence','exact'),'evidence':n.get('evidence',[])})
        # A bounded view can collapse an entire try/loop containing an outcome.
        # Draw a declaration link from that real source block, not a false
        # direct data transfer or a disconnected output card.
        for outcome in contract['outputs']:
            at=outcome['line'];candidates=[]
            for node in g['nodes']:
                if node['id']==out['id'] or node.get('sourceKind')!='operation':continue
                lines=[v for ref in node.get('evidence',[]) for v in ref.get('lines',[])]
                if lines and min(lines)<=at<=max(lines):candidates.append((max(lines)-min(lines),node))
            if not candidates:continue
            node=min(candidates,key=lambda row:row[0])[1]
            if any(e['source']==node['id'] and e['target']==out['id'] for e in g['edges']):continue
            g['edges'].append({'id':stable_id('declared-outcome',node['id']+out['id']),'source':node['id'],'target':out['id'],'label':'declared result / effect','relationship':'reference','description':'A declared outcome within this source block; not a recorded direct transfer.','confidence':'exact','evidence':[{'kind':'file','path':file,'lines':[at]}]})

    result['steps']=module_steps(g,file,result['summary'])
    return result
