import ELK, {type ElkNode, type ElkExtendedEdge} from 'elkjs/lib/elk.bundled.js';
import type {ArchitectureGraph, ComputedGraphLayout, LayoutEdgePoint, LayoutEdgeRoute} from '../types/lesson';

const elk = new ELK();
const padding = '[top=52,left=28,bottom=26,right=28]';
const layered = {'elk.algorithm':'layered','elk.direction':'RIGHT','elk.edgeRouting':'ORTHOGONAL',
  'elk.spacing.nodeNode':'34','elk.layered.spacing.nodeNodeBetweenLayers':'48',
  'elk.spacing.componentComponent':'40','elk.aspectRatio':'1.8',
  'elk.layered.considerModelOrder.strategy':'NODES_AND_EDGES'};
function points(edge: ElkExtendedEdge): LayoutEdgePoint[] {
  return edge.sections?.flatMap(section => [section.startPoint,...(section.bendPoints||[]),section.endPoint]) || [];
}
function route(id:string, source:string, target:string, pts:LayoutEdgePoint[]):LayoutEdgeRoute {
  return {id,source,target,points:pts,sourcePort:pts[0],targetPort:pts[pts.length-1],labelPosition:pts[Math.floor(pts.length/2)]};
}
function childSize(label:string) {return {width:Math.max(108,Math.min(218,Math.ceil(label.length*6.5)+8)),height:72};}
function inferIcon(label:string) {
  const name=label.toLowerCase();
  if(/server|api|handler/.test(name))return 'Network';
  if(/audio|narrat|speech|sync|alignment/.test(name))return 'AudioLines';
  if(/player|timeline/.test(name))return 'Play';
  if(/runner|cli|main/.test(name))return 'Terminal';
  if(/stage|canvas|layout|geometry/.test(name))return 'Workflow';
  if(/token|split/.test(name))return 'Scissors';
  if(/sort|rank/.test(name))return 'ArrowUpDown';
  if(/filter|select|top.?k/.test(name))return 'Filter';
  if(/normal|vector/.test(name))return 'Binary';
  if(/score|similar/.test(name))return 'Gauge';
  if(/prompt|assembl/.test(name))return 'FileCode2';
  if(/review|valid|cite|check/.test(name))return 'ShieldCheck';
  if(/generate|model/.test(name))return 'Sparkles';
  if(/store|index|database/.test(name))return 'Database';
  if(/join|pool|embed/.test(name))return 'Layers';
  return 'FileCode2';
}

/** Bottom-up hierarchical layout: route each declared internal graph, size its
 * enclosure, then route the graph of enclosures using real ELK output. No wire
 * or dependency is inferred from child array order. */
