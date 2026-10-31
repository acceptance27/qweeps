import assert from 'node:assert/strict';
import test from 'node:test';
import {REFERENCE_PROGRAM} from './referenceProgram';
import {compileSceneProgram} from './sceneProgram';

test('the reference comparison program compiles into a dense settled scene',()=>{
 const result=compileSceneProgram(REFERENCE_PROGRAM);
 assert.equal(result.ok,true);
 assert.equal(result.findings.filter(f=>f.severity==='error').length,0);
 assert.ok(result.scene);
 assert.equal(result.stats.compounds,2);
 assert.ok(result.scene.actions.some(a=>a.kind==='morph'&&a.mode==='copy'));
 assert.ok(result.scene.actions.some(a=>a.kind==='dock'));
 assert.ok(result.scene.objects.some(o=>o.id==='poster'));
 assert.ok(result.scene.objects.some(o=>o.id==='conclusion'));
});

test('empty card slots are rejected before rendering',()=>{
 const program=structuredClone(REFERENCE_PROGRAM);
 program.objects[2]={...program.objects[2],slots:{title:'',value:'',caption:'',icon:''}} as never;
 const result=compileSceneProgram(program);
 assert.equal(result.ok,false);
 assert.ok(result.findings.some(f=>f.code==='empty_slot'));
});

test('a prose-stuffed card and a missing copy split are rejected',()=>{
 const program=structuredClone(REFERENCE_PROGRAM);
 program.objects[2]={...program.objects[2],slots:{title:'A very long title that cannot fit in a comparison card',value:'warning',caption:'x'.repeat(90)}} as never;
 program.actions=program.actions.filter(a=>!(a.kind==='morph'&&a.mode==='copy'));
 const result=compileSceneProgram(program);
 assert.equal(result.ok,false);
 assert.ok(result.findings.some(f=>f.code==='slot_budget'));
 assert.ok(result.findings.some(f=>f.code==='missing_copy'));
});

import fs from 'node:fs';
import {POSTER_ORDER,REFERENCE_POSTERS} from './referencePosters';

test('every teaching grammar has a dense reference settled poster',()=>{
 for(const grammar of POSTER_ORDER){
  const result=compileSceneProgram(REFERENCE_POSTERS[grammar]);
  assert.equal(result.ok,true,`${grammar}: ${result.findings.map(f=>f.code).join(',')}`);
  assert.ok(result.scene);
  assert.ok(result.stats.compounds>0);
  assert.ok(result.stats.slots>=2);
  assert.ok(result.stats.hold>=1.5);
  assert.ok(result.scene.actions.some(action=>action.kind==='show'&&action.id==='conclusion'));
 }
});

test('comparison cards must share criteria labels in the same order',()=>{
 const program=structuredClone(REFERENCE_PROGRAM);
 const card=program.objects.find(object=>object.id==='right') as {slots:{criteria:{label:string;value:string}[]}};
 card.slots.criteria[1].label='different label';
 const result=compileSceneProgram(program);
 assert.equal(result.ok,false);
 assert.ok(result.findings.some(finding=>finding.code==='criteria_mismatch'));
});

test('a bare rect and a naked compound are rejected before rendering',()=>{
 const rectProgram=structuredClone(REFERENCE_PROGRAM);
 rectProgram.objects.push({id:'box',kind:'rect',x:1,y:1,width:100,height:100});
 assert.ok(compileSceneProgram(rectProgram).findings.some(finding=>finding.code==='naked_box'));
 const emptyProgram=structuredClone(REFERENCE_PROGRAM);
 emptyProgram.objects=emptyProgram.objects.filter(object=>(object as {kind:string}).kind!=='comparison-card');
 emptyProgram.objects.push({id:'box',kind:'callout',slots:{value:''}} as never);
 assert.ok(compileSceneProgram(emptyProgram).findings.some(finding=>finding.code==='empty_slot'));
});

test('a comparison without a dock or with a short settle fails',()=>{
 const noDock=structuredClone(REFERENCE_PROGRAM);
 noDock.actions=noDock.actions.filter(action=>action.kind!=='dock');
 assert.ok(compileSceneProgram(noDock).findings.some(finding=>finding.code==='missing_dock'));
 const short=structuredClone(REFERENCE_PROGRAM);
 short.duration=5;
 assert.ok(compileSceneProgram(short).findings.some(finding=>finding.code==='settle_hold'));
});

test('the captured model-authored program compiles through the same gate',()=>{
 const captured=JSON.parse(fs.readFileSync('public/live/model-scene.json','utf8'));
 const result=compileSceneProgram(captured);
 assert.equal(result.ok,true,result.findings.map(f=>f.code).join(','));
 assert.equal(result.stats.compounds,2);
 const cards=captured.objects.filter((object:{kind:string})=>object.kind==='comparison-card');
 assert.ok(cards.every((card:{slots:{criteria?:unknown[]}})=>Array.isArray(card.slots.criteria)&&card.slots.criteria.length>=2));
});
