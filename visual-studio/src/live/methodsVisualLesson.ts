import type {LiveChapter,LiveLesson,LiveNode,LiveVisual} from './lessonTypes';

type Presentation={method:string;why:string;visualEvidence:string;textMode:'labels'|'descriptive'};
function node(id:string,title:string,body:string,icon:string,color:string,at:number,tag:string):LiveNode{
 return{id,title,body,icon,color,at,tag};
}
function chapter(options:{
 id:string;title:string;teaching:string;question:string;years:string;start:number;end:number;
 visual:LiveVisual;roles:Record<string,string>;narration:string;cues:{at:number;text:string}[];
}):LiveChapter{
 return{
  id:options.id,title:options.title,teaching:options.teaching,years:options.years,question:options.question,
  roles:options.roles,sources:[],safeguard:'',
  narration:options.narration,narrationAt:.2,audio:'',
  start:options.start,end:options.end,finishedAt:options.end-1.5,transitionOut:.4,
  visualStart:options.start,visualEnd:options.end,
  continuity:{from:null,bridge:'One model, five teaching methods.'},
  cues:options.cues,
  visual:options.visual,
 };
}
const presentation=(method:string,why:string,evidence:string):Presentation=>({method,why,visualEvidence:evidence,textMode:'descriptive'});

