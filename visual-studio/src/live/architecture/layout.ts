import ELK from 'elkjs/lib/elk.bundled.js';
import type {ElkNode} from 'elkjs/lib/elk-api';
import type {FlowGraph,FlowNode,GraphLayout} from './types';

import {wrap,polylinePoint} from './geometry';
export {wrap,polylinePoint,pathFor} from './geometry';

const elk=new ELK();
const cache=new Map<string,Promise<GraphLayout>>();
export function nodeSize(node:FlowNode){
 const visual=node.visual,width=visual?.rows?.length?350:300;
 const title=wrap(node.label,width-44,18).length*23;
 const visualRows=Math.min(5,visual?.rows?.length||visual?.tiles?.length||visual?.lines?.length||3);
 const content=visual?.variant==='vector-bars'?130:visual?.tiles?.length?Math.ceil(Math.min(12,visual.tiles.length)/3)*43:visualRows*(visual?.rows?.length?34:25);
 return{width,height:Math.max(178,Math.min(330,92+title+content))};
}
/** The complete topology and measured card sizes form the cache key, never just its ID. */
export function layoutGraph(graph:FlowGraph):Promise<GraphLayout>{
 const key=JSON.stringify({version:1,graph});
 const old=cache.get(key);if(old)return old;
 const task=(async()=>{
  const input:ElkNode={id:graph.id,layoutOptions:{'elk.algorithm':'layered','elk.direction':'RIGHT',
   'elk.edgeRouting':'ORTHOGONAL','elk.spacing.nodeNode':'64','elk.layered.spacing.nodeNodeBetweenLayers':'140',
   'elk.layered.considerModelOrder.strategy':'NODES_AND_EDGES','elk.randomSeed':'1',
   'elk.padding':'[top=42,left=42,bottom=42,right=42]'},
   children:graph.nodes.map(node=>({id:node.id,...nodeSize(node)})),
   edges:graph.edges.map(edge=>({id:edge.id,sources:[edge.source],targets:[edge.target],
    labels:[{text:edge.label,width:Math.min(180,edge.label.length*7.5+12),height:22}]}))};
  const result=await elk.layout(input);
  const nodes=Object.fromEntries((result.children||[]).map(n=>[n.id,{x:n.x!,y:n.y!,width:n.width!,height:n.height!}]));
  const edges:GraphLayout['edges']={};
  for(const edge of result.edges||[]){
   const points=(edge.sections||[]).flatMap(section=>[section.startPoint,...section.bendPoints||[],section.endPoint]);
   if(points.length<2)throw new Error('The architecture layout did not route every connection.');
   const label=edge.labels?.[0];edges[edge.id]={points,label:label?.x!==undefined&&label.y!==undefined?{x:label.x+label.width!/2,y:label.y+15}:polylinePoint(points,.5)};
  }
  if(Object.keys(nodes).length!==graph.nodes.length||Object.keys(edges).length!==graph.edges.length)throw new Error('The architecture layout is incomplete.');
  return{width:result.width!,height:result.height!,nodes,edges};
 })();
 cache.set(key,task);task.catch(()=>cache.delete(key));
 // Bounded cache; layout depends on graph data rather than the playback clock.
 if(cache.size>32)cache.delete(cache.keys().next().value!);
 return task;
}
