import test from 'node:test';
import assert from 'node:assert/strict';
import {morph,resample,checkpoint,initialLiveSnapshot} from './geometry';
import {projection} from './Geography';
import {createLessonAdapter} from './hyperframes';

test('the actual Hyperframes adapter receives deterministic bounded frames during reverse seeking',()=>{
 const seeks:number[]=[];let pauses=0;
 const runtime=createLessonAdapter({duration:()=>10,seek:(time:number)=>{seeks.push(time);},pause:()=>{pauses++;}},60);
 for(const time of [9,1,5,1,-3,999,NaN])runtime.seekTime(time);
 assert.deepEqual(seeks,[9,1,5,1,0,10,0]);assert.ok(pauses>=7);
});

test('morph contours retain endpoints and reconstruct identically after reverse seeks',()=>{
 const page=[{x:0,y:0},{x:4,y:0},{x:4,y:6},{x:0,y:6}],book=[{x:-1,y:-1},{x:5,y:-1},{x:5,y:7},{x:-1,y:7}];
 const first=morph(page,book,0),last=morph(page,book,1),middle=morph(page,book,.5);
 assert.match(first,/^M0\.00,0\.00/);assert.match(last,/^M-1\.00,-1\.00/);assert.notEqual(first,middle);assert.notEqual(last,middle);
 for(const time of [1,.2,.8,0,.5])morph(page,book,time);
 assert.equal(morph(page,book,.5),middle);assert.equal(resample(page).length,128);
});
test('Dapitan is mapped south and east of Manila in the same geographic projection',()=>{
 const project=projection([116,127,5,21],{x:0,y:0,width:320,height:450});
 const manila=project(120.984,14.6),dapitan=project(123.417,8.656);
 assert.ok(dapitan.y>manila.y&&dapitan.x>manila.x);
 assert.ok(dapitan.x<320&&dapitan.y<450);
});
test('a branch checkpoint preserves parent selection, camera and region during child exploration',()=>{
 const parent={...initialLiveSnapshot(),time:98,selected:['exile-route'],camera:{x:120,y:-30,zoom:1.4},region:{x1:3,y1:4,x2:30,y2:40}};
 const saved=checkpoint(parent),child=checkpoint(parent);child.selected.push('noli');child.camera.zoom=2.5;child.region!.x1=100;child.time=43;
 assert.deepEqual(saved,parent);assert.deepEqual(saved.selected,['exile-route']);assert.equal(saved.camera.zoom,1.4);assert.equal(saved.region!.x1,3);
});