export const METHODS_VISUAL_LESSON:LiveLesson={
 id:'methods_visual_demo',
 kind:'live_generated',
 title:'One neuron, five teaching methods',
 question:'How can the same neuron be explained as a build, a mechanism, a value, a comparison, a procedure, an algorithm, a history and a route?',
 duration:160,
 documentTitle:'Methods visual demo',
 example:{title:'Illustrative case: one neuron',description:'A single unit with two inputs, a bias and a sigmoid output. Every beat uses the same case.',icon:'cpu'},
 chapters:[
  chapter({
   id:'build',teaching:'construction',title:'Build the unit',years:'inputs → output',start:0,end:20,
   question:'How do the parts of a neuron fit together?',
   roles:{inputs:'inputs',weights:'weights',sum:'weighted sum',activation:'activation',output:'output'},
   narration:'A neuron is a weighted sum followed by an activation.',
   cues:[{at:0,text:'Start with two input signals.'},{at:4,text:'Each input is scaled by a weight.'},{at:9,text:'The weighted inputs and bias form one score.'},{at:14,text:'The activation shapes the output.'}],
   visual:{
    layout:'diagram',
    presentation:presentation('Construction','Build the unit from its parts so the equation has a physical shape.','Five nodes connected by labelled relations.'),
    nodes:[
     node('inputs','Inputs','Two input signals enter the unit. Each carries a value the network can weight.','zap','blue',0,'x₁, x₂'),
     node('weights','Weights','Each input is multiplied by a weight, so the unit can decide which signal matters.','scale','gold',4,'w₁, w₂'),
     node('sum','Weighted sum','The weighted inputs and the bias are added into a single score z.','cpu','green',8,'Σ wᵢxᵢ + b'),
     node('activation','Activation','The score passes through a nonlinear rule that shapes the output.','eye','coral',12,'σ(z)'),
     node('output','Output','The result is the unit’s prediction for this input.','check','purple',16,'ŷ'),
    ],
    connections:[
     {from:'inputs',to:'weights',label:'scaled by',at:3},
     {from:'weights',to:'sum',label:'adds',at:7},
     {from:'sum',to:'activation',label:'squashed by',at:11},
     {from:'activation',to:'output',label:'produces',at:15},
    ],
    columns:[],
    takeaway:'A neuron is a weighted sum followed by an activation.',
   },
  }),
  chapter({
   id:'mechanism',teaching:'mechanism',title:'The working parts',years:'fan-in',start:20,end:40,
   question:'What are the working parts of this neuron?',
   roles:{x1:'input x₁',x2:'input x₂',bias:'bias',hub:'sum'},
   narration:'Two inputs and a bias feed one weighted sum, then the activation turns it into an output.',
   cues:[{at:0,text:'Two inputs and a bias.'},{at:5,text:'They fan into one weighted sum.'},{at:11,text:'The activation turns the score into an output.'}],
   visual:{
    layout:'fanin',
    presentation:presentation('Mechanism','Show the dependency structure so the learner sees what feeds what.','Inputs fan into a single sum node.'),
    nodes:[
     node('x1','Input x₁','The first signal, carrying its own value and weight.','zap','blue',0,'x₁'),
     node('x2','Input x₂','The second signal, carrying its own value and weight.','zap','green',2,'x₂'),
     node('bias','Bias','A constant that shifts the score before activation.','scale','gold',4,'+ b'),
     node('hub','Weighted sum','The inputs and bias meet in one score, ready for the activation.','cpu','coral',7,'Σ'),
    ],
    connections:[
     {from:'x1',to:'hub',label:'w₁x₁',at:4},
     {from:'x2',to:'hub',label:'w₂x₂',at:4},
     {from:'bias',to:'hub',label:'+ b',at:5},
    ],
    columns:[],
    takeaway:'Inputs and bias fan into one weighted sum; the activation follows.',
   },
  }),
  chapter({
   id:'value',teaching:'quantitative',title:'From score to output',years:'0.77',start:40,end:60,
   question:'How does the score become a value between 0 and 1?',
   roles:{score:'score',sigmoid:'sigmoid',threshold:'threshold',output:'output'},
   narration:'The score z = 1.2 enters the sigmoid and becomes 0.77, above a 0.5 decision threshold.',
   cues:[{at:0,text:'The score is 1.2.'},{at:5,text:'Sigmoid compresses it.'},{at:10,text:'The output is 0.77.'}],
   visual:{
    layout:'concept',
    presentation:presentation('Quantitative','Anchor the abstraction in one measured value so the transformation is visible.','A score, a sigmoid curve and a threshold.'),
    nodes:[
     node('score','Score z = 1.2','The weighted sum plus bias before any nonlinearity.','scale','gold',0,'z = 1.2'),
     node('sigmoid','Sigmoid','A smooth S-curve that compresses any real score into 0–1.','eye','blue',4,'σ(z)'),
     node('threshold','Decision threshold','A score above 0.5 becomes a positive decision.','check','green',8,'> 0.5'),
     node('output','Output 0.77','The probability-like value the unit returns.','check','purple',12,'ŷ = 0.77'),
    ],
    connections:[
     {from:'score',to:'sigmoid',label:'squashed by',at:4},
     {from:'sigmoid',to:'output',label:'gives',at:9},
     {from:'output',to:'threshold',label:'compared to',at:12},
    ],
    columns:[],
    takeaway:'Sigmoid turns the score into a bounded output; the threshold turns it into a decision.',
   },
  }),
  chapter({
   id:'compare',teaching:'comparison',title:'Three activation choices',years:'same input',start:60,end:80,
   question:'How do sigmoid, ReLU and linear activations differ?',
   roles:{sigmoid:'Sigmoid',relu:'ReLU',linear:'Linear'},
   narration:'The same input meets three rules: sigmoid bounds it, ReLU bends it, linear passes it through.',
   cues:[{at:0,text:'The same input z meets three rules.'},{at:5,text:'Sigmoid bounds; ReLU hinges; linear passes through.'},{at:12,text:'The activation decides the output shape.'}],
   visual:{
    layout:'comparison',
    presentation:presentation('Aligned comparison','Compare the three rules on the same input so the difference is the only variable.','Three aligned columns with icons, formulas and tags.'),
    nodes:[
     node('sigmoid','Sigmoid','Compresses any score into a smooth S-curve, making outputs readable as probabilities.','scale','blue',0,'0 → 1  |  σ(z)'),
     node('relu','ReLU','Clips negative scores to zero and passes positives unchanged, creating a hinge.','zap','green',4,'0 → ∞  |  max(0, z)'),
     node('linear','Linear','Returns the score unchanged, so outputs grow without limit.','route','gold',8,'unbounded  |  y = z'),
    ],
    connections:[],
    columns:[],
    takeaway:'The activation decides the shape of the output, not the input.',
   },
  }),
  chapter({
   id:'procedure',teaching:'procedure',title:'Compute one example',years:'forward pass',start:80,end:100,
   question:'What are the exact steps for these numbers?',
   roles:{scale:'scale',add:'add bias',squash:'squash'},
   narration:'Scale 2 by 0.7, add the bias terms, then squash the score with sigma.',
   cues:[{at:0,text:'Scale the input by its weight.'},{at:5,text:'Add the bias and the second product.'},{at:10,text:'Squash the score into the output.'}],
   visual:{
    layout:'process',
    presentation:presentation('Procedure','Preserve the order of operations and keep each equation visible.','Three step cards with numbers, equations and results.'),
    nodes:[
     node('scale','1. Scale','Multiply the input by its weight: 2 × 0.7 = 1.4.','scale','blue',0,'2 × 0.7 = 1.4'),
     node('add','2. Add bias','Add the remaining weighted input and the bias: 1.4 − 0.5 + 0.3 = 1.2.','zap','gold',4,'= 1.2'),
     node('squash','3. Squash','Pass the score through sigma: σ(1.2) = 0.77.','eye','green',8,'= 0.77'),
    ],
    connections:[
     {from:'scale',to:'add',label:'then',at:4},
     {from:'add',to:'squash',label:'then',at:9},
    ],
    columns:[],
    takeaway:'Scale, add the bias, squash: that is one forward pass.',
   },
  }),
  chapter({
   id:'algorithm',teaching:'algorithm',title:'The forward pass',years:'trace',start:100,end:120,
   question:'What does the neuron do as an algorithm?',
   roles:{read:'read inputs',compute:'compute z',return:'return y'},
   narration:'Read the inputs, compute the score, return the output. No weights change.',
   cues:[{at:0,text:'Read the inputs, weights and bias.'},{at:5,text:'Compute the weighted sum plus bias.'},{at:10,text:'Return the activation output.'}],
   visual:{
    layout:'timeline',
    presentation:presentation('Algorithm','Make the state transition explicit, in order.','Three trace rows with state values.'),
    nodes:[
     node('read','Read inputs','Load the input vector, every weight and the bias.','search','purple',0,'x, w, b'),
     node('compute','Compute z','Multiply, sum and add the bias: z = 1.2.','cpu','gold',4,'z = 1.2'),
     node('return','Return y','Pass z through the activation: y = 0.77. No weights change.','check','green',8,'y = 0.77'),
    ],
    connections:[],
    columns:[],
    takeaway:'One forward pass: no weights change.',
   },
  }),
  chapter({
   id:'history',teaching:'narrative',title:'How the idea evolved',years:'1958 → today',start:120,end:140,
   question:'Where did this model come from?',
   roles:{perceptron:'perceptron',backprop:'backpropagation',scale:'scale'},
   narration:'The perceptron came first, then backpropagation made credit assignment practical, then scale.',
   cues:[{at:0,text:'1958: the perceptron.'},{at:5,text:'1986: backpropagation.'},{at:10,text:'Today: scale and deep networks.'}],
   visual:{
    layout:'timeline',
    presentation:presentation('Narrative','Place the idea on a dated axis so the sequence is visible.','A dated timeline with three stations.'),
    nodes:[
     node('perceptron','Perceptron','1958: the first trainable unit.','book','blue',0,'1958'),
     node('backprop','Backpropagation','1986: credit assignment became practical.','route','purple',4,'1986'),
     node('scale','Scale','Today: deep networks and hardware.','cpu','green',8,'Today'),
    ],
    connections:[],
    columns:[],
    takeaway:'The idea moved from one unit to a trainable network.',
   },
  }),
  chapter({
   id:'recall',teaching:'recall',title:'Remember the three moves',years:'W → S → A',start:140,end:160,
   question:'How can I remember what a neuron does?',
   roles:{weight:'weight',sum:'sum',activate:'activate'},
   narration:'Weight the input, sum the evidence, activate the result.',
   cues:[{at:0,text:'W: weight the input.'},{at:5,text:'S: sum the evidence.'},{at:10,text:'A: activate the result.'}],
   visual:{
    layout:'loci',
    presentation:presentation('Recall','Use a route and a mnemonic so the sequence is memorable.','Three large stations on a route, each with a letter.'),
    nodes:[
     node('weight','Weight','Each input is scaled by its connection weight.','scale','blue',0,'W'),
     node('sum','Sum','The weighted inputs are added into one score.','cpu','purple',4,'S'),
     node('activate','Activate','The score is transformed into the output.','eye','green',8,'A'),
    ],
    connections:[
     {from:'weight',to:'sum',label:'then',at:5},
     {from:'sum',to:'activate',label:'then',at:10},
    ],
    columns:[],
    takeaway:'Weight, sum, activate: the three moves of a neuron.',
   },
  }),
 ],
 sources:[],
};
