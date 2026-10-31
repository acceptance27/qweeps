import {lineLoop,pathD,measurePacing} from './morph';
import type {Scene,SceneAction,SceneObject} from './scene';
import {
 PAINT,textWidth,wrapText,layoutCompound,compoundBox,
 type Compound,type CompoundKind,type Role,
} from './compounds';

export type ProgramLine={id:string;kind:'line';from:[number,number];to:[number,number];role?:Role;strokeWidth?:number;opacity?:number};
export type ProgramObject=SceneObject|Compound|ProgramLine;
export type ProgramAction=
 | SceneAction
 | {at:number;duration:number;kind:'morph';id:string;to:string;mode:'replace'|'copy'}
 | {at:number;duration:number;kind:'dock';ids:string[];x?:number;y?:number;scale?:number};
export type SceneProgram={
 title:string;teaching:string;duration:number;objects:ProgramObject[];actions:ProgramAction[];
 conclusion?:{text:string;x:number;y:number};
 context?:{label?:string};
};

export type ProgramFinding={code:string;severity:'error'|'warning';message:string;id?:string};
export type CompiledProgram={ok:boolean;findings:ProgramFinding[];scene:Scene|null;stats:{compounds:number;slots:number;actions:number;density:number;hold:number;startsPer10s:number}};

const COMPOUND_KINDS:CompoundKind[]=['comparison-card','step-card','sum-node','value-pill','icon-chip','axis','number-line','bars','callout','brace','trace-row','station'];
const isCompound=(object:ProgramObject):object is Compound=>COMPOUND_KINDS.includes((object as Compound).kind);
const isLine=(object:ProgramObject):object is ProgramLine=>object.kind==='line';

const GRAMMARS=['comparison','procedure','algorithm','narrative','recall','quantitative','construction','mechanism'];

/**
 * Expand the model-facing program into the primitive scene consumed by
 * SceneStage. The model picks compounds and fills slots; this compiler owns
 * poster layout, hull paths, inner-slot positions, settle timing and the
 * final-state density gate.
 */
