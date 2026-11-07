import type {ArchitectureGraph,ComputedGraphLayout} from '../types/lesson';
import {computeGeneratedLayout,initialGeneratedLayout} from './generatedLayout';
import {buildDeterministicInitialLayout as referenceInitial,normalizeGraphId} from './referenceLayout';
export {computeDynamicCardDimensions,computeProceduralCompoundContainerSpec,normalizeGraphId,getPolylineMidpoint,interpolatePointOnPolyline} from './referenceLayout';

const cache=new Map<string,ComputedGraphLayout>();
/** Only the explicit reference contract may use the authored RAG grammar.
 * New graph subjects use their actual dependency topology. */
function usesReferenceLayout(graph:ArchitectureGraph){
 return graph.layoutStyle==='reference'||(!graph.id.startsWith('generated-')&&normalizeGraphId(graph.id)==='qweeps-rag-4col-architecture');
}
export function buildDeterministicInitialLayout(graph:ArchitectureGraph,engineLabel:'elk'|'deterministic-fallback'='deterministic-fallback'):ComputedGraphLayout{
 if(!usesReferenceLayout(graph))return initialGeneratedLayout(graph);
 // The imported prototype computes compound dimensions on nodes. Isolate those
 // writes so seeking and cached graph contracts remain immutable.
 const copy=structuredClone(graph),layout=referenceInitial(copy,engineLabel);
 layout.systemBounds=layout.systemFrame;
 layout.compounds=Object.fromEntries(copy.nodes.filter(n=>n.compoundContainer).map(n=>[n.id,n.compoundContainer!]));
 return layout;
}
export async function computeElkGraphLayout(graph:ArchitectureGraph):Promise<ComputedGraphLayout>{
 const signature=JSON.stringify(graph),saved=cache.get(signature);if(saved)return saved;
 const layout=usesReferenceLayout(graph)?buildDeterministicInitialLayout(graph):await computeGeneratedLayout(graph).catch(()=>computeGeneratedLayout(graph,true));
 cache.set(signature,layout);return layout;
}
