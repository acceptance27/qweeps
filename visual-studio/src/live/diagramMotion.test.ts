import test from 'node:test';
import assert from 'node:assert/strict';
import {diagramMotions} from './diagramMotion';
import {nodeBoxes} from './layout';
import type {LiveChapter,LiveNode,LiveVisual} from './lessonTypes';

test('custom diagrams use supplied spatial geometry instead of a card template',()=>{
 const position={x:150,y:120,width:400,height:350},node={id:'input',position} as LiveNode;
 assert.deepEqual(nodeBoxes({layout:'diagram',nodes:[node]} as LiveVisual),[{node,...position}]);
});
test('coordinated motion follows measured speech, respects handoff and finishes before seeking checkpoint',()=>{
 const node={id:'input',at:1,motion:[{cue:'collision',dx:100,dy:0,scale:1,opacity:1,duration:6,delay:0}]} as LiveNode;
 const c={start:20,end:50,visualStart:29,finishedAt:48,visual:{nodes:[node,{id:'collision',at:4}],connections:[]},
  narrationCues:[{target:'input',start:1,end:3},{target:'collision',start:23,end:26},{target:'takeaway',start:27,end:28}]} as unknown as LiveChapter;
 const m=diagramMotions(c,node)[0];assert.equal(m.start,43);assert.ok(m.start+m.duration<48);
 c.narrationCues![1].start=2;
 assert.equal(diagramMotions(c,node)[0].start,29);
});
