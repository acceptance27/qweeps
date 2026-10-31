import {lineLoop,rectLoop,pathD} from './morph';
import type {Scene,SceneAction,SceneObject} from './scene';

const BLUE='#8bd0df',CORAL='#eda994',GOLD='#edca82',GREEN='#9dceb1',PURPLE='#c4b0e2',INK='#e6ecef',MUTED='#7899a5';
const card=(id:string,x:number,y:number,w:number,h:number,color:string):SceneObject=>({id,kind:'path',d:pathD(rectLoop(x,y,w,h)),fill:color,fillOpacity:.1,stroke:color,strokeWidth:2,opacity:0});
const line=(id:string,a:[number,number],b:[number,number],color:string):SceneObject=>({id,kind:'path',d:pathD(lineLoop(a,b)),stroke:color,strokeWidth:2,opacity:0});
const text=(id:string,x:number,y:number,value:string,size=22,color=INK,anchor:'start'|'middle'|'end'='start'):SceneObject=>({id,kind:'text',x,y,text:value,size,fill:color,anchor,opacity:0});
const circle=(id:string,cx:number,cy:number,r:number,color:string,label?:string,labelSize=22):SceneObject=>({id,kind:'circle',cx,cy,r,stroke:color,fill:'none',opacity:0,label,labelSize,labelFill:color});
const arrow=(id:string,from:[number,number],to:[number,number],color:string):SceneObject=>({id,kind:'arrow',from,to,stroke:color,opacity:0});
const show=(id:string,at=.2,d=.4):SceneAction=>({at,duration:d,kind:'show',id});
const move=(id:string,at:number,x:number,y:number,d=1.2):SceneAction=>({at,duration:d,kind:'move',id,x,y});
const indicate=(id:string,at:number):SceneAction=>({at,duration:.4,kind:'indicate',id});
const morph=(id:string,at:number,d:string,mode:'replace'|'copy',color:string,dur=1.2,fill=color):SceneAction=>({at,duration:dur,kind:'morph',id,d,mode,fill,fillOpacity:fill===color?.12:1,stroke:color});

const construction:Scene={
 id:'construction',title:'Build the weighted inputs',teaching:'construction',question:'How do weights turn raw inputs into signed products?',duration:6,
 objects:[
  line('base',[260,300],[1180,300],BLUE), circle('ship',340,300,10,BLUE),
  text('leftLabel',460,190,'x₁ = 2',24,BLUE,'middle'), text('rightLabel',980,190,'x₂ = 1',24,CORAL,'middle'),
  text('note',720,500,'weights scale each input before they meet',19,MUTED,'middle'),
  text('eq1',460,330,'2 × 0.7 = +1.4',20,BLUE,'middle'), text('eq2',980,330,'1 × −0.5 = −0.5',20,CORAL,'middle'),
 ],
 actions:[show('base',0),show('ship',.2),move('ship',.4,300,0,1.1),show('leftLabel',1.6),show('rightLabel',1.6),
  morph('base',1.6,pathD(rectLoop(260,210,400,180)),'replace',BLUE,1.2,'#0e2028'),morph('base',1.6,pathD(rectLoop(780,210,400,180)),'copy',CORAL,1.2,'#0e2028'),
  move('ship',1.6,120,0,1.2),show('note',2.9),show('eq1',2.7),show('eq2',2.7),indicate('ship',3.6)],
};

const mechanism:Scene={
 id:'mechanism',title:'How the parts feed the score',teaching:'mechanism',question:'What are the working parts of this neuron?',duration:6.4,
 objects:[
  circle('x1',300,160,34,BLUE,'x₁'), circle('x2',300,300,34,CORAL,'x₂'), circle('bias',300,440,34,GOLD,'b'),
  circle('hub',1040,300,60,INK,'Σ',30),
  arrow('a1',[335,160],[975,300],BLUE),arrow('a2',[335,300],[975,300],CORAL),arrow('a3',[335,440],[975,300],GOLD),
  text('w1',650,190,'w₁',20,BLUE,'middle'),text('w2',650,280,'w₂',20,CORAL,'middle'),text('wb',650,410,'+ b',20,GOLD,'middle'),
 ],
 actions:[show('x1',.2),show('x2',.4),show('bias',.6),show('a1',.9),show('a2',1.1),show('a3',1.3),show('hub',1.5),
  show('w1',1.8),show('w2',1.8),show('wb',1.8),indicate('hub',3.6)],
};