export async function computeGeneratedLayout(graph:ArchitectureGraph, fallback=false):Promise<ComputedGraphLayout> {
  if(graph.systemNodeId)return computeWrappedSystemLayout(graph,fallback);
  const compounds:NonNullable<ComputedGraphLayout['compounds']>={};
  const children:NonNullable<ComputedGraphLayout['children']>={};
  const dimensions:Record<string,{width:number;height:number}>={};
  const internalEdges:NonNullable<ComputedGraphLayout['internalEdges']>={};
  for(const node of graph.nodes){
    if(node.compoundContainer){
      compounds[node.id]=structuredClone(node.compoundContainer);
      dimensions[node.id]={width:node.width,height:node.height};
      continue;
    }
    if(!node.children?.length){dimensions[node.id]={width:node.width,height:node.height};continue;}
    const operations=node.children;
    const connections=node.connections||[];
    const input:ElkNode={id:node.id,layoutOptions:{...layered,'elk.algorithm':connections.length?'layered':'box','elk.padding':padding},
      children:operations.map(op=>({id:op.id,...childSize(op.label)})),
      edges:connections.map(conn=>({id:conn.id,sources:[conn.from.child],targets:[conn.to.child]}))};
    const inner = fallback ? fallbackInner(input) : await elk.layout(input);
    const boxes=Object.fromEntries((inner.children||[]).map(child=>[child.id,{id:child.id,x:child.x||0,y:child.y||0,width:child.width!,height:child.height!}]));
    children[node.id]=boxes;
    dimensions[node.id]={width:inner.width!,height:inner.height!};
    compounds[node.id]={leftPortsY:[],rightPortsY:[],children:operations.map(op=>{
      const box=boxes[op.id];
      return{id:op.id,label:op.label,sublabel:op.value||'',x:box.x,y:box.y,w:box.width,h:box.height,
        iconName:op.icon&&op.icon!=='Layers'?op.icon:inferIcon(op.label),color:op.color,drillDownFunctionId:op.drillDownFunctionId,showInputPort:connections.some(c=>c.to.child===op.id),showOutputPort:connections.some(c=>c.from.child===op.id)};
    }),internalWires:(inner.edges||[]).map(edge=>({id:edge.id,points:points(edge)}))};
  }
  const bindings=new Map<string,{source?:string;target?:string}>();
  for(const edge of graph.edges){
    const bind:{source?:string;target?:string}={source:edge.sourceChild,target:edge.targetChild};
    for(const [endpoint,side] of [[edge.source,'source'],[edge.target,'target']] as const){
      const node=graph.nodes.find(n=>n.id===endpoint)!;
      if(bind[side]||node.structure==='source'||!node.children?.length)continue;
      const candidates=node.children.filter(child=>!(node.connections||[]).some(conn=>side==='source'?conn.from.child===child.id:conn.to.child===child.id));
      if(candidates.length===1)bind[side]=candidates[0].id;
    }
    bindings.set(edge.id,bind);
  }
  const endpoints=new Map<string,{source:string;target:string}>();
  const nodesInput=graph.nodes.map(node=>{
    const dim=dimensions[node.id],ports=new Map<string,{id:string;x:number;y:number;width:number;height:number;layoutOptions:Record<string,string>}>();
    for(const edge of graph.edges){
      for(const side of ['source','target'] as const){
        if(edge[side]!==node.id)continue;
        const childId=bindings.get(edge.id)?.[side];
        const child=compounds[node.id]?.children.find(c=>c.id===childId);
        const id=`${node.id}:${side}:${childId||'boundary'}`;
        if(!ports.has(id)){
          let y=child?child.y+child.h/2:dim.height/2;
          const used=[...ports.values()].filter(p=>p.layoutOptions['elk.port.side']===(side==='source'?'EAST':'WEST')).map(p=>p.y);
          const center=y;let offset=0;
          while(used.some(py=>Math.abs(py-y)<9)){offset+=10;y=center+offset;if(y>dim.height-12)y=center-offset;}
          const port={id,x:side==='source'?dim.width:0,y,width:0,height:0,layoutOptions:{'elk.port.side':side==='source'?'EAST':'WEST'}};
          ports.set(id,port);
          const spec=compounds[node.id];
          if(spec){
            (side==='source'?spec.rightPortsY:spec.leftPortsY).push(y);
            if(child){
              const childPoint={x:side==='source'?child.x+child.w:child.x,y:child.y+child.h/2},wallPoint={x:side==='source'?dim.width:0,y};
              spec.internalWires.push({points:boundaryRoute(side==='source'?childPoint:wallPoint,side==='source'?wallPoint:childPoint,spec)});
              if(side==='source')child.showOutputPort=true;else child.showInputPort=true;
            }
          }
        }
        const pair=endpoints.get(edge.id)||{source:'',target:''};pair[side]=id;endpoints.set(edge.id,pair);
      }
    }
    return{id:node.id,...dim,ports:[...ports.values()],layoutOptions:{'elk.portConstraints':'FIXED_POS',...((node.kind==='input'||node.external&&!graph.edges.some(e=>e.target===node.id))?{'elk.layered.layering.layerConstraint':'FIRST_SEPARATE'}:(node.external||node.kind==='output'&&node.sourceKind!=='operation')?{'elk.layered.layering.layerConstraint':'LAST_SEPARATE'}:{})}};
  });
  if(graph.systemContract)return layoutSystemEnclosure(graph,nodesInput,endpoints,compounds,children,internalEdges,fallback);
  const outerInput:ElkNode={id:graph.id,layoutOptions:{...layered,'elk.padding':'[top=56,left=44,bottom=40,right=44]',
    'elk.layered.spacing.nodeNodeBetweenLayers':'70','elk.spacing.nodeNode':'64','elk.spacing.componentComponent':'64'},
    children:nodesInput,edges:graph.edges.map(edge=>({id:edge.id,sources:[endpoints.get(edge.id)!.source],targets:[endpoints.get(edge.id)!.target]}))};
  const outer=fallback?fallbackOuter(outerInput,graph,endpoints):await elk.layout(outerInput);
  const nodes=Object.fromEntries((outer.children||[]).map(node=>[node.id,{id:node.id,x:node.x||0,y:node.y||0,width:node.width!,height:node.height!}]));
  const edges:ComputedGraphLayout['edges']={};
  for(const edge of outer.edges||[]){const original=graph.edges.find(e=>e.id===edge.id)!;const pts=points(edge);if(pts.length>1)edges[edge.id]=route(edge.id,original.source,original.target,pts);}
  for(const node of graph.nodes){
    const spec=compounds[node.id],box=nodes[node.id];if(!spec)continue;
    for(const wire of spec.internalWires){if(wire.id)internalEdges[wire.id]=route(wire.id,node.id,node.id,wire.points.map(p=>({x:p.x+box.x,y:p.y+box.y})));}
  }
  const internal=graph.nodes.filter(n=>isEnclosedNode(graph,n)).map(n=>nodes[n.id]);
  const enclosed=internal.length?internal:Object.values(nodes);
  const minX=Math.min(...enclosed.map(n=>n.x)),minY=Math.min(...enclosed.map(n=>n.y));
  const systemBounds={x:minX-24,y:minY-32,width:Math.max(...enclosed.map(n=>n.x+n.width))-minX+48,height:Math.max(...enclosed.map(n=>n.y+n.height))-minY+56};
  for(const edge of graph.edges){
    const a=graph.nodes.find(n=>n.id===edge.source)!,b=graph.nodes.find(n=>n.id===edge.target)!;
    if(isEnclosedNode(graph,a)!==isEnclosedNode(graph,b)&&edges[edge.id])markBoundaryPort(edges[edge.id],systemBounds);
  }
  const result:ComputedGraphLayout={width:Math.max(outer.width||0,systemBounds.x+systemBounds.width+24),height:Math.max(outer.height||0,systemBounds.y+systemBounds.height+24),
    nodes,edges,children,compounds,internalEdges,systemBounds,engineUsed:fallback?'deterministic-fallback':'elk'};
  result.issues=measureHierarchyIssues(graph,result);
  return result;
}

