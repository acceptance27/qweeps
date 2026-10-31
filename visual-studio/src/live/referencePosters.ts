import type {SceneProgram} from './sceneProgram';
import {REFERENCE_PROGRAM} from './referenceProgram';

const BLUE='#8bd0df',CORAL='#eda994',GOLD='#edca82',GREEN='#9dceb1',PURPLE='#c4b0e2';

const procedure:SceneProgram={
 title:'From evidence to decision',
 teaching:'procedure',
 duration:9,
 objects:[
  {id:'s1',kind:'step-card',role:'blue',slots:{title:'Survey',value:'identify',icon:'search',caption:'list every claim and source in the brief.'}},
  {id:'s2',kind:'step-card',role:'green',slots:{title:'Isolate',value:'restrict',icon:'lock',caption:'separate the rule change from the route.'}},
  {id:'s3',kind:'step-card',role:'gold',slots:{title:'Compare',value:'assess',icon:'scale',caption:'match the same criteria across both cases.'}},
  {id:'s4',kind:'step-card',role:'coral',slots:{title:'Decide',value:'act',icon:'flag',caption:'state the conclusion the evidence supports.'}},
 ],
 actions:[],
 conclusion:{text:'Survey, isolate, compare, decide: evidence becomes a defensible decision.',x:720,y:470},
};

const algorithm:SceneProgram={
 title:'Trace the rule change',
 teaching:'algorithm',
 duration:9,
 objects:[
  {id:'r1',kind:'trace-row',role:'blue',slots:{title:'read route',value:'neutral'}},
  {id:'r2',kind:'trace-row',role:'green',slots:{title:'check warning rule',value:'required'}},
  {id:'r3',kind:'trace-row',role:'gold',slots:{title:'apply new rule',value:'warning off'}},
  {id:'r4',kind:'trace-row',role:'coral',slots:{title:'update risk',value:'higher'}},
  {id:'r5',kind:'trace-row',role:'purple',slots:{title:'emit decision',value:'not war'}},
 ],
 actions:[],
 conclusion:{text:'The trace shows where the same route acquires a different risk.',x:720,y:555},
};

const narrative:SceneProgram={
 title:'A route through the war at sea',
 teaching:'narrative',
 duration:10,
 objects:[
  {id:'axis',kind:'axis',role:'muted',slots:{ticks:[{label:'1914'},{label:'1915'},{label:'1916'},{label:'1917'},{label:'1918'}]}},
  {id:'n1',kind:'station',role:'blue',slots:{title:'blockade',value:'1914',caption:'routes tighten'}},
  {id:'n2',kind:'station',role:'green',slots:{title:'Lusitania',value:'1915',caption:'neutral ships at risk'}},
  {id:'n3',kind:'station',role:'gold',slots:{title:'restrictions',value:'1916',caption:'warning required'}},
  {id:'n4',kind:'station',role:'coral',slots:{title:'unrestricted',value:'1917',caption:'the rule breaks'}},
 ],
 actions:[],
 conclusion:{text:'The same sea route carries a different rule, and a different risk, by 1917.',x:720,y:470},
};

const recall:SceneProgram={
 title:'Route, rule, risk',
 teaching:'recall',
 duration:9,
 objects:[
  {id:'route',kind:'line',from:[180,300],to:[1260,300],role:'blue',strokeWidth:2,opacity:0},
  {id:'r1',kind:'station',role:'blue',slots:{title:'warning',value:'1916',caption:'crew safety'}},
  {id:'r2',kind:'station',role:'gold',slots:{title:'same route',value:'neutral',caption:'context holds'}},
  {id:'r3',kind:'station',role:'coral',slots:{title:'risk',value:'1917',caption:'rule changed'}},
 ],
 actions:[],
 conclusion:{text:'Remember the chain: route, rule, risk. The route did not change; the rule did.',x:720,y:470},
};

const quantitative:SceneProgram={
 title:'Attacks after the rule change',
 teaching:'quantitative',
 duration:9,
 objects:[
  {id:'chart',kind:'bars',role:'blue',slots:{bars:[
   {label:'1915',value:12,display:'12'},
   {label:'1916',value:38,display:'38'},
   {label:'1917',value:64,display:'64'},
   {label:'1918',value:41,display:'41'},
  ]}},
  {id:'a1',kind:'callout',role:'coral',slots:{title:'peak',value:'1917 attacks rise after warning is dropped.'}},
  {id:'a2',kind:'callout',role:'green',slots:{title:'after',value:'1918 falls as convoys and escorts return.'}},
 ],
 actions:[],
 conclusion:{text:'The rule change coincides with the peak; the route alone does not explain it.',x:720,y:545},
};

const construction:SceneProgram={
 title:'How a neuron computes',
 teaching:'construction',
 duration:9,
 objects:[
  {id:'inputs',kind:'sum-node',role:'blue',slots:{title:'inputs',value:'x₁ … xₙ',caption:'evidence arrives'}},
  {id:'sum',kind:'sum-node',role:'gold',slots:{title:'weighted sum',value:'Σ wᵢxᵢ',caption:'weights decide salience'}},
  {id:'output',kind:'sum-node',role:'green',slots:{title:'output',value:'ŷ',caption:'thresholded decision'}},
  {id:'rel1',kind:'arrow',from:[515,310],to:[595,310],stroke:BLUE,opacity:0},
  {id:'rel2',kind:'arrow',from:[845,310],to:[925,310],stroke:GOLD,opacity:0},
 ],
 actions:[],
 conclusion:{text:'Inputs are weighted, summed and thresholded; the weights are the learned rule.',x:720,y:470},
};

const mechanism:SceneProgram={
 title:'The mechanism behind the risk',
 teaching:'mechanism',
 duration:9,
 objects:[
  {id:'m1',kind:'icon-chip',role:'blue',slots:{title:'warning',icon:'warning',caption:'no warning'}},
  {id:'m2',kind:'icon-chip',role:'green',slots:{title:'route',icon:'ship',caption:'the same route'}},
  {id:'m3',kind:'icon-chip',role:'gold',slots:{title:'rule',icon:'scale',caption:'the rule changes'}},
  {id:'m4',kind:'icon-chip',role:'coral',slots:{title:'risk',icon:'flag',caption:'higher risk'}},
  {id:'rel1',kind:'arrow',from:[350,300],to:[430,300],stroke:BLUE,opacity:0},
  {id:'rel2',kind:'arrow',from:[680,300],to:[760,300],stroke:GREEN,opacity:0},
  {id:'rel3',kind:'arrow',from:[1010,300],to:[1090,300],stroke:GOLD,opacity:0},
 ],
 actions:[],
 conclusion:{text:'A rule change propagates through the same route and surfaces as a new risk.',x:720,y:450},
};

export const REFERENCE_POSTERS:Record<string,SceneProgram>={
 comparison:REFERENCE_PROGRAM,
 procedure,algorithm,narrative,recall,quantitative,construction,mechanism,
};

export const GRAMMAR_LABELS:Record<string,string>={
 comparison:'Comparison',procedure:'Procedure',algorithm:'Algorithm',narrative:'Narrative',
 recall:'Recall',quantitative:'Quantitative',construction:'Construction',mechanism:'Mechanism',
};

export const POSTER_ORDER=['comparison','procedure','algorithm','narrative','recall','quantitative','construction','mechanism'];
