import type {LiveChapter,LiveLesson} from './lessonTypes';
import type {SceneProgram} from './sceneProgram';
import {METHOD_PROGRAMS} from './methodsPrograms';

function chapter(options:{
 id:string;title:string;teaching:string;question:string;scene:SceneProgram;roles:Record<string,string>;
 start:number;end:number;finishedAt:number;takeaway:string;narration:string;
 cue:{at:number;text:string;target:string}[];
}):LiveChapter{
 return{
  id:options.id,title:options.title,teaching:options.teaching,years:'1958–today',
  question:options.question,roles:options.roles,sources:[],safeguard:'',
  narration:options.narration,narrationAt:.2,audio:'',start:options.start,end:options.end,
  finishedAt:options.finishedAt,transitionOut:.4,visualStart:options.start,visualEnd:options.end,
  continuity:{from:null,bridge:'Five methods, one model, one clock.'},
  cues:options.cue.map(({at,text})=>({at,text})),
  narrationCues:options.cue.map(({at,text,target},index)=>({
   target,text,start:at,end:options.cue[index+1]?.at??options.end-options.start,
  })),
  visual:{
   layout:'concept',
   presentation:{method:options.teaching,why:'The method decides the shape of the explanation.',visualEvidence:'A settled poster with semantic slots.',textMode:'descriptive'},
   nodes:[],connections:[],columns:[],
   takeaway:options.takeaway,
  },
  scene:options.scene,
 };
}

export const METHODS_DEMO_LESSON:LiveLesson={
 id:'methods_demo',
 kind:'live_generated',
 title:'Five ways to explain one model',
 question:'How do comparison, procedure, algorithm, narrative and recall explain the same neuron?',
 duration:45.6,
 documentTitle:'Beats 4–8 · live scene player',
 example:{title:'One neuron, five methods',description:'Each chapter uses a different teaching method and settled poster.',icon:'zap'},
 chapters:[
  chapter({
   id:'beat-4-comparison',title:'Three activation choices',teaching:'comparison',
   question:'How do sigmoid, ReLU and linear activations differ?',
   scene:METHOD_PROGRAMS.comparison,
   roles:{route:'the shared input',sigmoid:'Sigmoid',relu:'ReLU',linear:'Linear'},
   start:0,end:8.6,finishedAt:8.2,
   takeaway:'The activation decides the shape of the output, not the input.',
   narration:'The same input meets three activation rules. The rule decides the output shape.',
   cue:[
    {at:0,text:'One input, three activation rules.',target:'route'},
    {at:2.5,text:'Sigmoid bounds, ReLU bends, linear passes the score through.',target:'sigmoid'},
    {at:6,text:'The rule decides the shape.',target:'takeaway'},
   ],
  }),
  chapter({
   id:'beat-5-procedure',title:'Compute one example',teaching:'procedure',
   question:'What are the exact steps for these numbers?',
   scene:METHOD_PROGRAMS.procedure,
   roles:{scale:'scale',add:'add bias',squash:'squash'},
   start:8.6,end:17.6,finishedAt:17.2,
   takeaway:'Scale, add the bias, squash: that is one forward pass.',
   narration:'Scale the input, add the bias, then squash the score.',
   cue:[
    {at:0,text:'Start with the input.',target:'scale'},
    {at:2.5,text:'Add the bias, then squash the score.',target:'add'},
    {at:6,text:'That is the full forward pass.',target:'takeaway'},
   ],
  }),
  chapter({
   id:'beat-6-algorithm',title:'The forward pass',teaching:'algorithm',
   question:'What does the neuron do as an algorithm?',
   scene:METHOD_PROGRAMS.algorithm,
   roles:{read:'read inputs',compute:'compute z',return:'return y'},
   start:17.6,end:26.6,finishedAt:26.2,
   takeaway:'One forward pass: no weights change.',
   narration:'Read the inputs, compute the score, return the output.',
   cue:[
    {at:0,text:'Read the inputs.',target:'read'},
    {at:2.5,text:'Compute z, then return y.',target:'compute'},
    {at:6,text:'The pass is complete.',target:'takeaway'},
   ],
  }),
  chapter({
   id:'beat-7-narrative',title:'How the idea evolved',teaching:'narrative',
   question:'Where did this model come from?',
   scene:METHOD_PROGRAMS.narrative,
   roles:{perceptron:'perceptron',backprop:'backpropagation',scale:'scale'},
   start:26.6,end:36.6,finishedAt:36.2,
   takeaway:'The idea moved from one unit to a trainable network.',
   narration:'The perceptron came first, then credit assignment, then scale.',
   cue:[
    {at:0,text:'1958: one trainable unit.',target:'perceptron'},
    {at:3,text:'1986: credit assignment.',target:'backprop'},
    {at:7,text:'That is the arc.',target:'takeaway'},
   ],
  }),
  chapter({
   id:'beat-8-recall',title:'Remember the three moves',teaching:'recall',
   question:'How can I remember what a neuron does?',
   scene:METHOD_PROGRAMS.recall,
   roles:{weight:'weight',sum:'sum',activate:'activate'},
   start:36.6,end:45.6,finishedAt:45.2,
   takeaway:'Weight, sum, activate: the three moves of a neuron.',
   narration:'Weight the input, sum the evidence, activate the result.',
   cue:[
    {at:0,text:'Weight the input.',target:'weight'},
    {at:2.5,text:'Sum the evidence, then activate.',target:'sum'},
    {at:6,text:'Three moves, one neuron.',target:'takeaway'},
   ],
  }),
 ],
 sources:[],
};