export function compileSceneProgram(program:SceneProgram):CompiledProgram{
 const findings:ProgramFinding[]=[];
 const compounds=program.objects.filter(isCompound);
 const primitives=program.objects.filter(object=>!isCompound(object));
 const ids=program.objects.map(object=>object.id);
 if(!program.title?.trim()||!program.teaching?.trim())findings.push({code:'header',severity:'error',message:'Scene needs a title and teaching method.'});
 if(!GRAMMARS.includes(program.teaching))findings.push({code:'teaching',severity:'error',message:`Unknown teaching grammar "${program.teaching}".`});
 if(!(program.duration>=4&&program.duration<=30))findings.push({code:'duration',severity:'error',message:'Scene duration must be 4–30 seconds.'});
 if(compounds.length>10)findings.push({code:'compound_count',severity:'error',message:'Use at most ten compounds.'});
 if(primitives.length>8)findings.push({code:'primitive_count',severity:'error',message:'Use at most eight supporting primitives.'});
 if(new Set(ids).size!==ids.length)findings.push({code:'duplicate_id',severity:'error',message:'Object ids must be unique.'});
 for(const primitive of primitives){
  if(primitive.kind==='rect')findings.push({code:'naked_box',severity:'error',message:'Use a compound instead of a bare rect.',id:primitive.id});
  if(primitive.kind==='circle'&&((primitive.r??0)>14||primitive.label))findings.push({code:'naked_node',severity:'error',message:'Use icon-chip/station/sum-node instead of a bare labeled circle.',id:primitive.id});
 }
 for(const compound of compounds)findings.push(...checkCompoundSlots(compound));
 if(!program.conclusion?.text?.trim())findings.push({code:'missing_conclusion',severity:'error',message:'Add one conclusion callout for the settled poster.'});
 if(program.conclusion&&program.conclusion.text.length>110)findings.push({code:'conclusion_budget',severity:'error',message:'Keep the conclusion under 110 characters.'});

 findings.push(...checkGrammar(program,compounds,primitives));
 const fatal=findings.some(finding=>finding.severity==='error');
 if(fatal)return{ok:false,findings,scene:null,stats:emptyStats(compounds,program.actions)};

 const placed=placeCompounds(program,compounds);
 const layouts=placed.map(({compound,box})=>{
  const placedCompound={...compound,x:box.x,y:box.y,width:box.width,height:box.height};
  return{compound:placedCompound,layout:layoutCompound(placedCompound)};
 });
 const all:SceneObject[]=[];
 const compoundIds:Record<string,string>={};
 for(const{compound,layout}of layouts){
  all.push(layout.hull,...layout.slots);
  compoundIds[compound.id]=layout.hull.id;
 }
 for(const primitive of primitives){
  if(isLine(primitive))all.push({id:primitive.id,kind:'path',d:pathD(lineLoop(primitive.from,primitive.to)),stroke:PAINT[primitive.role??'blue'],strokeWidth:primitive.strokeWidth??2,opacity:primitive.opacity??0});
  else all.push(primitive as SceneObject);
 }
 const extras=grammarExtras(program,layoutBoxes(layouts,compounds));
 all.push(...extras.objects);
 const conclusion:SceneObject[]=program.conclusion?[{id:'conclusion',kind:'text',x:program.conclusion.x,y:program.conclusion.y,text:program.conclusion.text,size:19,fill:'#edca82',anchor:'middle',opacity:0}]:[];
 const poster:SceneObject={id:'poster',kind:'group',children:all,opacity:1};

 const actions:SceneAction[]=program.teaching==='comparison'
  ? comparisonTimeline(program,compounds,layouts,extras)
  : autoTimeline(program,compounds,layouts,extras);
 if(program.conclusion){const last=Math.max(0,...actions.map(a=>a.at+a.duration));actions.push({at:Math.min(program.duration-1.6,Math.max(last+.3,program.duration-2)),duration:.4,kind:'show',id:'conclusion'});}
 actions.sort((a,b)=>a.at-b.at);

 const scene:Scene={
  id:program.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,40)||'scene',
  title:program.title,question:program.conclusion?.text??program.title,
  teaching:program.teaching,duration:program.duration,objects:[poster,...conclusion],actions,
 };
 const end=Math.max(0,...actions.map(action=>action.at+action.duration));
 const hold=Math.round((program.duration-end)*100)/100;
 if(hold<1.5)findings.push({code:'settle_hold',severity:'error',message:`The settled poster holds only ${hold}s; hold at least 1.5s.`});
 const pacing=measurePacing(actions,program.duration);
 if(!pacing.passes)findings.push({code:'pacing',severity:'error',message:`Pacing needs ≥2 starts/10s and ≤2.5s max dead hold (got ${pacing.startsPer10s} starts/10s, ${pacing.maxHold}s hold).`});
 if(findings.some(finding=>finding.severity==='error'))return{ok:false,findings,scene:null,stats:{...emptyStats(compounds,actions),hold,startsPer10s:pacing.startsPer10s}};

 const density=posterDensity(layouts);
 return{ok:true,findings,scene,stats:{compounds:compounds.length,slots:layouts.reduce((sum,item)=>sum+item.layout.slots.length,0),actions:actions.length,density,hold,startsPer10s:pacing.startsPer10s}};
}

function emptyStats(compounds:Compound[],actions:unknown[]){return{compounds:compounds.length,slots:compounds.length*3,actions:actions.length,density:0,hold:0,startsPer10s:0};}

