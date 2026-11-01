import type {SceneAction, SceneObject} from './scene';
import type {Compound, CompoundLayout} from './compounds';
import type {SceneProgram} from './sceneProgram';

type Placed={compound:Compound;layout:CompoundLayout};
type Extras={objects:SceneObject[];actions:SceneAction[]};

const show=(id:string,at:number,duration=.4):SceneAction=>({at,duration,kind:'show',id});
const indicate=(id:string,at:number):SceneAction=>({at,duration:.45,kind:'indicate',id});
const move=(id:string,at:number,x:number,y:number,duration:number=.7):SceneAction=>({at,duration,kind:'move',id,x,y});

function hull(layout:CompoundLayout,at:number):SceneAction{return show(layout.hull.id,at,.45);}
function slots(layout:CompoundLayout,at:number,stagger=.05):SceneAction[]{
 return layout.slots.map((slot,index)=>({at:at+.26+index*stagger,duration:.3,kind:'show',id:slot.id}));
}
function placed(program:SceneProgram,layouts:Placed[],kind:Compound['kind']):Placed[]{
 return layouts.filter(item=>item.compound.kind===kind).sort((a,b)=>a.layout.box.x-b.layout.box.x||a.layout.box.y-b.layout.box.y);
}
function primitives(program:SceneProgram,at:number):SceneAction[]{
 const actions:SceneAction[]=[];
 for(const object of program.objects){
  if(object.kind==='line')actions.push({at,duration:.7,kind:'draw',id:object.id});
  else if(object.kind==='arrow')actions.push(show(object.id,at,.5));
  else if(object.kind==='circle'||object.kind==='text'||object.kind==='path')actions.push(show(object.id,at,.4));
 }
 return actions;
}

/** Old construction: build left-to-right, then let the relation land. */
function construction(program:SceneProgram,layouts:Placed[],extras:Extras):SceneAction[]{
 const actions=[...extras.actions,...primitives(program,.35)];
 const nodes=placed(program,layouts,'sum-node');
 const span=Math.max(1,(program.duration-4.4)/Math.max(nodes.length,1));
 nodes.forEach((node,index)=>{
  const at=.4+index*span;
  actions.push(hull(node.layout,at),...slots(node.layout,at+.2));
 });
 if(nodes.length)actions.push(indicate(nodes[Math.min(1,nodes.length-1)].layout.hull.id,program.duration-3.4));
 return actions;
}

/** Old mechanism: inputs arrive first, the chain closes, then the hub is marked. */
function mechanism(program:SceneProgram,layouts:Placed[],extras:Extras):SceneAction[]{
 const actions=[...extras.actions,...primitives(program,.3)];
 const nodes=placed(program,layouts,'icon-chip');
 const span=Math.max(1,(program.duration-4.4)/Math.max(nodes.length,1));
 nodes.forEach((node,index)=>actions.push(hull(node.layout,.4+index*span),...slots(node.layout,.55+index*span)));
 if(nodes.length)actions.push(indicate(nodes[Math.min(1,nodes.length-1)].layout.hull.id,program.duration-3.2));
 return actions;
}

/** Old quantitative: chart first, annotations second, peak indicated. */
function quantitative(program:SceneProgram,layouts:Placed[],extras:Extras):SceneAction[]{
 const actions=[...extras.actions,...primitives(program,.3)];
 const chart=placed(program,layouts,'bars')[0]??placed(program,layouts,'axis')[0]??placed(program,layouts,'number-line')[0];
 if(chart){
  actions.push(hull(chart.layout,.2),...slots(chart.layout,.35,.035));
  const values=chart.compound.slots.bars??[];
  if(values.length){
   const peak=values.reduce((best,item,index)=>item.value>values[best].value?index:best,0);
   const slot=chart.layout.slots.find(item=>item.id===`${chart.compound.id}-bar-${peak}`);
   if(slot)actions.push(indicate(slot.id,3.9));
  }
  actions.push(indicate(chart.layout.hull.id,program.duration-3.4));
 }
 placed(program,layouts,'callout').forEach((note,index)=>actions.push(hull(note.layout,1.8+index*.8),...slots(note.layout,1.95+index*.8)));
 return actions;
}

