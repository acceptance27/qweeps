import type {IRScene} from './ir';

export type IRFixture={
 id:string;title:string;question:string;teaching:string;insight:string;narration:string;scene:IRScene;
};

const construction:IRScene={
 objects:[
  {id:'x1',kind:'circle',r:15,role:'blue',label:'x₁ = 2',labelSize:5.2},
  {id:'x2',kind:'circle',r:15,role:'coral',label:'x₂ = 1',labelSize:5.2},
  {id:'sum',kind:'circle',r:19,role:'white',label:'z = 0.9',labelSize:5.2},
  {id:'a1',kind:'arrow',from:'x1',to:'sum',role:'blue',label:'× 0.7',labelSize:6,labelOffset:5},
  {id:'a2',kind:'arrow',from:'x2',to:'sum',role:'coral',label:'× −0.5',labelSize:6,labelOffset:5},
  {id:'inputs',kind:'group',children:['x1','x2']},
 ],
 layout:[
  {op:'arrange',id:'inputs',dir:'DOWN',buff:16},
  {op:'next_to',id:'sum',ref:'inputs',dir:'RIGHT',buff:28},
 ],
};

const mechanism:IRScene={
 objects:[
  {id:'x1',kind:'circle',r:13,role:'blue',label:'x₁',labelSize:5.2},
  {id:'x2',kind:'circle',r:13,role:'coral',label:'x₂',labelSize:5.2},
  {id:'bias',kind:'circle',r:13,role:'gold',label:'b',labelSize:5.2},
  {id:'hub',kind:'circle',r:19,role:'white',label:'Σ',labelSize:7},
  {id:'a1',kind:'arrow',from:'x1',to:'hub',role:'blue',label:'w₁',labelSize:5},
  {id:'a2',kind:'arrow',from:'x2',to:'hub',role:'coral',label:'w₂',labelSize:5},
  {id:'a3',kind:'arrow',from:'bias',to:'hub',role:'gold',label:'+b',labelSize:5},
  {id:'inputs',kind:'group',children:['x1','x2','bias']},
 ],
 layout:[
  {op:'arrange',id:'inputs',dir:'DOWN',buff:10},
  {op:'next_to',id:'hub',ref:'inputs',dir:'RIGHT',buff:30},
 ],
};

const quantitative:IRScene={
 objects:[
  {id:'score',kind:'number-line',min:0,max:1,value:0.77,width:76,role:'white'},
  {id:'caption',kind:'text',text:'0.77 sits between the 0.5 midpoint and 1',size:6,maxWidth:78,role:'white'},
 ],
 layout:[
  {op:'move_to',id:'score',at:[50,45]},
  {op:'move_to',id:'caption',at:[50,74]},
 ],
};

export const IR_FIXTURES:IRFixture[]=[
 {id:'construction',title:'Build the weighted inputs',question:'How do weights turn raw inputs into signed products?',
  teaching:'construction',insight:'Each input is scaled by its own weight before anything is combined.',
  narration:'Two inputs enter. The first is scaled by plus zero point seven; the second by minus zero point five. Those signed products are what the neuron combines.',
  scene:construction},
 {id:'mechanism',title:'How the parts feed the score',question:'What are the working parts of this neuron?',
  teaching:'mechanism',insight:'Two weighted inputs and a bias converge on one sum.',
  narration:'Here is the same neuron as a mechanism. Two weighted inputs and a bias arrive from the left and converge on one sum.',
  scene:mechanism},
 {id:'quantity',title:'Where the score sits',question:'How does the score become a value between 0 and 1?',
  teaching:'quantitative',insight:'The output 0.77 sits above the midpoint of a bounded zero-to-one scale.',
  narration:'The score maps onto a zero-to-one scale. The output is zero point seven seven, above the halfway mark and below one.',
  scene:quantitative},
];