function checkCompoundSlots(compound:Compound):ProgramFinding[]{
 const findings:ProgramFinding[]=[];
 const slots=compound.slots??{};
 const required:Record<CompoundKind,string[]>=
  {'comparison-card':['title','value'],'step-card':['title','value'],'sum-node':['title','value'],
   'value-pill':['value'],'icon-chip':['title','icon'],axis:['ticks'],'number-line':['ticks'],bars:['bars'],
   callout:['value'],brace:['value'],'trace-row':['title','value'],station:['title','value']};
 for(const key of required[compound.kind]){
  const value=(slots as Record<string,unknown>)[key];
  if(value==null||(typeof value==='string'&&!value.trim())||(Array.isArray(value)&&value.length===0))findings.push({code:'empty_slot',severity:'error',message:`${compound.kind} "${compound.id}" requires a non-empty ${key}.`,id:compound.id});
 }
 if(compound.kind==='comparison-card'){
  if(!slots.caption?.trim()&&!slots.detail?.trim())findings.push({code:'empty_slot',severity:'error',message:`Comparison card "${compound.id}" needs a caption or detail.`,id:compound.id});
  const criteria=slots.criteria??[];
  if(criteria.length<2||criteria.length>3)findings.push({code:'criteria_rows',severity:'error',message:`Comparison card "${compound.id}" needs 2–3 shared criteria rows.`,id:compound.id});
  const box=compoundBox(compound),contentBottom=(slots.formula?84:64)+criteria.length*34+8+36+56+18;
  if(contentBottom<box.height*.65)findings.push({code:'card_occupancy',severity:'error',message:`Comparison card "${compound.id}" leaves too much empty hull.`,id:compound.id});
 }
 if(compound.kind==='trace-row'&&slots.caption)findings.push({code:'slot_budget',severity:'warning',message:'Trace rows use title + state, not a paragraph.',id:compound.id});
 findings.push(...checkTextBudgets(compound));
 const layout=layoutCompound(compound);
 if(layout.slots.length<2)findings.push({code:'naked_box',severity:'error',message:`${compound.kind} "${compound.id}" has no inner slots; it is a naked box.`,id:compound.id});
 return findings;
}

const TEXT_LIMITS:Record<CompoundKind,{title?:number;value?:number;caption?:number;formula?:number;detail?:number;badge?:number;note?:number}> = {
 'comparison-card':{title:28,value:18,caption:65,formula:44,detail:160,badge:2},'step-card':{title:24,value:18,caption:90,formula:44,detail:160,badge:2},
 'sum-node':{title:20,value:18,caption:45},'value-pill':{value:20},'icon-chip':{title:18,caption:24},
 axis:{},'number-line':{},bars:{},callout:{title:18,value:140},brace:{value:28},
 'trace-row':{title:28,value:22,detail:70,note:80},station:{title:18,value:12,caption:32,detail:60,badge:2},
};

function checkTextBudgets(compound:Compound):ProgramFinding[]{
 const findings:ProgramFinding[]=[];
 const box=compoundBox(compound),slots=compound.slots??{},limits=TEXT_LIMITS[compound.kind];
 for(const key of ['title','value','caption','formula','detail','badge','note'] as const){
  const value=slots[key];const limit=limits[key];
  if(typeof value==='string'&&limit&&value.length>limit)findings.push({code:'slot_budget',severity:'error',message:`${compound.kind} "${compound.id}" ${key} exceeds ${limit} characters.`,id:compound.id});
 }
 if(compound.kind==='comparison-card'){
  if(slots.title&&textWidth(slots.title,19)>box.width-84)findings.push({code:'text_overflow',severity:'error',message:`Card "${compound.id}" title does not fit its measured width.`,id:compound.id});
  if(slots.value&&textWidth(slots.value,17)>box.width-36)findings.push({code:'text_overflow',severity:'error',message:`Card "${compound.id}" value does not fit its pill.`,id:compound.id});
  if(slots.caption&&!slots.detail){
   const lines=wrapText(slots.caption,box.width-36,13,2);
   if(lines.some(line=>line.endsWith('…')))findings.push({code:'text_overflow',severity:'error',message:`Card "${compound.id}" caption needs more than two lines.`,id:compound.id});
  }
  if(slots.formula&&textWidth(slots.formula,15)>box.width-84)findings.push({code:'text_overflow',severity:'error',message:`Card "${compound.id}" formula does not fit.`,id:compound.id});
  if(slots.detail){
   const lines=wrapText(slots.detail,box.width-36,13,3);
   if(lines.some(line=>line.endsWith('…')))findings.push({code:'text_overflow',severity:'error',message:`Card "${compound.id}" detail needs more than three lines.`,id:compound.id});
  }
  for(const criterion of slots.criteria??[]){
   if(!criterion.label?.trim()||!criterion.value?.trim())findings.push({code:'empty_slot',severity:'error',message:`Card "${compound.id}" has an empty criteria row.`,id:compound.id});
   if(criterion.label.length>24||criterion.value.length>18)findings.push({code:'slot_budget',severity:'error',message:`Card "${compound.id}" criteria text exceeds its budget.`,id:compound.id});
   if(textWidth(criterion.label,14)+textWidth(criterion.value,14)+28>box.width-36)findings.push({code:'text_overflow',severity:'error',message:`Card "${compound.id}" criteria row does not fit.`,id:compound.id});
  }
 }
 if(compound.kind==='step-card'){
  if(slots.formula&&textWidth(slots.formula,14)>box.width-32)findings.push({code:'text_overflow',severity:'error',message:`Step card "${compound.id}" formula does not fit.`,id:compound.id});
  if(slots.detail??slots.caption){
   const lines=wrapText(slots.detail??slots.caption??'',box.width-32,13,3);
   if(lines.some(line=>line.endsWith('…')))findings.push({code:'text_overflow',severity:'error',message:`Step card "${compound.id}" body needs more than three lines.`,id:compound.id});
  }
 }
 if(compound.kind==='station'&&slots.caption&&textWidth(slots.caption,12)>box.width-12)findings.push({code:'text_overflow',severity:'error',message:`Station "${compound.id}" caption does not fit.`,id:compound.id});
 if(compound.kind==='callout'&&slots.value){
  const lines=wrapText(slots.value,box.width-40,15,2);
  if(lines.some(line=>line.endsWith('…')))findings.push({code:'text_overflow',severity:'error',message:`Callout "${compound.id}" needs more than two lines.`,id:compound.id});
 }
 return findings;
}

