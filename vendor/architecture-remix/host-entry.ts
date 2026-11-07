export {default as RemixApp} from './src/App';
export {compileSourceCodeToWalkthrough,applyAiExplanatoryGaps,PROCEDURAL_PIPELINE_PRESETS} from './src/procedural/proceduralCompiler';
export {compileRepoScanToWalkthrough,getInitialQweepsRepoWalkthrough} from './src/procedural/qweepsRepoCompiler';
export {validateLessonData} from './src/data/ragSteps';
export {computeElkGraphLayout} from './src/layout/elkLayout';
export {evaluateTimeline} from './src/timeline/evaluateTimeline';
import upstream from './UPSTREAM.json';
export const REMIX_ENGINE_REVISION=upstream.sha256;
