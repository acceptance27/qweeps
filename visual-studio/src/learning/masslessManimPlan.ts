import type {Plan} from './types';

const wave:number[][]=Array.from({length:21},(_,i)=>{
 const x=-1+i/10;
 return[x,Math.sin(x*Math.PI*2)*.55];
});

export const MASSLESS_MANIM_PLAN:Plan={
 title:'Massless matter · native Manim test',
 summary:'One native ManimGL beat: light carries energy and momentum; trapped at rest, the same energy appears as mass.',
 sources:[],
 beats:[{
  id:'beat_0',title:'Light Carries Energy and Momentum',
  narration:'Light has no rest mass, but it carries energy and momentum. Confined at rest, that same energy appears as mass.',
  duration:20,camera:{x:0,y:0,zoom:1},transitionDuration:1.2,narrationAt:0,
  elements:[
   {id:'photon_wave',kind:'path',x:-4.3,y:1.15,width:4.2,height:1.5,color:'#FFD166',label:'',description:'',points:wave,closed:false,smooth:true,revealAt:0,drawDuration:1.7,entrance:'draw'},
   {id:'photon_title',kind:'text',x:-4.3,y:2.55,width:4,height:.4,color:'#FFD166',label:'Propagating Photon',description:'',revealAt:.4,drawDuration:.7,entrance:'write'},
   {id:'photon_eq',kind:'text',x:-4.3,y:-.05,width:4,height:.4,color:'#FFD166',label:'E = hν   ·   p = E/c',description:'',revealAt:1.4,drawDuration:.7,entrance:'write'},
   {id:'invariant_triangle',kind:'path',x:0,y:1.1,width:3.2,height:2.2,color:'#58C4DD',label:'',description:'',points:[[-1,-1],[1,-1],[-1,1]],closed:true,smooth:false,revealAt:3,drawDuration:1.3,entrance:'draw'},
   {id:'invariant_eq',kind:'text',x:0,y:2.65,width:4,height:.4,color:'#58C4DD',label:'E² = (pc)² + (m₀c²)²',description:'',revealAt:3.8,drawDuration:.7,entrance:'write'},
   {id:'invariant_title',kind:'text',x:0,y:-.2,width:3.6,height:.4,color:'#58C4DD',label:'Relativistic Invariant',description:'',revealAt:4.6,drawDuration:.6,entrance:'write'},
   {id:'mass_box',kind:'box',x:4.3,y:1.15,width:2.8,height:2.6,color:'#FC6255',label:'',description:'',revealAt:6,drawDuration:1.1,entrance:'grow'},
   {id:'mass_wave',kind:'path',x:4.3,y:1.0,width:1.8,height:.75,color:'#FC6255',label:'',description:'',points:wave,closed:false,smooth:true,revealAt:6.7,drawDuration:.9,entrance:'draw'},
   {id:'mass_title',kind:'text',x:4.3,y:2.7,width:3.4,height:.4,color:'#FC6255',label:'Confined Rest Mass',description:'',revealAt:6.4,drawDuration:.6,entrance:'write'},
   {id:'mass_eq',kind:'text',x:4.3,y:-.25,width:3.2,height:.4,color:'#FC6255',label:'p = 0  →  E = mc²',description:'',revealAt:7.4,drawDuration:.7,entrance:'write'},
   {id:'photon_exit',kind:'circle',x:-2.55,y:.35,width:.12,height:.12,color:'#8090A0',label:'',description:'',opacity:.08,revealAt:2.2,drawDuration:.2,entrance:'grow'},
   {id:'invariant_entry',kind:'circle',x:-1.25,y:.35,width:.12,height:.12,color:'#8090A0',label:'',description:'',opacity:.08,revealAt:2.2,drawDuration:.2,entrance:'grow'},
   {id:'invariant_exit',kind:'circle',x:1.35,y:.35,width:.12,height:.12,color:'#8090A0',label:'',description:'',opacity:.08,revealAt:5.2,drawDuration:.2,entrance:'grow'},
   {id:'mass_entry',kind:'circle',x:3.05,y:.35,width:.12,height:.12,color:'#8090A0',label:'',description:'',opacity:.08,revealAt:5.2,drawDuration:.2,entrance:'grow'},
   {id:'arrow_1',kind:'arrow',x:0,y:0,width:1,height:.1,color:'#8090A0',label:'energy-momentum',description:'',from:'photon_exit',to:'invariant_entry',revealAt:2.2,drawDuration:.8,entrance:'draw'},
   {id:'arrow_2',kind:'arrow',x:0,y:0,width:1,height:.1,color:'#8090A0',label:'localize to mass',description:'',from:'invariant_exit',to:'mass_entry',revealAt:5.2,drawDuration:.8,entrance:'draw'},
   {id:'takeaway',kind:'text',x:0,y:-3.2,width:9,height:.45,color:'#E7EBF0',label:'Mass is confined energy at rest.',description:'',revealAt:9,drawDuration:.8,entrance:'write'},
  ],
 }],
};