function checkGrammar(program:SceneProgram,compounds:Compound[],primitives:ProgramObject[]):ProgramFinding[]{
 const findings:ProgramFinding[]=[];
 const of=(...kinds:CompoundKind[])=>compounds.filter(compound=>kinds.includes(compound.kind));
 const lines=primitives.filter(isLine);
 const has=(kind:string)=>program.actions.some(action=>action.kind===kind);
 const teaching=program.teaching;
 if(teaching==='comparison'){
  const cards=of('comparison-card');
  if(cards.length<2||cards.length>4)findings.push({code:'card_count',severity:'error',message:'A comparison scene needs 2–4 comparison-card compounds.'});
  if(lines.length<1)findings.push({code:'missing_route',severity:'error',message:'Add a route line that splits into the comparison cards.'});
  if(!program.actions.some(action=>action.kind==='morph'&&action.mode==='replace'))findings.push({code:'missing_morph',severity:'error',message:'Use a replace morph from the route to the first comparison card.'});
  if(!program.actions.some(action=>action.kind==='morph'&&action.mode==='copy'))findings.push({code:'missing_copy',severity:'error',message:'Use a copy morph from the route to the second comparison card.'});
  if(!has('dock'))findings.push({code:'missing_dock',severity:'error',message:'Dock the retained route context after the split.'});
  const labels=cards.map(card=>(card.slots.criteria??[]).map(criterion=>criterion.label.trim().toLowerCase()).join('|'));
  if(cards.length>1&&new Set(labels).size>1)findings.push({code:'criteria_mismatch',severity:'error',message:'Comparison cards must share the same criteria labels in the same order.'});
  if(!lines.length)findings.push({code:'missing_context',severity:'error',message:'A comparison poster needs a retained route context.'});
 }
 if(teaching==='procedure'){
  const steps=of('step-card');
  if(steps.length<3||steps.length>4)findings.push({code:'step_count',severity:'error',message:'A procedure poster needs 3–4 step-card compounds.'});
 }
 if(teaching==='algorithm'){
  const rows=of('trace-row');
  if(rows.length<3||rows.length>5)findings.push({code:'trace_count',severity:'error',message:'An algorithm poster needs 3–5 trace-row compounds.'});
 }
 if(teaching==='narrative'){
  if(of('axis').length!==1)findings.push({code:'axis_count',severity:'error',message:'A narrative poster needs exactly one axis.'});
  const stations=of('station');
  if(stations.length<3||stations.length>5)findings.push({code:'station_count',severity:'error',message:'A narrative poster needs 3–5 dated stations.'});
 }
 if(teaching==='recall'){
  if(lines.length<1)findings.push({code:'missing_route',severity:'error',message:'A recall poster needs a route line.'});
  const stations=of('station');
  if(stations.length<3||stations.length>4)findings.push({code:'station_count',severity:'error',message:'A recall poster needs 3–4 stations on the route.'});
 }
 if(teaching==='quantitative'){
  if(of('axis','number-line','bars').length!==1)findings.push({code:'chart_count',severity:'error',message:'A quantitative poster needs one axis, number-line or bars chart.'});
  const notes=of('callout');
  if(notes.length<2||notes.length>3)findings.push({code:'annotation_count',severity:'error',message:'A quantitative poster needs 2–3 annotation callouts.'});
 }
 if(teaching==='construction'||teaching==='mechanism'){
  if(of('sum-node','value-pill','icon-chip').length<3)findings.push({code:'node_count',severity:'error',message:'A construction/mechanism poster needs at least three semantic nodes.'});
  if(lines.length<1&&!primitives.some(object=>object.kind==='arrow'))findings.push({code:'relation_missing',severity:'error',message:'Add at least one relation line or arrow between nodes.'});
 }
 return findings;
}

