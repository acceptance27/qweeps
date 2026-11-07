import type {ArchitectureGraph,GraphNode,Step} from './types/lesson';

function operationIcon(node:GraphNode):string {
 const name=(node.teachingLabel||node.label).toLowerCase();
 if(node.kind==='search')return 'Filter';
 if(node.kind==='output')return name.includes('failure')?'XCircle':'CornerDownRight';
 if(name.includes('repeat'))return 'ArrowUpDown';
 if(name.includes('failure'))return 'ShieldCheck';
 if(name.includes('update'))return 'Database';
 return 'Cog';
}

/** Presentation-only grouping of real source operations. A group stops at
 * branches/joins and never adds an edge that is absent from the source graph. */
export function functionBlueprint(graph:ArchitectureGraph,steps:Step[]):{graph:ArchitectureGraph;steps:Step[]} {
 if(!graph.nodes.some(n=>n.sourceKind==='signature')||!graph.nodes.some(n=>n.sourceKind==='result'))return {graph,steps};
 const body=graph.nodes.filter(n=>n.sourceKind==='operation'),byId=new Map(body.map(n=>[n.id,n]));
 const outgoing=(id:string)=>graph.edges.filter(e=>e.source===id&&byId.has(e.target)&&e.relationship!=='reference');
 const incoming=(id:string)=>graph.edges.filter(e=>e.target===id&&byId.has(e.source)&&e.relationship!=='reference');
 const used=new Set<string>(),owner=new Map<string,string>(),groups:GraphNode[][]=[];
 for(const node of body){
  if(used.has(node.id))continue;
  const group:GraphNode[]=[];let next:GraphNode|undefined=node;
  while(next&&!used.has(next.id)&&group.length<3){
   group.push(next);used.add(next.id);
   const edges=outgoing(next.id),candidate=edges.length===1?byId.get(edges[0].target):undefined;
   next=candidate&&incoming(candidate.id).length===1?candidate:undefined;
  }
  groups.push(group);for(const child of group)owner.set(child.id,'stage-'+group[0].id);
 }
 const stages=groups.map(group=>{
  const first=group[0],id=owner.get(first.id)!;
  return {...first,id,label:first.teachingLabel||first.label,structure:undefined,sourceKind:undefined,interface:undefined,
   customVisual:undefined,nonSummary:undefined,staticData:undefined,layoutLocked:false,kind:'transform' as const,
   subtitle:'',description:group.map(n=>n.teachingDescription||n.description).join(' '),
   children:group.map(n=>({id:n.id,label:n.teachingLabel||n.label,description:n.teachingDescription||n.description,
    icon:operationIcon(n),color:n.accentColor,value:n.kind==='search'?'choose path':n.kind==='output'?'result / exit':'source operation',codeReference:n.codeReference,drillDownFunctionId:n.drillDownFunctionId})),
   connections:graph.edges.filter(e=>group.some(n=>n.id===e.source)&&group.some(n=>n.id===e.target)).map(e=>({id:e.id,from:{child:e.source},to:{child:e.target},label:e.label,relationship:e.relationship}))};
 });
 const edges=graph.edges.filter(e=>!owner.has(e.source)||owner.get(e.source)!==owner.get(e.target)).map(e=>({...e,
  source:owner.get(e.source)||e.source,target:owner.get(e.target)||e.target,
  ...(owner.has(e.source)?{sourceChild:e.source}:{}),...(owner.has(e.target)?{targetChild:e.target}:{})}));
 const remap=(ids:string[])=>[...new Set(ids.map(id=>owner.get(id)||id))];
 return {graph:{...graph,systemContract:true,nodes:[...graph.nodes.filter(n=>!owner.has(n.id)),...stages],edges},
  steps:steps.map(s=>({...s,focusNodes:remap(s.focusNodes),activeNodes:remap(s.activeNodes),focusOperations:s.focusNodes.filter(id=>owner.has(id)),
   attentionCues:s.attentionCues?.map(c=>({...c,target:owner.get(c.target)||c.target}))}))};
}