const quantitative:Scene={
 id:'quantitative',title:'Where the score sits',teaching:'quantitative',question:'How does the score become a value between 0 and 1?',duration:6.4,
 objects:[
  line('axis',[280,340],[1160,340],INK),
  text('zero',300,395,'0',20,MUTED,'middle'),text('half',720,395,'0.5',20,MUTED,'middle'),text('one',1140,395,'1',20,MUTED,'middle'),
  circle('marker',300,340,8,GOLD), text('score',300,300,'score z = 1.2',22,INK,'middle'),
  {id:'bar',kind:'rect',x:1074,y:250,width:30,height:90,rx:3,fill:GREEN,fillOpacity:.55,stroke:GREEN,opacity:0},
  circle('ring',1074,200,34,GREEN,'0.77',19), text('out',1074,135,'output',18,GREEN,'middle'),
 ],
 actions:[show('axis',0),show('zero',.3),show('half',.4),show('one',.5),show('score',.6),show('marker',.8),
  move('marker',1.0,657,0,2.0),show('bar',2.2),show('ring',2.8),show('out',2.9),indicate('ring',3.7)],
};

const comparison:Scene={
 id:'comparison',title:'Three activation choices',teaching:'comparison',question:'How do sigmoid, ReLU and linear activations differ?',duration:6.4,
 objects:[
  card('base',560,220,320,180,GOLD),
  text('sigmoid',340,170,'Sigmoid',24,BLUE,'middle'),text('relu',720,170,'ReLU',24,GREEN,'middle'),text('linear',1100,170,'Linear',24,GOLD,'middle'),
  text('s1',340,415,'0–1',20,BLUE,'middle'),text('r1',720,415,'max(0,z)',20,GREEN,'middle'),text('l1',1100,415,'y = z',20,GOLD,'middle'),
  text('b1',340,320,'smooth, bounded',19,BLUE,'middle'),text('b2',720,320,'zero below, linear above',19,GREEN,'middle'),text('b3',1100,320,'returns the raw score',19,GOLD,'middle'),
 ],
 actions:[show('base',.2),morph('base',1.2,pathD(rectLoop(180,180,320,220)),'replace',BLUE),morph('base',1.2,pathD(rectLoop(560,180,320,220)),'copy',GREEN),morph('base',1.2,pathD(rectLoop(940,180,320,220)),'copy',GOLD),
  show('sigmoid',2.0),show('relu',2.0),show('linear',2.0),show('s1',2.5),show('r1',2.5),show('l1',2.5),show('b1',2.8),show('b2',2.8),show('b3',2.8),indicate('sigmoid',3.5)],
};

const procedure:Scene={
 id:'procedure',title:'Compute one example',teaching:'procedure',question:'What are the exact steps for these numbers?',duration:6.6,
 objects:[
  line('rail',[180,310],[1260,310],MUTED), card('base',560,220,300,170,BLUE),
  text('n1',330,430,'1',24,BLUE,'middle'),text('n2',720,430,'2',24,GOLD,'middle'),text('n3',1110,430,'3',24,GREEN,'middle'),
  text('scale',330,190,'scale',20,BLUE,'middle'),text('add',720,190,'add bias',20,GOLD,'middle'),text('squash',1110,190,'squash',20,GREEN,'middle'),
  arrow('p1',[480,310],[570,310],MUTED),arrow('p2',[870,310],[960,310],MUTED),
  text('v1',330,320,'2 × 0.7 = 1.4',19,BLUE,'middle'),text('v2',720,320,'1.4 − 0.5 + 0.3 = 1.2',19,GOLD,'middle'),text('v3',1110,320,'σ(1.2) = 0.77',19,GREEN,'middle'),
 ],
 actions:[show('rail',0),show('base',.2),morph('base',1.1,pathD(rectLoop(180,220,300,170)),'replace',BLUE),morph('base',1.1,pathD(rectLoop(570,220,300,170)),'copy',GOLD),morph('base',1.1,pathD(rectLoop(960,220,300,170)),'copy',GREEN),
  show('n1',2.1),show('n2',2.1),show('n3',2.1),show('scale',2.4),show('add',2.4),show('squash',2.4),show('v1',2.6),show('v2',2.6),show('v3',2.6),show('p1',2.8),show('p2',2.8),indicate('n2',3.8)],
};