function layoutBoxes(layouts:{compound:Compound;layout:ReturnType<typeof layoutCompound>}[],compounds:Compound[]){
 const byId:Record<string,{x:number;y:number;width:number;height:number}>={};
 for(const item of layouts)byId[item.compound.id]=item.layout.box;
 return{byId,compounds};
}

function placeCompounds(program:SceneProgram,compounds:Compound[]):{compound:Compound;box:{x:number;y:number;width:number;height:number}}[]{
 const explicit=compounds.every(compound=>compound.x!=null&&compound.y!=null);
 if(explicit||program.teaching==='comparison')return comparisonPlacement(compounds,program.teaching==='comparison');
 const byKind=(...kinds:CompoundKind[])=>compounds.filter(compound=>kinds.includes(compound.kind));
 if(program.teaching==='procedure'){
  const steps=byKind('step-card');
  const width=290,height=190,gap=stepGap(steps.length),start=(1440-(steps.length*width+(steps.length-1)*gap))/2;
  return steps.map((compound,index)=>({compound:{...compound,slots:{...compound.slots,index:`${index+1}/${steps.length}`}},box:{x:start+index*(width+gap),y:170,width,height}}));
 }
 if(program.teaching==='algorithm'){
  const rows=byKind('trace-row');
  return rows.map((compound,index)=>({compound,box:{x:160,y:126+index*78,width:1120,height:62}}));
 }
 if(program.teaching==='narrative'||program.teaching==='recall'){
  const stations=byKind('station');
  const axis=byKind('axis')[0];
  const route=program.objects.find(isLine) as ProgramLine|undefined;
  const left=route?Math.min(route.from[0],route.to[0]):180;
  const right=route?Math.max(route.from[0],route.to[0]):1260;
  const width=190,height=118;
  const placed:{compound:Compound;box:{x:number;y:number;width:number;height:number}}[]=[];
  if(program.teaching==='narrative'){
   const axisY=170,baseline=axisY+130*.55,stationY=baseline-20;
   const ticks=axis?.slots.ticks??[];
   const tickX=(label:string)=>{
    const index=ticks.findIndex(tick=>tick.label===label);
    return index<0?undefined:left+(right-left)/Math.max(ticks.length-1,1)*index;
   };
   stations.forEach((compound,index)=>{
    const fallback=stations.length===1?left+(right-left)/2:left+(right-left)*index/(stations.length-1);
    const x=tickX(compound.slots.value??'')??fallback;
    placed.push({compound:{...compound,slots:{...compound.slots,showValue:false}},box:{x:x-width/2,y:stationY,width,height}});
   });
   if(axis)placed.unshift({compound:axis,box:{x:left,y:axisY,width:right-left,height:130}});
   return placed;
  }
  const routeY=route?route.from[1]:300;
  stations.forEach((compound,index)=>{
   const fraction=stations.length===1?.5:index/(stations.length-1);
   placed.push({compound,box:{x:left+fraction*(right-left)-width/2,y:routeY-20,width,height}});
  });
  return placed;
 }
 if(program.teaching==='quantitative'){
  const chart=byKind('axis','number-line','bars')[0];
  const notes=byKind('callout');
  const placed:{compound:Compound;box:{x:number;y:number;width:number;height:number}}[]=[];
  if(chart)placed.push({compound:chart,box:{x:140,y:170,width:760,height:290}});
  notes.forEach((compound,index)=>placed.push({compound,box:{x:950,y:170+index*120,width:400,height:92}}));
  return placed;
 }
 const nodes=byKind('sum-node','value-pill','icon-chip');
 const width=250,gap=80;
 const start=(1440-(nodes.length*width+(nodes.length-1)*gap))/2;
 return nodes.map((compound,index)=>{
  const height=compound.kind==='sum-node'?160:compound.kind==='value-pill'?64:72;
  return{compound,box:{x:start+index*(width+gap),y:300-height/2,width,height}};
 });
}

