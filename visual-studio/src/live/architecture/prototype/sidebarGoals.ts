import type {ArchitectureGraph,GraphNode,Step,SubFunctionLesson} from './types/lesson';
import type {FunctionInterface} from '../types';

export type SidebarGoal={id:string;name:string;goal:string;inputLabel:string;inputValue:string;outputLabel:string;outputValue:string;highlighted:boolean;functionId?:string;nodeId?:string};
const at=(name:string)=>name.startsWith('@')?name:'@'+name.replace(/\(\)$/,'');
const readable=(name:string)=>name.replace(/^self\./,'').replace(/_/g,' ');
function contractValues(contract:FunctionInterface){
 const parameters=contract.inputs.filter(i=>i.kind!=='dependency'),dependencies=contract.inputs.filter(i=>i.kind==='dependency');
 const names=(items:typeof contract.inputs)=>items.map(i=>i.label||readable(i.name)).join(' · ');
 const returned=contract.outputs.filter(i=>i.kind==='return'||i.kind==='yield'),effects=contract.outputs.filter(i=>i.kind==='effect');
 const completion=contract.outputs.filter(i=>i.kind==='completion');
 return {inputValue:[names(parameters),dependencies.length?'configured: '+names(dependencies):''].filter(Boolean).join('; ')||'No explicit caller inputs declared.',
  outputValue:[returned.length?'Returned: '+names(returned):'',effects.length?'Changes: '+names(effects):'',...completion.map(i=>i.description)].filter(Boolean).join('; ')||'No declared result or outward effect.'};
}

export function generatedSidebarGoals(graph:ArchitectureGraph,step:Step,selectedId:string|null,fn:SubFunctionLesson|null):SidebarGoal[]{
 const children=graph.nodes.flatMap(parent=>(parent.children||[]).map(c=>({...parent,id:c.id,label:c.label,teachingLabel:c.label,teachingDescription:c.description,description:c.description||parent.description,defaultPreview:c.value||'',children:undefined,interface:undefined,drillDownFunctionId:c.drillDownFunctionId})));
 const nodes=[...graph.nodes,...children],edges=[...graph.edges,...graph.nodes.flatMap(parent=>(parent.connections||[]).map(c=>({id:c.id,source:c.from.child,target:c.to.child,label:c.label||'',description:'',relationship:c.relationship})))];
 const selected=nodes.find(n=>n.id===selectedId);
 const contract=selected?.interface||(!selected?fn?.interface:undefined);
 const cards:SidebarGoal[]=[];
 if(contract){const name=at(selected?.label||fn!.functionName);cards.push({id:'function-boundary',name,goal:fn?.summary||selected?.description||step.question,inputLabel:name+' input',outputLabel:name+' output',...contractValues(contract),highlighted:true});}
 function nodeCard(node:GraphNode):SidebarGoal {
  const name=at(node.label),incoming=edges.filter(e=>e.target===node.id||'targetChild' in e&&e.targetChild===node.id),outgoing=edges.filter(e=>e.source===node.id||'sourceChild' in e&&e.sourceChild===node.id);
  const ports=(items:NonNullable<GraphNode['ports']>['inputs'])=>items.map(p=>p.data&&p.data!==p.label?p.label+': '+p.data:p.label).join(' · ');
  const edgeValues=(items:typeof incoming,side:'source'|'target')=>items.map(e=>{const id=side==='source'?('sourceChild' in e&&e.sourceChild)||e.source:('targetChild' in e&&e.targetChild)||e.target;const other=nodes.find(n=>n.id===id);return (side==='source'?[other?.label,e.label]:[e.label,other?.label]).filter(Boolean).join(' → ');}).join('; ');
  const inputs=node.ports?.inputs,outputs=node.ports?.outputs;
  const recorded=node.valueRef?graph.workedExampleLedger?.[node.valueRef]??graph.workedExampleLedger?.['$'+node.valueRef]:undefined;
  return {id:node.id,nodeId:node.id,functionId:node.drillDownFunctionId,name,goal:node.teachingDescription||node.description||step.question,
   inputLabel:name+' input',inputValue:(node.kind==='output'?recorded:undefined)||ports(inputs||[])||edgeValues(incoming,'source')||(node.kind==='output'?node.defaultPreview:''),
   outputLabel:name+' output',outputValue:(node.kind!=='output'?recorded:undefined)||ports(outputs||[])||edgeValues(outgoing,'target')||(node.kind==='input'?node.defaultPreview:''),highlighted:true};
 }
 const focused=selected?[selected]:(step.focusOperations?.length?step.focusOperations:step.focusNodes).map(id=>nodes.find(n=>n.id===id)).filter((n):n is GraphNode=>Boolean(n));
 for(const node of focused){if(node.id===graph.systemNodeId||contract&&(node.interface||node.sourceKind==='signature'||node.sourceKind==='result'))continue;cards.push(nodeCard(node));}
 if(!cards.length)cards.push({id:step.id,name:at(step.title),goal:step.question,inputLabel:'Input',inputValue:'No interface is declared in this saved view.',outputLabel:'Result',outputValue:step.takeaway,highlighted:true});
 return cards;
}
