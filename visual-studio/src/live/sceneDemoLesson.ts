import type {LiveLesson} from './lessonTypes';
import type {SceneProgram} from './sceneProgram';

const routeMechanism:SceneProgram={
 title:'How the rule becomes risk',
 teaching:'construction',
 duration:9,
 objects:[
  {id:'inputs',kind:'sum-node',role:'blue',slots:{title:'warning rule',value:'warning on',caption:'crews protected'}},
  {id:'sum',kind:'sum-node',role:'gold',slots:{title:'same route',value:'neutral',caption:'context unchanged'}},
  {id:'output',kind:'sum-node',role:'coral',slots:{title:'risk',value:'higher',caption:'warning off'}},
  {id:'rel1',kind:'arrow',from:[515,300],to:[595,300],stroke:'#8bd0df',opacity:0},
  {id:'rel2',kind:'arrow',from:[845,300],to:[925,300],stroke:'#edca82',opacity:0},
 ],
 actions:[],
 conclusion:{text:'A rule change propagates through the same route and surfaces as a new risk.',x:720,y:470},
};

export const SCENE_DEMO_LESSON:LiveLesson={
 id:'scene_demo',
 kind:'live_generated',
 title:'The same route, a different rule',
 question:'How does the same route produce a different risk?',
 duration:18,
 documentTitle:'P3 live scene integration',
 example:{title:'WWI at sea',description:'A construction scene, then a card comparison in the same player clock.',icon:'ship'},
 chapters:[
  {
   id:'scene-build',title:'Build the computation',teaching:'construction',years:'1916–1917',
   question:'How does a rule change become a new risk?',
   roles:{inputs:'inputs',sum:'weighted sum',output:'output',rel1:'first relation',rel2:'second relation'},
   sources:[],safeguard:'',
   narration:'The warning rule protects crews. The same route carries it. When the rule changes, the route surfaces a new risk.',
   narrationAt:.2,audio:'',start:0,end:9,finishedAt:8.5,transitionOut:.4,visualStart:0,visualEnd:9,
   continuity:{from:null,bridge:'Start with the mechanism, then compare the two cases.'},
   cues:[
    {at:0,text:'Start with the mechanism.'},
    {at:2,text:'The warning rule protects crews on the same route.'},
    {at:6.4,text:'That is the mechanism: rule, route, risk.'},
   ],
   visual:{
    layout:'concept',
    presentation:{method:'construction',why:'The route is a mechanism, not a list of facts.',visualEvidence:'Three semantic nodes with directed relations.',textMode:'descriptive'},
    nodes:[],connections:[],columns:[],
    takeaway:'A rule change propagates through the same route and surfaces as a new risk.',
   },
   scene:routeMechanism,
  },
  {
   id:'compare-cases',title:'Compare the two rules',teaching:'comparison',years:'1916–1917',
   question:'What changes when the rule changes, while the route stays the same?',
   roles:{'route':'the same route','rule':'the rule','risk':'the risk'},
   sources:[],safeguard:'',
   narration:'The route stays neutral. The rule changes, and the risk rises.',
   narrationAt:.2,audio:'',start:9,end:18,finishedAt:17.5,transitionOut:.4,visualStart:9,visualEnd:18,
   continuity:{from:'scene-build',bridge:'The mechanism now becomes a comparison.'},
   cues:[
    {at:0,text:'The route stays neutral.'},
    {at:3,text:'The rule changes: warning is dropped.'},
    {at:6.4,text:'That is the comparison: the route held, the rule changed.'},
   ],
   visual:{
    layout:'process',
    presentation:{method:'comparison',why:'Two cases share one route and differ on one rule.',visualEvidence:'Aligned cards with shared criteria.',textMode:'descriptive'},
    nodes:[
     {id:'route',title:'The same route',body:'Neutral shipping continues through the same sea lane.',icon:'ship',color:'blue',at:0,tag:'context'},
     {id:'rule',title:'The rule changes',body:'Warning is dropped in February 1917.',icon:'scale',color:'gold',at:2,tag:'change'},
     {id:'risk',title:'The risk rises',body:'Attacks without warning raise the risk to ships and crews.',icon:'warning',color:'coral',at:4,tag:'effect'},
    ],
    connections:[
     {from:'route',to:'rule',label:'same route',at:1},
     {from:'rule',to:'risk',label:'new risk',at:3},
    ],
    columns:[],
    takeaway:'The route held; the rule changed the risk.',
   },
  },
 ],
 sources:[],
};