function comparisonPlacement(compounds:Compound[],comparison:boolean){
 const cards=compounds.filter(compound=>compound.kind==='comparison-card');
 const rest=compounds.filter(compound=>compound.kind!=='comparison-card');
 if(!comparison||!cards.length)return compounds.map(compound=>({compound,box:compoundBox(compound)}));
 const width=cards.length<=2?420:cards.length===3?380:320;
 const gap=cards.length<=2?120:60;
 const height=380,startX=(1440-(cards.length*width+(cards.length-1)*gap))/2;
 return[...cards.map((compound,index)=>({compound,box:{x:startX+index*(width+gap),y:120,width,height}})),...rest.map(compound=>({compound,box:compoundBox(compound)}))];
}
function stepGap(count:number){return count>=4?24:36;}

function grammarExtras(program:SceneProgram,boxes:ReturnType<typeof layoutBoxes>){
 const objects:SceneObject[]=[];
 const actions:SceneAction[]=[];
 if(program.teaching==='procedure'){
  const steps=boxes.compounds.filter(compound=>compound.kind==='step-card');
  if(steps.length){
   const first=boxes.byId[steps[0].id],last=boxes.byId[steps[steps.length-1].id];
   const y=first.y-26;
   objects.push({id:'rail',kind:'path',d:pathD(lineLoop([first.x,y],[last.x+last.width,y])),stroke:PAINT.muted,strokeWidth:2,opacity:0});
   actions.push({at:.1,duration:.7,kind:'draw',id:'rail'});
  }
 }
 if(program.teaching==='algorithm'){
  objects.push({id:'trace-header-step',kind:'text',x:172,y:112,text:'step',size:12,fill:'#7899a5',opacity:0});
  objects.push({id:'trace-header-state',kind:'text',x:1268,y:112,text:'state',size:12,fill:'#7899a5',anchor:'end',opacity:0});
  actions.push({at:.1,duration:.3,kind:'show',id:'trace-header-step'},{at:.2,duration:.3,kind:'show',id:'trace-header-state'});
 }
 if(program.teaching==='comparison'){
  const route=program.objects.find(isLine);
  if(route){
   const minX=Math.min(route.from[0],route.to[0]),maxX=Math.max(route.from[0],route.to[0]);
   const contextY=86;
   objects.push({id:'context',kind:'path',d:pathD(lineLoop([minX,contextY],[maxX,contextY])),stroke:PAINT.blue,strokeWidth:2,opacity:0});
   objects.push({id:'context-label',kind:'text',x:(minX+maxX)/2,y:contextY-14,text:program.context?.label??'the same route',size:12,fill:'#7899a5',anchor:'middle',opacity:0});
   actions.push({at:.2,duration:.5,kind:'show',id:'context'},{at:.35,duration:.4,kind:'show',id:'context-label'});
  }
 }
 return{objects,actions};
}