// A failed layout engine must still preserve topology. These fallbacks place
// boxes without inventing edges; every route comes from an authored connection.
function fallbackInner(input:ElkNode):ElkNode{
  const nodes=input.children||[];let x=28;
  const children=nodes.map(n=>{const box={...n,x,y:52};x+=n.width!+48;return box;});
  const byId=Object.fromEntries(children.map(n=>[n.id,n]));
  const edges=(input.edges||[]).map(e=>{const a=byId[e.sources[0]],b=byId[e.targets[0]],startPoint={x:a.x!+a.width!,y:a.y!+a.height!/2},endPoint={x:b.x!,y:b.y!+b.height!/2};return{...e,sections:[{id:e.id,startPoint,endPoint,bendPoints:[{x:startPoint.x+18,y:startPoint.y},{x:startPoint.x+18,y:endPoint.y}]}]};});
  return{...input,children,edges,width:x-20,height:150};
}
function fallbackOuter(input:ElkNode,graph:Pick<ArchitectureGraph,'edges'>,endpoints:Map<string,{source:string;target:string}>):ElkNode{
  let y=56;const children=(input.children||[]).map(n=>{const box={...n,x:44,y};y+=n.height!+64;return box;});
  const edges=graph.edges.map(e=>{const a=children.find(n=>n.id===e.source)!,b=children.find(n=>n.id===e.target)!;
    const sy=a.ports!.find(p=>p.id===endpoints.get(e.id)!.source)!.y!,ty=b.ports!.find(p=>p.id===endpoints.get(e.id)!.target)!.y!;
    const startPoint={x:a.x!+a.width!,y:a.y!+sy},endPoint={x:b.x!,y:b.y!+ty};
    return{id:e.id,sources:[e.source],targets:[e.target],sections:[{id:e.id,startPoint,endPoint,bendPoints:[{x:startPoint.x+30,y:startPoint.y},{x:startPoint.x+30,y:endPoint.y}]}]};});
  return{...input,children,edges,width:Math.max(...children.map(n=>n.width!))+110,height:y};
}

