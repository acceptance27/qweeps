import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import opentype from 'opentype.js';
import {compileArtworkIR} from '../src/live/ir';
import {IR_FIXTURES} from '../src/live/ir.fixtures';

const studio=process.cwd();
const buffer=fs.readFileSync(path.join(studio,'public/live/teaching-serif.ttf'));
const font=opentype.parse(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));
const artViewportPx=340;
const lessonId=crypto.createHash('sha256').update('ir-slice-v1').digest('hex').slice(0,32);
const chapters=IR_FIXTURES.map((fixture,index)=>{
 const result=compileArtworkIR(fixture.scene,{artViewportPx,font});
 if(result.findings.some(f=>f.severity==='error'))throw new Error(`${fixture.id}: ${result.findings.map(f=>f.message).join('; ')}`);
 const start=index*30,end=start+30,finishedAt=end-2;
 return {
  id:fixture.id,title:fixture.title,teaching:fixture.teaching,years:'',question:fixture.question,insight:fixture.insight,
  roles:{scene:`${fixture.title}: ${fixture.insight}`},sources:[],safeguard:'The arithmetic and the spatial relationship must agree; the example is illustrative.',
  narration:fixture.narration,narrationAt:1.4,audio:'',start,end,finishedAt,
  cues:[{at:0,text:fixture.question},{at:20,text:fixture.insight}],
  continuity:{from:index?IR_FIXTURES[index-1].id:null,bridge:'Continue with the next operation.'},
  visual:{
   layout:'diagram',
   presentation:{method:fixture.teaching,why:'The scene makes the relationship visible before the arithmetic is stated.',visualEvidence:'The objects, labels and connectors are resolved against measured boxes.',textMode:'labels'},
   nodes:[{id:'scene',title:fixture.title,body:fixture.insight,icon:'cpu',color:'blue',at:1,tag:'',
    position:{x:370,y:110,width:700,height:390},artwork:result.artwork,motion:[]}],
   connections:[],columns:[],takeaway:fixture.insight,experiment:null,
  },
 };
});
const lesson={
 id:lessonId,kind:'live_generated',title:'One Neuron, Three IR Scenes',question:'Can relational layout remove coordinate guessing?',
 duration:90,example:{title:'A two-input neuron',description:'Measured boxes, relational placement, resolved connectors.',icon:'cpu'},
 chapters,sources:[],
};
const folder=path.join(process.env.HOME||'', '.cache/omarchy-assistant/browser-lessons', lessonId);
fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(path.join(folder,'lesson.json'),JSON.stringify(lesson,null,1));
fs.writeFileSync('/tmp/opencode/ir-slice-lesson.json',JSON.stringify(lesson,null,1));
console.log(JSON.stringify({lesson:lessonId,out:'/tmp/opencode/ir-slice-lesson.json',chapters:chapters.map(c=>({id:c.id,art:c.visual.nodes[0].artwork.length}))}));