function comparisonTimeline(program:SceneProgram,compounds:Compound[],layouts:{compound:Compound;layout:ReturnType<typeof layoutCompound>}[],extras:{objects:SceneObject[];actions:SceneAction[]}):SceneAction[]{
 const actions:SceneAction[]=[...extras.actions];
 const cardIds=new Set(compounds.filter(compound=>compound.kind==='comparison-card').map(compound=>compound.id));
 for(const action of program.actions){
  if(action.kind==='morph'&&'to' in action){
   const target=layouts.find(item=>item.compound.id===action.to);
   if(!target||!cardIds.has(action.to))continue;
   const paint=PAINT[target.compound.role??'blue'];
   const hullD=target.layout.hull.kind==='path'?target.layout.hull.d:'';
   actions.push({at:action.at,duration:action.duration,kind:'morph',id:action.id,d:hullD,mode:action.mode,fill:paint,fillOpacity:.07,stroke:paint,target:target.compound.id});
   target.layout.slots.forEach((slot,index)=>actions.push({at:action.at+action.duration*.65+index*.045,duration:.35,kind:'show',id:slot.id}));
  }else if(action.kind==='dock'){
   const scale=Math.min(1,Math.max(.7,action.scale??.8));
   const route=program.objects.find(isLine);
   const minX=route?Math.min(route.from[0],route.to[0]):260;
   const maxX=route?Math.max(route.from[0],route.to[0]):1180;
   const dockX=(1440-(maxX-minX)*scale)/2-minX*scale;
   actions.push({at:action.at,duration:action.duration,kind:'dock',id:'context',x:dockX,y:60-86*scale,scale});
  }else{
   actions.push(action as SceneAction);
  }
 }
 for(const object of extras.objects){
  if(object.id==='context'||object.id==='context-label')continue;
  actions.push({at:.3,duration:.4,kind:'show',id:object.id});
 }
 return actions;
}

function autoTimeline(program:SceneProgram,compounds:Compound[],layouts:{compound:Compound;layout:ReturnType<typeof layoutCompound>}[],extras:{objects:SceneObject[];actions:SceneAction[]}):SceneAction[]{
 const actions:SceneAction[]=[...extras.actions];
 const ordered=[...layouts].sort((a,b)=>a.layout.box.x-b.layout.box.x||a.layout.box.y-b.layout.box.y);
 const available=Math.max(1.2,program.duration-3.4);
 const step=Math.min(1.15,available/Math.max(ordered.length,1));
 ordered.forEach(({compound,layout},index)=>{
  const start=.25+index*step;
  actions.push({at:start,duration:.45,kind:'show',id:layout.hull.id});
  layout.slots.forEach((slot,slotIndex)=>actions.push({at:start+.28+slotIndex*.05,duration:.32,kind:'show',id:slot.id}));
  if(compound.kind==='trace-row'||compound.kind==='station')actions.push({at:start+.3,duration:.4,kind:'indicate',id:layout.hull.id});
 });
 for(const primitive of program.objects){
  if(isLine(primitive))actions.push({at:.15,duration:.6,kind:'draw',id:primitive.id});
  else if(!isCompound(primitive)&&primitive.kind!=='text')actions.push({at:.3,duration:.4,kind:'show',id:primitive.id});
  else if(!isCompound(primitive)&&primitive.kind==='text')actions.push({at:.4,duration:.4,kind:'show',id:primitive.id});
 }
 for(const object of extras.objects){
  if(actions.some(action=>action.id===object.id))continue;
  actions.push({at:.4,duration:.4,kind:'show',id:object.id});
 }
 if(ordered.length)actions.push({at:Math.max(.8,program.duration-4.2),duration:.5,kind:'indicate',id:ordered[Math.min(1,ordered.length-1)].layout.hull.id});
 return actions;
}

function posterDensity(layouts:{compound:Compound;layout:ReturnType<typeof layoutCompound>}[]):number{
 if(!layouts.length)return 0;
 const slots=layouts.reduce((sum,item)=>sum+item.layout.slots.length,0);
 return Math.round(slots/layouts.length*10)/10;
}

