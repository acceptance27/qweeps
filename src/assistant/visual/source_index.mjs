/** Parse supplied source text only. Never import, evaluate or execute inspected files. */
import {parse} from '@babel/parser';
let input='';for await(const chunk of process.stdin)input+=chunk;
const textAt=(source,node)=>node?source.slice(node.start,node.end).replace(/\s+/g,' ').trim():'';
const outputs=[];
for(const file of JSON.parse(input)){
 const source=file.source;
 try{
  const tree=parse(source,{sourceType:'unambiguous',plugins:['typescript','jsx','decorators-legacy'],errorRecovery:false});
  const symbols=[];const imports=[];
  for(const statement of tree.program.body){if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(statement.type)&&statement.source?.value)imports.push({name:statement.source.value,line:statement.loc.start.line});}
  function callsOf(node){
   const names=[];
   function walk(n){if(!n||typeof n!=='object')return;
    if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(n.type))return;
    if(n.type==='CallExpression'||n.type==='OptionalCallExpression'||n.type==='NewExpression')names.push(textAt(source,n.callee));
    for(const [key,value] of Object.entries(n)){if(['loc','start','end','extra','comments'].includes(key))continue;if(Array.isArray(value))value.forEach(walk);else walk(value);}
   }walk(node);return [...new Set(names)].slice(0,12);
  }
  function callSitesOf(body){
   const rows=[];function visit(n){if(!n||typeof n!=='object')return;if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression','ClassMethod','ObjectMethod'].includes(n.type))return;
    if(n.type==='CallExpression'&&!/^use(State|Ref|Memo|Effect|Callback)$/.test(textAt(source,n.callee)))rows.push({callee:textAt(source,n.callee).slice(0,160),arguments:n.arguments.slice(0,4).map(a=>textAt(source,a).slice(0,160)),line:n.loc.start.line});
    for(const [k,v] of Object.entries(n)){if(['loc','start','end','extra','comments','_binding'].includes(k))continue;if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}
   }visit(body);return rows.slice(0,32);
  }
  function outputsOf(body){
   const rows=[];function visit(n){if(!n||typeof n!=='object')return;if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression','ClassMethod','ObjectMethod'].includes(n.type))return;
    if(n.type==='ReturnStatement'&&n.argument)rows.push({name:n.argument.type==='Identifier'?n.argument.name:'returned value',description:'Returned to the caller',kind:'return',line:n.loc.start.line});
    if(n.type==='YieldExpression')rows.push({name:'yielded value',description:'Produced for the caller',kind:'yield',line:n.loc.start.line});
    if(n.type==='AssignmentExpression'&&n.left.type==='MemberExpression')rows.push({name:textAt(source,n.left).slice(0,160),description:'Updated state',kind:'effect',line:n.loc.start.line});
    if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&['push','set','send','emit','write','append','dispatch'].includes(n.callee.property?.name))rows.push({name:textAt(source,n.callee.object).slice(0,160),description:'Outward change through '+n.callee.property.name,kind:'effect',line:n.loc.start.line});
    for(const [key,v] of Object.entries(n)){if(['loc','start','end','extra','comments','_binding'].includes(key))continue;if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}
   }visit(body);return rows.slice(0,16);
  }
  function statements(nodes,depth=0){return(nodes||[]).slice(0,24).map(n=>{
   const kind=n.type,label=textAt(source,n).slice(0,220),row={kind,line:n.loc.start.line,end:n.loc.end.line,text:label,calls:callsOf(n)};
   if(depth<3){
    if(kind==='IfStatement'){row.test=textAt(source,n.test);row.then=statements(n.consequent.type==='BlockStatement'?n.consequent.body:[n.consequent],depth+1);row.else=n.alternate?statements(n.alternate.type==='BlockStatement'?n.alternate.body:[n.alternate],depth+1):[];}
    if(['ForStatement','ForOfStatement','ForInStatement','WhileStatement','DoWhileStatement'].includes(kind)){row.test=textAt(source,n.test||n.right||n.left)||'loop condition';row.body=statements(n.body.type==='BlockStatement'?n.body.body:[n.body],depth+1);}
    if(kind==='TryStatement'){row.body=statements(n.block.body,depth+1);row.handler=n.handler?statements(n.handler.body.body,depth+1):[];row.finally=n.finalizer?statements(n.finalizer.body,depth+1):[];}
   }
   if(kind==='ReturnStatement')row.result=textAt(source,n.argument)||'undefined';
   return row;
  });}
  function walk(node,scope=[]){if(!node||typeof node!=='object')return;
   let next=scope;
   if(['ClassDeclaration','ClassExpression'].includes(node.type))next=[...scope,node.id?.name||'anonymous class'];
   if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression','ClassMethod','ObjectMethod','ClassPrivateMethod'].includes(node.type)){
    let name=node.id?.name||node.key?.name||node.key?.value;
    if(!name&&node._binding)name=node._binding;
    if(name){const qualified=[...scope,name].join('.');const body=node.body;
     symbols.push({name:qualified,line:node.loc.start.line,end:node.loc.end.line,kind:'function',signature:source.slice(node.start,body?.start||node.end).replace(/\s+/g,' ').trim().slice(0,300),parameters:(node.params||[]).map(p=>textAt(source,p).slice(0,100)),callSites:callSitesOf(body),outputs:body?.type==='BlockStatement'?outputsOf(body):[{name:'returned value',description:'Returned to the caller',kind:'return',line:body.loc.start.line}],description:(node.leadingComments?.at(-1)?.value||'').replace(/\*/g,'').trim().slice(0,250),body:body?.type==='BlockStatement'?statements(body.body):[{kind:'ReturnStatement',line:body.loc.start.line,end:body.loc.end.line,text:'return '+textAt(source,body).slice(0,210),result:textAt(source,body).slice(0,210),calls:callsOf(body)}]});next=[...scope,name];}
   }
   for(const [key,value] of Object.entries(node)){
    if(['loc','start','end','extra','comments','leadingComments','trailingComments','_binding'].includes(key))continue;
    if(node.type==='VariableDeclarator'&&key==='init'&&value&&typeof value==='object')value._binding=node.id?.name;
    if(Array.isArray(value))value.forEach(n=>walk(n,next));else if(value&&typeof value==='object')walk(value,next);
   }
  }
  walk(tree.program);outputs.push({path:file.path,symbols,imports});
 }catch(error){outputs.push({path:file.path,symbols:[],error:String(error.message).slice(0,250)});}
}
process.stdout.write(JSON.stringify(outputs));