/** Orthogonal visibility routing for a boundary binding. Child array order is
 * irrelevant; detours stay in the container gutters and avoid sibling blocks. */
function boundaryRoute(start:LayoutEdgePoint,end:LayoutEdgePoint,spec:CompoundContainerSpecForRoute):LayoutEdgePoint[]{
  const boxes=spec.children;
  const xs=[...new Set([start.x,end.x,...boxes.flatMap(b=>[b.x-12,b.x+b.w+12])])].sort((a,b)=>a-b);
  const ys=[...new Set([start.y,end.y,...boxes.flatMap(b=>[b.y-18,b.y+b.h+12])])].sort((a,b)=>a-b);
  const blocked=(a:LayoutEdgePoint,b:LayoutEdgePoint)=>boxes.some(r=>a.x===b.x?
    a.x>r.x&&a.x<r.x+r.w&&Math.max(a.y,b.y)>r.y&&Math.min(a.y,b.y)<r.y+r.h:
    a.y>r.y&&a.y<r.y+r.h&&Math.max(a.x,b.x)>r.x&&Math.min(a.x,b.x)<r.x+r.w);
  const key=(x:number,y:number)=>`${x},${y}`,from=key(start.x,start.y),to=key(end.x,end.y);
  const open=[{p:start,cost:0}],best=new Map([[from,0]]),previous=new Map<string,LayoutEdgePoint>();
  while(open.length){
    open.sort((a,b)=>a.cost-b.cost);const current=open.shift()!,k=key(current.p.x,current.p.y);
    if(current.cost!==best.get(k))continue;
    if(k===to){const result=[end];let at=end;while(key(at.x,at.y)!==from){at=previous.get(key(at.x,at.y))!;result.unshift(at);}return result.filter((_,i)=>!i||i===result.length-1||(result[i-1].x!==result[i+1].x&&result[i-1].y!==result[i+1].y));}
    const xi=xs.indexOf(current.p.x),yi=ys.indexOf(current.p.y);
    const neighbors=[xi>0?{x:xs[xi-1],y:current.p.y}:null,xi<xs.length-1?{x:xs[xi+1],y:current.p.y}:null,
      yi>0?{x:current.p.x,y:ys[yi-1]}:null,yi<ys.length-1?{x:current.p.x,y:ys[yi+1]}:null];
    for(const p of neighbors){if(!p||blocked(current.p,p))continue;const id=key(p.x,p.y),cost=current.cost+Math.abs(p.x-current.p.x)+Math.abs(p.y-current.p.y)+1;
      if(cost<(best.get(id)??Infinity)){best.set(id,cost);previous.set(id,current.p);open.push({p,cost});}}
  }
  throw new Error('No clear route for compound boundary binding');
}
type CompoundContainerSpecForRoute=Pick<NonNullable<ComputedGraphLayout['compounds']>[string],'children'>;

/** Synchronous first paint only; cycle-safe while ELK computes the final layout. */
export function initialGeneratedLayout(graph:ArchitectureGraph):ComputedGraphLayout{
  let y=56;const nodes:ComputedGraphLayout['nodes']={};
  for(const node of graph.nodes){const width=node.children?.length?Math.max(240,node.children.length*150):node.width;
    nodes[node.id]={id:node.id,x:44,y,width,height:node.children?.length?164:node.height};y+=nodes[node.id].height+64;}
  const edges:ComputedGraphLayout['edges']={};
  for(const edge of graph.edges){const a=nodes[edge.source],b=nodes[edge.target];const start={x:a.x+a.width,y:a.y+a.height/2},end={x:b.x,y:b.y+b.height/2};
    edges[edge.id]=route(edge.id,edge.source,edge.target,[start,{x:start.x+24,y:start.y},{x:start.x+24,y:end.y},end]);}
  return{nodes,edges,width:Math.max(...Object.values(nodes).map(n=>n.x+n.width))+40,height:y,engineUsed:'deterministic-fallback'};
}