/** Old procedure: rail, then each step, then the result. */
function procedure(program:SceneProgram,layouts:Placed[],extras:Extras):SceneAction[]{
 const actions=[...extras.actions,...primitives(program,.3)];
 const steps=placed(program,layouts,'step-card');
 const span=Math.max(1.1,(program.duration-4.2)/Math.max(steps.length,1));
 steps.forEach((step,index)=>{
  const at=.4+index*span;
  actions.push(hull(step.layout,at),...slots(step.layout,at+.22));
  actions.push(indicate(step.layout.hull.id,at+.7));
 });
 return actions;
}

/** Old algorithm: rows reveal, the highlight sweeps down, state text follows. */
function algorithm(program:SceneProgram,layouts:Placed[],extras:Extras):SceneAction[]{
 const actions=[...extras.actions,...primitives(program,.25)];
 const rows=placed(program,layouts,'trace-row');
 rows.forEach((row,index)=>{
  const at=.3+index*.85;
  actions.push(hull(row.layout,at),...slots(row.layout,at+.2));
 });
 const highlight=extras.objects.find(object=>object.id==='trace-highlight');
 if(highlight&&rows.length){
  actions.push(show('trace-highlight',.65,.3));
  const start=.9,last=program.duration-3.4,span=rows.length>1?(last-start)/(rows.length-1):0;
  rows.forEach((row,index)=>{
   const at=start+index*span;
   const first=rows[0].layout.box;
   actions.push(move('trace-highlight',at,0,row.layout.box.y-first.y,.45));
   actions.push(indicate(row.layout.hull.id,at+.25));
  });
 }
 return actions;
}

/** Old narrative: axis, stations, travel dot, dated captions. */
function narrative(program:SceneProgram,layouts:Placed[],extras:Extras):SceneAction[]{
 const actions=[...extras.actions,...primitives(program,.3)];
 const axis=placed(program,layouts,'axis')[0];
 if(axis)actions.push(hull(axis.layout,.2),...slots(axis.layout,.35,.04));
 const stations=placed(program,layouts,'station');
 const travel=extras.objects.find(object=>object.id==='narrative-travel');
 const first=stations[0];
 const span=stations.length>1?Math.max(1.1,(program.duration-4.6)/(stations.length-1)):0;
 stations.forEach((station,index)=>{
  const at=.9+index*span;
  actions.push(hull(station.layout,at),...slots(station.layout,at+.2));
  actions.push(indicate(station.layout.hull.id,at+.55));
  if(travel&&first&&index>0)actions.push(move('narrative-travel',at,station.layout.box.x+station.layout.box.width/2-(first.layout.box.x+first.layout.box.width/2),0,.55));
 });
 if(travel&&first)actions.push(show('narrative-travel',.6,.3));
 return actions;
}

/** Old recall: route draws, stations land, mnemonic badges follow. */
function recall(program:SceneProgram,layouts:Placed[],extras:Extras):SceneAction[]{
 const actions=[...extras.actions,...primitives(program,.15)];
 const stations=placed(program,layouts,'station');
 const span=stations.length>1?Math.max(1.1,(program.duration-4.6)/(stations.length-1)):0;
 stations.forEach((station,index)=>{
  const at=.8+index*span;
  actions.push(hull(station.layout,at),...slots(station.layout,at+.22));
  actions.push(indicate(station.layout.hull.id,at+.6));
 });
 return actions;
}

export function motionTimeline(program:SceneProgram,layouts:Placed[],extras:Extras):SceneAction[]{
 switch(program.teaching){
  case'construction':return construction(program,layouts,extras);
  case'mechanism':return mechanism(program,layouts,extras);
  case'quantitative':return quantitative(program,layouts,extras);
  case'procedure':return procedure(program,layouts,extras);
  case'algorithm':return algorithm(program,layouts,extras);
  case'narrative':return narrative(program,layouts,extras);
  case'recall':return recall(program,layouts,extras);
  default:return [...extras.actions,...primitives(program,.25)];
 }
}
