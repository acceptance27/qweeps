import {REMIX_ENGINE_REVISION,compileSourceCodeToWalkthrough,getInitialQweepsRepoWalkthrough,applyAiExplanatoryGaps,type RemixBundle} from './runtime.js';

/** Refresh compiled data when the supplied engine changes; keep saved source
 * and input, and retain completed AI prose without replacing the new geometry. */
export function currentBundle(bundle:RemixBundle):RemixBundle{
 if(bundle.engineRevision===REMIX_ENGINE_REVISION)return bundle;
 if(bundle.id.startsWith('bundle-qweeps-'))return {...getInitialQweepsRepoWalkthrough(),engineRevision:REMIX_ENGINE_REVISION};
 const store=bundle.macroGraph.nodes.find(n=>n.kind==='store');
 let updated=compileSourceCodeToWalkthrough({id:bundle.id,title:bundle.title,fileName:Object.keys(bundle.macroGraph.codeFiles||{})[0]||'pipeline.py',sourceCode:bundle.sourceCode,sampleInput:bundle.sampleInput,sampleStoreLabel:store?.label,sampleStorePreview:store?.defaultPreview});
 if(bundle.aiFillTimeMs&&bundle.aiFillStatus==='filled'){
  updated=applyAiExplanatoryGaps(updated,{beatExplanations:bundle.macroSteps.map(s=>({beatNumber:s.beatNumber,question:s.question,narration:s.narration,takeaway:s.takeaway,goalText:s.question,lineExplanation:s.takeaway})),nodeExplanations:bundle.macroGraph.nodes.map(n=>({nodeId:n.id,subtitle:n.subtitle,description:n.description,roleSummary:n.roleSummary})),subStepExplanations:Object.values(bundle.subFunctions).map(fn=>({stepId:fn.id,goalText:fn.summary,narration:fn.steps[0]?.narration||fn.summary,takeaway:fn.steps[0]?.takeaway||fn.summary})),contextualQuestions:bundle.contextualQuestions},bundle.aiFillTimeMs);
 }
 return {...updated,engineRevision:REMIX_ENGINE_REVISION};
}