export function measureHierarchyIssues(graph:ArchitectureGraph,layout:ComputedGraphLayout):string[]{
 const issues:string[]=[];
 const boxes=Object.entries(layout.nodes).filter(([id])=>id!==graph.systemNodeId).map(([,box])=>box);
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
  const a=boxes[i],b=boxes[j];
  if(a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height)issues.push(`Containers ${a.id} and ${b.id} overlap`);
 }
 for(const node of graph.nodes){
  if(node.id===graph.systemNodeId)continue;
  const box=layout.nodes[node.id],spec=layout.compounds?.[node.id];
  const bounds=layout.systemBounds;
  if(bounds&&isEnclosedNode(graph,node)&&(box.x<bounds.x||box.y<bounds.y||box.x+box.width>bounds.x+bounds.width||box.y+box.height>bounds.y+bounds.height))issues.push(`Container ${node.id} extends outside the system enclosure`);
  if(!spec)continue;
  for(const c of spec.children)if(c.x<0||c.y<0||c.x+c.w>box.width||c.y+c.h>box.height)issues.push(`Operation ${c.id} extends outside ${node.id}`);
  for(const connection of node.connections||[])if(!layout.internalEdges?.[connection.id])issues.push(`Missing route for ${connection.id}`);
 }
 for(const edge of graph.edges)if(!layout.edges[edge.id]?.points.length)issues.push(`Missing route for ${edge.id}`);
 return issues;
}


function isEnclosedNode(graph:ArchitectureGraph,node:ArchitectureGraph['nodes'][number]):boolean{
 return !node.external&&(node.sourceKind==='operation'||(!['input','output'].includes(node.kind)&&(graph.systemContract||node.kind!=='store')));
}

/** A real square socket at the actual system-wall crossing, not another input card. */
export function markBoundaryPort(route:LayoutEdgeRoute,frame:{x:number;y:number;width:number;height:number}):void{
 for(let i=1;i<route.points.length;i++){
  const a=route.points[i-1],b=route.points[i];let point:LayoutEdgePoint|undefined;
  if(a.y===b.y&&a.x!==b.x&&a.y>=frame.y&&a.y<=frame.y+frame.height){
   const xs=[frame.x,frame.x+frame.width].filter(x=>x>=Math.min(a.x,b.x)&&x<=Math.max(a.x,b.x));
   const x=xs.sort((x,y)=>Math.abs(x-a.x)-Math.abs(y-a.x))[0];if(x!==undefined)point={x,y:a.y};
  }else if(a.x===b.x&&a.y!==b.y&&a.x>=frame.x&&a.x<=frame.x+frame.width){
   const ys=[frame.y,frame.y+frame.height].filter(y=>y>=Math.min(a.y,b.y)&&y<=Math.max(a.y,b.y));
   const y=ys.sort((x,y)=>Math.abs(x-a.y)-Math.abs(y-a.y))[0];if(y!==undefined)point={x:a.x,y};
  }
  if(point){route.boundaryPort=point;if(point.x!==a.x||point.y!==a.y)if(point.x!==b.x||point.y!==b.y)route.points.splice(i,0,point);return;}
 }
}


/** The enclosing call is the frame itself. Split its logical incoming/entry
 * edges at the wall instead of drawing a duplicate system box inside it. */
