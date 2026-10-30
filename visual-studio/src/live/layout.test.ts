import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import opentype from 'opentype.js';
import {fitCopy,nodeBoxes,nodeCopy,diagramCopy,conceptUsesGrid,gridRelationships} from './layout';
import type {LiveVisual} from './lessonTypes';
import type {LiveNode} from './lessonTypes';

const bytes=fs.readFileSync(new URL('../../public/live/teaching-serif.ttf',import.meta.url));
const font=opentype.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));

test('diagram captions adapt to explanatory copy while retaining usable artwork space',()=>{
 const node={title:'Opposing momenta',body:'Two equally energetic inputs approach from opposite directions, so their momenta cancel while their energies add.'} as LiveNode;
 const fitted=diagramCopy(font,node,300,350),short=diagramCopy(font,{...node,body:'The momenta cancel.'},300,350);
 assert.ok(!fitted.overflow&&fitted.artHeight>=130&&fitted.artHeight<short.artHeight);
 const body=fitCopy(font,node.body,fitted.body.width,fitted.body.height,fitted.body.size);
 assert.ok(!body.overflow);
 assert.ok(fitted.title.y+fitted.title.size*.3<fitted.body.y-fitted.body.size*.7);
});
test('compact diagram groups retain their captions without an arbitrary large-art requirement',()=>{
 const node={title:'Incoming photon',body:'Delivers energy with positive linear momentum directed rightward.'} as LiveNode;
 const fitted=diagramCopy(font,node,380,185);
 assert.ok(!fitted.overflow&&fitted.artHeight>=60);
 assert.ok(!fitCopy(font,node.body,fitted.body.width,fitted.body.height,fitted.body.size).overflow);
});
test('dense concept descriptions receive a wide layout rather than being clipped in narrow spokes',()=>{
 const body='This relationship depends on the stated conditions and the properties of the complete system. Compare the inputs and outputs together, preserving the qualifications that explain when the conclusion follows and when it does not.';
 const v:LiveVisual={layout:'concept',nodes:Array.from({length:4},(_,i)=>({id:`item-${i}`,title:'A qualified relationship',body:i? 'Inspect the relevant input and its consequence.':body,icon:'app',color:'blue',at:i,tag:''})),connections:[],columns:[],takeaway:'Compare the stated conditions.'};
 assert.ok(conceptUsesGrid(v));
 for(const b of nodeBoxes(v)){assert.ok(b.width>600);assert.ok(!nodeCopy(font,b.node,b.width,b.height,v.layout).overflow);}
});

test('every representation reserves room for its worked example and conclusion',()=>{
 for(const layout of ['comparison','process','matrix','concept','timeline','loci'] as const){
  const n=['comparison','process','timeline'].includes(layout)?4:6;
  const visual={layout,nodes:Array.from({length:n},(_,i)=>({id:`object-${i}`}))} as LiveVisual;
  const boxes=nodeBoxes(visual);
  for(const box of boxes){assert.ok(box.x>=45&&box.x+box.width<=1395);assert.ok(box.y>=100&&box.y+box.height<=510);}
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
   const a=boxes[i],b=boxes[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'semantic objects must not overlap');
  }
 }
});
test('bundled font fits useful copy and flags excessive text instead of hiding it',()=>{
 const text='Identify the component, read its license, and record the conditions that apply when distributing the project.';
 const fit=fitCopy(font,text,360,140,24);
 assert.equal(fit.overflow,false);assert.equal(fit.lines.join(' '),text);
 for(const line of fit.lines)assert.ok(font.getAdvanceWidth(line,fit.size)<=360);
 assert.equal(fitCopy(font,text.repeat(8),190,50).overflow,true);
 assert.equal(fitCopy(font,'a'.repeat(250),190,150).overflow,true);
});
test('SVG baseline fitting reserves the real glyph descent without inventing an extra line',()=>{
 const text='A developer builds a community application with original source code, external libraries, confidential credentials, and a copied public snippet ahead of a planned release.';
 const fit=fitCopy(font,text,700,55,21);
 assert.equal(fit.overflow,false);
 for(const [i,line] of fit.lines.entries()){
  const bounds=font.getPath(line,0,i*fit.size*1.36,fit.size).getBoundingBox();
  assert.ok(bounds.y2<=55,`glyph bottom ${bounds.y2} exceeds the available height`);
 }
 const title=fitCopy(font,'A detailed worked example for an unfamiliar learner',530,38,29);
 assert.equal(title.overflow,false);
 for(const [i,line] of title.lines.entries())assert.ok(font.getPath(line,0,i*title.size*1.36,title.size).getBoundingBox().y2<=38);
});

test('wrapped card headings cannot collide with body glyphs',()=>{
 for(const title of ['3 Shared chain: weak copyleft','4 Locked bundle: strong copyleft','6 Blank sign: no licence stated']){
  const node={title,body:'Strong copyleft such as GPL permits use, modification and distribution. It requires the whole distributed work under the same terms, which can mean publishing your source.'} as LiveNode;
  const copy=nodeCopy(font,node,430,172,'loci');assert.equal(copy.overflow,false);
  const heading=fitCopy(font,title,copy.title.width,copy.title.height,copy.title.size);
  const body=fitCopy(font,node.body,copy.body.width,copy.body.height,copy.body.size);
  const bottom=Math.max(...heading.lines.map((s,i)=>font.getPath(s,0,copy.title.y+i*heading.size*1.36,heading.size).getBoundingBox().y2));
  const top=font.getPath(body.lines[0],0,copy.body.y,body.size).getBoundingBox().y1;
  assert.ok(top-bottom>=8,`${title}: heading/body must have visible clearance`);
  assert.ok(copy.body.y+(body.lines.length-1)*body.size*1.36+body.size*(-font.descender/font.unitsPerEm)<=169);
 }
});

test('dense concept spokes retain named relationships without crossing the card gutter',()=>{
 const v={layout:'concept',nodes:Array.from({length:6},(_,i)=>({id:`n${i}`,title:`Object ${i}`})),connections:Array.from({length:5},(_,i)=>({from:`n${i+1}`,to:'n0',label:'is part of',at:i+2}))} as LiveVisual;
 const links=gridRelationships(v);
 assert.equal(links.length,5);assert.ok(links.every(l=>l.text==='is part of → Object 0'));
 assert.deepEqual(links.map(l=>l.id),['n1','n2','n3','n4','n5']);
 const boxes=nodeBoxes(v);
 for(const link of links){
  const b=boxes.find(b=>b.node.id===link.id)!;
  const bounds=font.getPath(link.text,b.x+4,b.y-7,18).getBoundingBox();
  assert.ok(bounds.y2<b.y-2,'relationship caption clears its card border');
  const above=boxes.find(a=>a.x===b.x&&a.y<b.y);
  if(above)assert.ok(bounds.y1>above.y+above.height+4,'relationship caption clears the previous row');
 }
});

test('a construction uses labels and more artwork space, with prose retained for inspection',()=>{
 const node={title:'Opposing momenta',body:'Equal opposing vectors cancel even though their energies add.'} as LiveNode;
 const construction=diagramCopy(font,node,400,390,'labels'),description=diagramCopy(font,node,400,390,'descriptive');
 assert.equal(construction.showBody,false);
 assert.ok(construction.artHeight>description.artHeight);
 assert.equal(description.showBody,true);
 assert.deepEqual(diagramCopy(font,node,400,390),description,'legacy diagrams keep their descriptive presentation');
 assert.equal(construction.overflow,false);
});
