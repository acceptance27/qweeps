"""Static call sites, HTTP routes and bound-object constructors for source authoring."""
import ast
import hashlib
_CACHE={}


def python_call_evidence(source):
    key=hashlib.sha256(source.encode()).hexdigest()
    if key in _CACHE:return _CACHE[key]
    tree=ast.parse(source);functions={};bindings=[];routes=[];fields={}
    def walk(nodes,scope=()):
        for n in nodes:
            if isinstance(n,ast.ClassDef):walk(n.body,(*scope,n.name))
            elif isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)):
                name='.'.join((*scope,n.name));sites=[];input_fields=[]
                class Calls(ast.NodeVisitor):
                    def visit_FunctionDef(self,node):pass
                    visit_AsyncFunctionDef=visit_FunctionDef
                    visit_Lambda=visit_FunctionDef
                    def visit_Call(self,node):
                        callee=ast.unparse(node.func)
                        if callee.endswith('.get') and isinstance(node.func,ast.Attribute) and isinstance(node.func.value,ast.Name) and node.args and isinstance(node.args[0],ast.Constant) and isinstance(node.args[0].value,str):input_fields.append({'object':node.func.value.id,'field':node.args[0].value,'line':node.lineno})
                        if callee not in {'bool','str','int','len','list','dict','set','range','isinstance','enumerate','max','min','round','print','abs','super'} and callee not in {'payload.get','request.get','options.get','config.get','j.get'} and not callee.startswith(('re.','json.dumps','os.environ','copy.deepcopy')):
                            sites.append({'callee':callee[:160],'arguments':[ast.unparse(a)[:160] for a in node.args[:4]],'line':node.lineno})
                        self.generic_visit(node)
                    def visit_Assign(self,node):
                        if isinstance(node.value,ast.Call):
                            for target in node.targets:
                                if isinstance(target,ast.Attribute) and isinstance(target.value,ast.Name) and target.value.id=='self':bindings.append({'owner':'.'.join(scope),'attribute':target.attr,'constructor':ast.unparse(node.value.func),'line':node.lineno})
                        self.generic_visit(node)
                    def visit_If(self,node):
                        strings=[v.value for v in ast.walk(node.test) if isinstance(v,ast.Constant) and isinstance(v.value,str) and v.value.startswith('/api/')]
                        if strings:
                            calls=[]
                            for stmt in node.body:
                                for c in ast.walk(stmt):
                                    if isinstance(c,ast.Call):calls.append({'callee':ast.unparse(c.func)[:160],'line':c.lineno,'arguments':[ast.unparse(a)[:120] for a in c.args[:2]]})
                            routes.extend({'route':route,'handler':name,'line':node.lineno,'calls':calls[:8]} for route in strings)
                        self.generic_visit(node)
                visitor=Calls()
                for stmt in n.body:visitor.visit(stmt)
                functions[(name,n.lineno)]=sites[:32];fields[(name,n.lineno)]=input_fields[:32];walk(n.body,(*scope,n.name))
            else:
                for attr in ('body','orelse','finalbody'):
                    if isinstance(getattr(n,attr,None),list):walk(getattr(n,attr),scope)
    walk(tree.body)
    result={'functions':functions,'inputFields':fields,'boundObjects':bindings,'routes':routes}
    if len(_CACHE)>=12:_CACHE.pop(next(iter(_CACHE)))
    _CACHE[key]=result
    return result