async function computeWrappedSystemLayout(graph:ArchitectureGraph,fallback:boolean):Promise<ComputedGraphLayout>{
 const id=graph.systemNodeId!;
 const incoming=graph.edges.filter(e=>e.target===id),entries=graph.edges.filter(e=>e.source===id);
 if(entries.length!==1||!incoming.length)throw new Error('An enclosing system call needs one internal entry route');
 const entry=entries[0];
 const projected:ArchitectureGraph={...graph,systemNodeId:undefined,nodes:graph.nodes.filter(n=>n.id!==id),edges:graph.edges.filter(e=>e.source!==id).map(e=>e.target===id?{...e,target:entry.target,targetChild:entry.targetChild}:e)};
 const layout=await computeGeneratedLayout(projected,fallback),frame=layout.systemBounds!;
 let entryRoute:LayoutEdgeRoute|undefined;
 for(const edge of incoming){
  const full=layout.edges[edge.id],wall=full?.boundaryPort;
  if(!full||!wall)throw new Error('The input does not cross the named system boundary');
  const at=full.points.findIndex(p=>p.x===wall.x&&p.y===wall.y);
  if(at<0)throw new Error('Missing system wall route point');
  if(!entryRoute)entryRoute=route(entry.id,id,entry.target,full.points.slice(at));
  layout.edges[edge.id]={...route(edge.id,edge.source,id,full.points.slice(0,at+1)),boundaryPort:wall};
 }
 if(!entryRoute)throw new Error('Missing internal system entry route');
 entryRoute.boundaryPort=entryRoute.points[0];layout.edges[entry.id]=entryRoute;
 layout.nodes[id]={id,...frame};
 layout.issues=measureHierarchyIssues(graph,layout);
 return layout;
}


/** Lay out the implementation inside one real system container, then lay out
 * external data sources and results around that container. Wrapping the inside
 * alone keeps input/output cards out of the enclosure, as in the reference. */
