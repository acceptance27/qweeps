import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceLiveTime,generatedPacing,speechTarget,speechTargets,synchronizedTime} from './pacing';
import type {LiveChapter} from './lessonTypes';

test('live playback crosses every beat boundary without waiting on narration',()=>{
 const boundaries=[43.15,80.24,124.3,164.3];
 for(const end of boundaries){
  let time=end-.4;
  for(let i=0;i<90;i++)time=advanceLiveTime(time,1/60,349.33);
  assert.ok(time>end+1,'a playing lesson must cross the seam, even if speech never finishes');
 }
 assert.equal(advanceLiveTime(349.3,.1,349.33),349.33);
});

test('Apple, Orange and Banana reveal with their measured spoken cue, regardless of old guessed timing',()=>{
 const c={id:'fruit',title:'Fruit',years:'',question:'Which fruit?',roles:{},sources:[],safeguard:'',narration:'Fruit explanation',narrationAt:.3,audio:'',cues:[],start:50,end:70,finishedAt:68.5,
  visual:{layout:'concept',nodes:['apple','orange','banana'].map((id,i)=>({id,title:id,body:id,icon:'app',color:'blue',tag:'',at:1+i*3})),connections:[],columns:[],takeaway:'Compare the fruit'},narrationCues:[
  {target:'context',start:.3,end:1.3},{target:'apple',start:1.3,end:5.3},{target:'orange',start:5.3,end:7.3},{target:'banana',start:7.3,end:13.3},{target:'takeaway',start:13.3,end:18.5}].map(q=>({...q,text:q.target}))} as LiveChapter;
 const p=generatedPacing(c);
 assert.equal(p.nodeAt('apple'),1.3);assert.equal(p.nodeAt('orange'),5.3);assert.equal(p.nodeAt('banana'),7.3);
 assert.equal(speechTarget(c,52),'apple');assert.equal(speechTarget(c,56),'orange');assert.equal(speechTarget(c,58),'banana');
 assert.equal(speechTarget(c,52),'apple','reverse seeking must restore the spoken object');
 assert.equal(synchronizedTime(58,.016,70,52),52,'audio Apple must correct visuals that have run ahead to Banana');
 assert.equal(synchronizedTime(52,.016,70,58),58,'audio Banana must correct lagging Apple visuals');
 assert.equal(synchronizedTime(58,.02,70),58.02,'muted playback uses the same cue timeline');
});

test('construction ends at the completed-beat checkpoint with a 1–2 second handoff',()=>{
 for(const duration of [25,34.36,43.15,54.67]){
  const c={start:80.24,end:80.24+duration,finishedAt:80.24+duration-2,visual:{nodes:[{at:1},{at:4},{at:7},{at:10},{at:13},{at:16}],connections:[{at:18.7}]}} as LiveChapter;
  const p=generatedPacing(c);
  assert.ok(p.holdBeforeFade>=1&&p.holdBeforeFade<=2);
  assert.ok(p.completedAt< c.finishedAt-c.start);
  assert.ok(Math.abs(p.conclusionAt+1.4-p.completedAt)<.001);
  assert.ok(p.at(18.7)+2.9<p.conclusionAt);
  assert.ok(p.at(16)+3.65<p.conclusionAt);
  assert.ok(p.at(1)<.5,'the incoming beat starts constructing immediately');
  assert.ok(duration-p.completedAt<2.1,'there must not be a ten-second static tail');
 }
});

test('connected narration can return to an object without redrawing it or spotlighting context-only details',()=>{
 const c={id:'fruit',title:'Fruit',years:'',question:'Compare fruit',roles:{},sources:[],safeguard:'',narration:'One connected comparison',narrationAt:.3,audio:'',cues:[],start:10,end:16,finishedAt:15,
  visual:{layout:'concept',nodes:['apple','banana','orange'].map((id,i)=>({id,title:id,body:id,icon:'app',color:'blue',tag:'',at:i+1})),columns:[],takeaway:'Compare',connections:[]},narrationCues:[
  {target:'context',text:'Fruit',start:0,end:1},{target:'apple',text:'Apple',start:1,end:2},
  {target:'banana',text:'Banana',start:2,end:3},{target:'apple',text:'Back to Apple',start:3,end:4},
  {target:'orange',text:'Supporting context',start:3,end:4,attention:false},{target:'takeaway',text:'Compare',start:4,end:5}]} as LiveChapter;
 assert.equal(generatedPacing(c).nodeAt('apple'),1);
 assert.equal(speechTarget(c,12.5),'banana');assert.equal(speechTarget(c,13.5),'apple');
 assert.deepEqual(speechTargets(c,13.5),['apple']);
});

test('new geometry waits for the visual handoff instead of finishing unseen during the spoken bridge',()=>{
 const c={id:'incoming',title:'Next idea',years:'',question:'What follows?',roles:{},sources:[],safeguard:'',narration:'Connected explanation',narrationAt:0,audio:'',cues:[],
  start:20,end:40,visualStart:26,finishedAt:39,visual:{layout:'concept',nodes:[{id:'new-part',title:'Part',body:'The incoming part',icon:'app',color:'blue',tag:'',at:1}],columns:[],takeaway:'Apply it',connections:[]},narrationCues:[
  {target:'context',start:0,end:2},{target:'new-part',start:2,end:10},{target:'takeaway',start:10,end:19}].map(q=>({...q,text:q.target}))} as LiveChapter;
 const pacing=generatedPacing(c);
 assert.equal(pacing.nodeAt('new-part'),6);
 assert.ok(pacing.linkAt('new-part',undefined,1)>=6);
 assert.ok(pacing.nodeAt('new-part')+pacing.nodeDuration('new-part')<=19);
});
