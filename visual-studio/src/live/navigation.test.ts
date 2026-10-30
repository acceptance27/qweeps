import test from 'node:test';
import assert from 'node:assert/strict';
import manifest from '../../public/lessons/rizal_live.json';
import {adjacentBeatTime,visualBeatIndex} from './navigation';

test('normal arrows review adjacent completed beats, including before the manuscript transition',()=>{
 assert.equal(adjacentBeatTime(manifest.chapters,8,1),61);
 assert.equal(adjacentBeatTime(manifest.chapters,80,-1),61);
 assert.equal(adjacentBeatTime(manifest.chapters,61,1),101);
});
test('shift arrows reach exact starts and remain in the target beat',()=>{
 assert.equal(adjacentBeatTime(manifest.chapters,8,1,true),34);
 assert.equal(adjacentBeatTime(manifest.chapters,101,-1,true),34);
 assert.equal(adjacentBeatTime(manifest.chapters,34,1,true),67);
});
test('first and last beat navigation stays bounded, including the lesson endpoint',()=>{
 assert.equal(adjacentBeatTime(manifest.chapters,0,-1),29);
 assert.equal(adjacentBeatTime(manifest.chapters,0,-1,true),0);
 assert.equal(adjacentBeatTime(manifest.chapters,218,1),215);
 assert.equal(adjacentBeatTime(manifest.chapters,218,1,true),186);
});

test('a spoken bridge keeps the previous visual beat active and navigation follows visual checkpoints',()=>{
 const beats=[{start:0,end:20,finishedAt:19,visualStart:0,visualEnd:27},{start:20,end:45,finishedAt:44,visualStart:27,visualEnd:45}];
 assert.equal(visualBeatIndex(beats,24),0);
 assert.equal(visualBeatIndex(beats,27),1);
 assert.equal(visualBeatIndex(beats,24),0,'rewind must restore the previous diagram through the bridge');
 assert.equal(adjacentBeatTime(beats,24,1,true),27);
 assert.equal(adjacentBeatTime(beats,28,-1),19);
});