async function layoutSystemEnclosure(
 graph:ArchitectureGraph,nodesInput:ElkNode[],endpoints:Map<string,{source:string;target:string}>,
 compounds:NonNullable<ComputedGraphLayout['compounds']>,children:NonNullable<ComputedGraphLayout['children']>,
 internalEdges:NonNullable<ComputedGraphLayout['internalEdges']>,fallback:boolean
):Promise<ComputedGraphLayout>{
 const internalIds=new Set(graph.nodes.filter(n=>isEnclosedNode(graph,n)).map(n=>n.id));
 const innerEdges=graph.edges.filter(e=>internalIds.has(e.source)&&internalIds.has(e.target));
 const innerInput:ElkNode={id:graph.id+'-implementation',layoutOptions:{...layered,'elk.padding':'[top=52,left=36,bottom=36,right=36]',
  ...(internalIds.size>=5?{'elk.aspectRatio':'3.2','elk.layered.wrapping.strategy':'MULTI_EDGE','elk.layered.wrapping.multiEdge.improveCuts':'false','elk.layered.wrapping.multiEdge.improveWrappedEdges':'true'}:{})},
  children:nodesInput.filter(n=>internalIds.has(n.id)),edges:innerEdges.map(e=>({id:e.id,sources:[endpoints.get(e.id)!.source],targets:[endpoints.get(e.id)!.target]}))};
 const inner=fallback?fallbackOuter(innerInput,{edges:innerEdges},endpoints):await elk.layout(innerInput);
 const innerNodes=Object.fromEntries(inner.children!.map(n=>[n.id,n]));
 const width=inner.width!,height=inner.height!,systemId=graph.id+'-enclosure';
 const systemPorts=new Map<string,NonNullable<ElkNode['ports']>[number]>();
 const bindings=new Map<string,{side:'source'|'target';internal:string;portId:string;point:LayoutEdgePoint}>();
 const outerEdges=graph.edges.filter(e=>!internalIds.has(e.source)||!internalIds.has(e.target));
 const boundaryBoxes=Object.values(innerNodes).map(n=>({id:n.id,label:n.id,sublabel:'',x:n.x!,y:n.y!,w:n.width!,h:n.height!,iconName:'FileCode2',color:'sky' as const}));
 const projected=outerEdges.map(edge=>{
  const internalSide=internalIds.has(edge.source)?'source':internalIds.has(edge.target)?'target':null;
  if(!internalSide)return edge;
  const nodeId=edge[internalSide],node=innerNodes[nodeId],endpoint=endpoints.get(edge.id)![internalSide];
  const nodePort=node.ports!.find(p=>p.id===endpoint)!;
  const externalId=internalSide==='source'?edge.target:edge.source;
  const right=internalSide==='source'||graph.edges.some(e=>e.target===externalId&&internalIds.has(e.source));
  const side=right?'EAST':'WEST',id=systemId+':'+side+':'+endpoint;
  if(!systemPorts.has(id)){
   let y=node.y!+nodePort.y!;
   while([...systemPorts.values()].some(p=>p.x===(right?width:0)&&Math.abs(p.y!-y)<9))y+=10;
   systemPorts.set(id,{id,x:right?width:0,y,width:0,height:0,layoutOptions:{'elk.port.side':side}});
  }
  bindings.set(edge.id,{side:internalSide,internal:nodeId,portId:id,point:{x:node.x!+nodePort.x!,y:node.y!+nodePort.y!}});
  return {...edge,[internalSide]:systemId};
 });
 const outerEndpoints=new Map<string,{source:string;target:string}>();
 for(const edge of outerEdges){const pair={...endpoints.get(edge.id)!},binding=bindings.get(edge.id);if(binding)pair[binding.side]=binding.portId;outerEndpoints.set(edge.id,pair);}
 const system:ElkNode={id:systemId,width,height,ports:[...systemPorts.values()],layoutOptions:{'elk.portConstraints':'FIXED_POS'}};
 const outerInput:ElkNode={id:graph.id,layoutOptions:{...layered,'elk.padding':'[top=56,left=44,bottom=40,right=44]','elk.layered.spacing.nodeNodeBetweenLayers':'70','elk.spacing.nodeNode':'64'},
  children:[...nodesInput.filter(n=>!internalIds.has(n.id)),system],edges:projected.map(e=>({id:e.id,sources:[outerEndpoints.get(e.id)!.source],targets:[outerEndpoints.get(e.id)!.target]}))};
 const outer=fallback?fallbackOuter(outerInput,{edges:projected},outerEndpoints):await elk.layout(outerInput);
 const frameNode=outer.children!.find(n=>n.id===systemId)!;
 const frame={x:frameNode.x!,y:frameNode.y!,width,height};
 const nodes:ComputedGraphLayout['nodes']={};
 for(const n of outer.children!)if(n.id!==systemId)nodes[n.id]={id:n.id,x:n.x!,y:n.y!,width:n.width!,height:n.height!};
 for(const n of Object.values(innerNodes))nodes[n.id]={id:n.id,x:frame.x+n.x!,y:frame.y+n.y!,width:n.width!,height:n.height!};
 const edges:ComputedGraphLayout['edges']={};
 for(const e of inner.edges||[]){const original=graph.edges.find(edge=>edge.id===e.id)!;edges[e.id]=route(e.id,original.source,original.target,points(e).map(p=>({x:frame.x+p.x,y:frame.y+p.y})));}
 for(const e of outer.edges||[]){
  const original=graph.edges.find(edge=>edge.id===e.id)!,binding=bindings.get(e.id);let pts=points(e);
  if(!binding){edges[e.id]=route(e.id,original.source,original.target,pts);continue;}
  const port=systemPorts.get(binding.portId)!,wall={x:frame.x+port.x!,y:frame.y+port.y!};
  const start=binding.side==='source'?binding.point:{x:port.x!,y:port.y!},end=binding.side==='source'?{x:port.x!,y:port.y!}:binding.point;
  const inside=boundaryRoute(start,end,{children:boundaryBoxes}).map(p=>({x:frame.x+p.x,y:frame.y+p.y}));
  pts=binding.side==='source'?[...inside,...pts.slice(1)]:[...pts,...inside.slice(1)];
  edges[e.id]={...route(e.id,original.source,original.target,pts),boundaryPort:wall};
 }
 for(const [id,spec] of Object.entries(compounds)){const box=nodes[id];for(const wire of spec.internalWires)if(wire.id)internalEdges[wire.id]=route(wire.id,id,id,wire.points.map(p=>({x:box.x+p.x,y:box.y+p.y})));}
 const result:ComputedGraphLayout={width:outer.width!,height:outer.height!,nodes,edges,compounds,children,internalEdges,systemBounds:frame,engineUsed:fallback?'deterministic-fallback':'elk'};
 result.issues=measureHierarchyIssues(graph,result);return result;
}