const algorithm:Scene={
 id:'algorithm',title:'The forward pass',teaching:'algorithm',question:'What does the neuron do as an algorithm?',duration:7,
 objects:[
  card('r1',300,150,840,90,PURPLE),card('r2',300,270,840,90,PURPLE),card('r3',300,390,840,90,PURPLE),
  {id:'highlight',kind:'rect',x:300,y:150,width:840,height:90,rx:3,fill:GOLD,fillOpacity:.1,stroke:GOLD,strokeWidth:2,opacity:0},
  text('t1',330,200,'Read inputs',24,INK),text('t2',330,320,'Compute z',24,INK),text('t3',330,440,'Return y',24,INK),
  text('v1',1030,200,'x, w, b',19,MUTED,'middle'),text('v2',1030,320,'z = 1.2',19,GOLD,'middle'),text('v3',1030,440,'y = 0.77',19,GREEN,'middle'),
  text('caption',720,530,'one forward pass · no weights change',18,MUTED,'middle'),
 ],
 actions:[show('r1',.2),show('r2',.4),show('r3',.6),show('t1',.8),show('t2',.9),show('t3',1.0),show('v1',1.2),show('v2',1.3),show('v3',1.4),show('caption',1.6),show('highlight',1.8),
  move('highlight',2.4,0,120,1.0),move('highlight',4.4,0,240,1.0),indicate('r3',5.8)],
};

const narrative:Scene={
 id:'narrative',title:'How the idea evolved',teaching:'narrative',question:'Where did this model come from?',duration:7,
 objects:[
  line('axis',[280,360],[1160,360],MUTED),
  circle('m1',300,360,8,GOLD),circle('m2',720,360,8,PURPLE),circle('m3',1140,360,8,GREEN),
  text('d1',300,305,'1958',22,GOLD,'middle'),text('d2',720,305,'1986',22,PURPLE,'middle'),text('d3',1140,305,'Today',22,GREEN,'middle'),
  text('e1',300,425,'Perceptron',20,INK,'middle'),text('e2',720,425,'Backpropagation',20,INK,'middle'),text('e3',1140,425,'Scale',20,INK,'middle'),
  circle('travel',300,360,12,GOLD),
 ],
 actions:[show('axis',0),show('m1',.3),show('m2',.4),show('m3',.5),show('d1',.7),show('d2',.8),show('d3',.9),show('e1',1.0),show('e2',1.1),show('e3',1.2),show('travel',1.4),
  move('travel',1.6,840,0,3.4),indicate('m2',3.0),indicate('m3',5.0)],
};

const recall:Scene={
 id:'recall',title:'Remember the three moves',teaching:'recall',question:'How can I remember what a neuron does?',duration:6.8,
 objects:[
  {id:'route',kind:'path',d:'M300 360 C520 120 920 120 1140 360',stroke:MUTED,strokeWidth:2,opacity:0},
  circle('w',300,360,58,BLUE,'W',36),circle('s',720,220,58,PURPLE,'S',36),circle('a',1140,360,58,GREEN,'A',36),
  text('wt',300,455,'Weight',22,INK,'middle'),text('st',720,315,'Sum',22,INK,'middle'),text('at',1140,455,'Activate',22,INK,'middle'),
  text('n1',300,190,'1',18,BLUE,'middle'),text('n2',720,100,'2',18,PURPLE,'middle'),text('n3',1140,190,'3',18,GREEN,'middle'),
 ],
 actions:[show('route',.2),{at:.5,duration:1.5,kind:'draw',id:'route'},show('w',1.8),show('s',2.0),show('a',2.2),show('wt',2.4),show('st',2.4),show('at',2.4),show('n1',2.6),show('n2',2.6),show('n3',2.6),indicate('s',4.4)],
};

export const METHODS_SCENES:Scene[]=[construction,mechanism,quantitative,comparison,procedure,algorithm,narrative,recall];
