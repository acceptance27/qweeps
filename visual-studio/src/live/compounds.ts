import {lineLoop,pathD,type CubicLoop} from './morph';
import type {SceneObject} from './scene';

export type Role='blue'|'coral'|'gold'|'green'|'purple'|'white'|'muted';
export const PAINT:Record<Role,string>={
 blue:'#8bd0df',coral:'#eda994',gold:'#edca82',green:'#9dceb1',
 purple:'#c4b0e2',white:'#e6ecef',muted:'#7899a5',
};

export type Criterion={label:string;value:string};
export type Tick={label:string;value?:string};
export type Bar={label:string;value:number;display:string};

export type Slots={
 title?:string;
 value?:string;
 caption?:string;
 detail?:string;
 formula?:string;
 note?:string;
 badge?:string;
 asset?:string;
 icon?:string;
 index?:string;
 showValue?:boolean;
 large?:boolean;
 criteria?:Criterion[];
 ticks?:Tick[];
 bars?:Bar[];
 rows?:Criterion[];
};

export type CompoundKind=
 |'comparison-card'|'step-card'|'sum-node'|'value-pill'|'icon-chip'
 |'axis'|'number-line'|'bars'|'callout'|'brace'|'trace-row'|'station';

export type Compound={
 id:string;
 kind:CompoundKind;
 x?:number;
 y?:number;
 width?:number;
 height?:number;
 role?:Role;
 slots:Slots;
};

export type Box={x:number;y:number;width:number;height:number};
export type HullObject=Extract<SceneObject,{kind:'path'}>;
export type CompoundLayout={hull:HullObject;slots:SceneObject[];box:Box};

const K=.5522847498;
const SMALL_K=.2652164906;

function push(out:CubicLoop,a:[number,number],b:[number,number],c1?:[number,number],c2?:[number,number]){
 out.push(c1??[a[0]+(b[0]-a[0])/3,a[1]+(b[1]-a[1])/3],c2??[a[0]+(b[0]-a[0])*2/3,a[1]+(b[1]-a[1])*2/3],b);
}

/** Eight-segment rounded rectangle; compatible with lineLoop/rectLoop morphs. */
export function roundedRectLoop(x:number,y:number,w:number,h:number,r:number):CubicLoop{
 const rr=Math.max(0,Math.min(r,w/2,h/2));
 const out:CubicLoop=[[x+rr,y]];
 push(out,[x+rr,y],[x+w-rr,y]);
 push(out,[x+w-rr,y],[x+w,y+rr],[x+w-rr+K*rr,y],[x+w,y+rr-K*rr]);
 push(out,[x+w,y+rr],[x+w,y+h-rr]);
 push(out,[x+w,y+h-rr],[x+w-rr,y+h],[x+w,y+h-rr+K*rr],[x+w-rr+K*rr,y+h]);
 push(out,[x+w-rr,y+h],[x+rr,y+h]);
 push(out,[x+rr,y+h],[x,y+h-rr],[x+rr-K*rr,y+h],[x,y+h-rr+K*rr]);
 push(out,[x,y+h-rr],[x,y+rr]);
 push(out,[x,y+rr],[x+rr,y],[x,y+rr-K*rr],[x+rr-K*rr,y]);
 return out;
}

/** Eight-segment circle, so a circle can morph into a rounded rect without twisting. */
export function circleLoop(cx:number,cy:number,r:number):CubicLoop{
 const out:CubicLoop=[[cx,cy-r]];
 for(let i=0;i<8;i++){
  const a0=-Math.PI/2+i*Math.PI/4;
  const a1=a0+Math.PI/4;
  const p0:[number,number]=[cx+Math.cos(a0)*r,cy+Math.sin(a0)*r];
  const p1:[number,number]=[cx+Math.cos(a1)*r,cy+Math.sin(a1)*r];
  const k=SMALL_K*r;
  const t0:[number,number]=[-Math.sin(a0)*k,Math.cos(a0)*k];
  const t1:[number,number]=[-Math.sin(a1)*k,Math.cos(a1)*k];
  out.push([p0[0]+t0[0],p0[1]+t0[1]],[p1[0]-t1[0],p1[1]-t1[1]],p1);
 }
 return out;
}

export function capsuleLoop(x:number,y:number,w:number,h:number):CubicLoop{
 return roundedRectLoop(x,y,w,h,h/2);
}

export function textWidth(text:string,size:number):number{
 return[...text].length*size*.54;
}

export function wrapText(text:string,maxWidth:number,size:number,maxLines=2):string[]{
 const words=text.split(/\s+/).filter(Boolean);
 const lines:string[]=[];
 let line='';
 for(const word of words){
  const next=line?`${line} ${word}`:word;
  if(textWidth(next,size)<=maxWidth||!line){line=next;}
  else{lines.push(line);line=word;}
  if(lines.length===maxLines-1&&line){/* keep filling the last line */}
 }
 if(line)lines.push(line);
 if(lines.length>maxLines){lines.length=maxLines;lines[maxLines-1]=`${lines[maxLines-1].slice(0,-1)}…`;}
 return lines;
}

const GLYPHS:Record<string,string>={
 shield:'⛨',warning:'!',ship:'⛴',zap:'ϟ',scale:'⚖',flag:'⚑',
 search:'⌕',lock:'⌑',eye:'◉',document:'▤',clock:'◷',gear:'⚙',
 check:'✓',cross:'×',arrow:'→',dot:'●',
};
export function glyph(icon?:string){return icon?GLYPHS[icon]??'◈':'◈';}

function text(id:string,x:number,y:number,value:string,size:number,fill:string,anchor:'start'|'middle'|'end'='start',opacity=0):SceneObject{
 return{id,kind:'text',x,y,text:value,size,fill,anchor,opacity};
}
function rect(id:string,x:number,y:number,w:number,h:number,rx:number,stroke:string,opacity=0,fillOpacity=.1):SceneObject{
 return{id,kind:'rect',x,y,width:w,height:h,rx,fill:stroke,fillOpacity,stroke,opacity};
}
function path(id:string,d:string,stroke:string,opacity=0,strokeWidth=1.5):HullObject{
 return{id,kind:'path',d,stroke,strokeWidth,opacity,fill:'none'};
}

/** Return the default or supplied geometry for a compound. */
export function compoundBox(compound:Compound):Box{
 const defaults:Record<CompoundKind,[number,number]>=
  {'comparison-card':[380,300],'step-card':[320,240],'sum-node':[250,160],'value-pill':[240,60],
   'icon-chip':[190,64],axis:[900,130],'number-line':[900,130],bars:[460,250],
   callout:[600,92],brace:[320,54],'trace-row':[900,86],station:[260,150]};
 const[width,height]=defaults[compound.kind];
 return{x:compound.x??0,y:compound.y??0,width:compound.width??width,height:compound.height??height};
}

export function layoutCompound(compound:Compound):CompoundLayout{
 const box=compoundBox(compound);
 const paint=PAINT[compound.role??'blue'];
 const slots:SceneObject[]=[];
 let hull:HullObject;
 const add=(object:SceneObject)=>slots.push(object);
 const id=(suffix:string)=>`${compound.id}-${suffix}`;
 const{width:w,height:h}=box;

 switch(compound.kind){
  case'comparison-card':{
   const pad=18;
   const asset=compound.slots.asset;
   hull=path(`${compound.id}`,pathD(roundedRectLoop(box.x,box.y,w,h,16)),paint,0,2);
   hull.fill=paint;hull.fillOpacity=.06;
   if(asset)add({id:id('asset'),kind:'asset',name:asset,x:box.x+18,y:box.y+18,size:44,color:paint,opacity:0});
   else{
    add({id:id('icon-ring'),kind:'circle',cx:box.x+32,cy:box.y+34,r:17,stroke:paint,fill:paint,fillOpacity:.12,opacity:0});
    add(text(id('icon'),box.x+32,box.y+39,compound.slots.badge??compound.slots.title?.trim().charAt(0)??glyph(compound.slots.icon),17,paint,'middle'));
   }
   add(text(id('title'),box.x+(asset?76:58),box.y+42,compound.slots.title??'',24,'#e6ecef'));
   const formula=compound.slots.formula?.trim();
   if(formula)add(text(id('formula'),box.x+pad,box.y+96,formula,17,paint));
   const detail=compound.slots.detail??compound.slots.caption??'';
   wrapText(detail,w-pad*2,19,4).forEach((line,index)=>add(text(id(`detail-${index}`),box.x+pad,box.y+(formula?128:100)+index*24,line,19,'#c9d9dd')));
   add(text(id('value'),box.x+pad,box.y+h-20,compound.slots.value??'',15,'#9bb5ba'));
   break;
  }
  case'step-card':{
   const pad=18;
   const asset=compound.slots.asset;
   hull=path(`${compound.id}`,pathD(roundedRectLoop(box.x,box.y,w,h,14)),paint,0,2);
   hull.fill=paint;hull.fillOpacity=.06;
   if(asset)add({id:id('asset'),kind:'asset',name:asset,x:box.x+18,y:box.y+18,size:44,color:paint,opacity:0});
   else add({id:id('badge'),kind:'circle',cx:box.x+30,cy:box.y+30,r:19,stroke:paint,fill:paint,fillOpacity:.14,opacity:0,label:compound.slots.badge??(compound.slots.icon?glyph(compound.slots.icon):undefined),labelSize:16,labelFill:paint});
   add(text(id('title'),box.x+(asset?76:58),box.y+40,compound.slots.title??'',24,'#e6ecef'));
   const formula=compound.slots.formula?.trim();
   if(formula)add(text(id('formula'),box.x+pad,box.y+84,formula,19,paint));
   const body=wrapText(compound.slots.detail??compound.slots.caption??'',w-pad*2,17,4);
   body.forEach((line,index)=>add(text(id(`body-${index}`),box.x+pad,box.y+(formula?114:90)+index*20,line,17,'#c9d9dd')));
   const value=compound.slots.value??'';
   if(value)add(text(id('value'),box.x+pad,box.y+h-18,value,20,paint));
   break;
  }
  case'sum-node':{
   hull=path(`${compound.id}`,pathD(roundedRectLoop(box.x,box.y,w,h,24)),paint,0,2);
   hull.fill=paint;hull.fillOpacity=.08;
   add(text(id('title'),box.x+w/2,box.y+49,compound.slots.title??'',17,'#e6ecef','middle'));
   add(text(id('value'),box.x+w/2,box.y+84,compound.slots.value??'',22,paint,'middle'));
   const caption=compound.slots.caption??'';
   if(caption)add(text(id('caption'),box.x+w/2,box.y+120,caption,13,'#9bb5ba','middle'));
   break;
  }
  case'value-pill':{
   hull=path(`${compound.id}`,pathD(capsuleLoop(box.x,box.y,w,h)),paint,0,2);
   hull.fill=paint;hull.fillOpacity=.12;
   add(text(id('value'),box.x+w/2,box.y+h/2+7,compound.slots.value??'',19,paint,'middle'));
   break;
  }
  case'icon-chip':{
   hull=path(`${compound.id}`,pathD(capsuleLoop(box.x,box.y,w,h)),paint,0,2);
   hull.fill=paint;hull.fillOpacity=.09;
   add({id:id('icon'),kind:'circle',cx:box.x+32,cy:box.y+h/2,r:14,stroke:paint,fill:paint,fillOpacity:.14,opacity:0,label:glyph(compound.slots.icon),labelSize:14,labelFill:paint});
   add(text(id('title'),box.x+54,box.y+h/2+(compound.slots.caption?0:6),compound.slots.title??'',15,'#e6ecef'));
   if(compound.slots.caption)add(text(id('caption'),box.x+54,box.y+h/2+17,compound.slots.caption,11,'#9bb5ba'));
   break;
  }
  case'axis':
  case'number-line':{
   const baseline=box.y+h*.55;
   hull=path(`${compound.id}`,pathD(lineLoop([box.x,baseline],[box.x+w,baseline])),paint,0,2);
   const ticks=compound.slots.ticks??[];
   ticks.forEach((tick,index)=>{
    const x=box.x+(w/(Math.max(ticks.length-1,1)))*index;
    add(path(id(`tick-${index}`),pathD(lineLoop([x,baseline-7],[x,baseline+7])),paint,0,1.5));
    add(text(id(`tick-label-${index}`),x,baseline-16,tick.label,13,'#9bb5ba','middle'));
    if(tick.value)add(text(id(`tick-value-${index}`),x,baseline+28,tick.value,14,paint,'middle'));
   });
   break;
  }
  case'bars':{
   const base=box.y+h-34;
   hull=path(`${compound.id}`,pathD(lineLoop([box.x,base],[box.x+w,base])),paint,0,2);
   const bars=compound.slots.bars??[];
   const max=Math.max(...bars.map(bar=>bar.value),1);
   const lane=w/Math.max(bars.length,1),bw=Math.min(lane*.48,64);
   bars.forEach((bar,index)=>{
    const x=box.x+lane*index+(lane-bw)/2;
    const bh=Math.max(10,(base-box.y-44)*(bar.value/max));
    const fill=PAINT[(['blue','coral','gold','green','purple'] as Role[])[index%5]];
    add({id:id(`bar-${index}`),kind:'rect',x,y:base-bh,width:bw,height:bh,rx:5,fill,fillOpacity:.55,stroke:fill,opacity:0});
    add(text(id(`bar-value-${index}`),x+bw/2,base-bh-9,bar.display,14,fill,'middle'));
    add(text(id(`bar-label-${index}`),x+bw/2,base+24,bar.label,12,'#9bb5ba','middle'));
   });
   break;
  }
  case'callout':{
   hull=path(`${compound.id}`,pathD(roundedRectLoop(box.x,box.y,w,h,12)),paint,0,1.5);
   hull.fill=paint;hull.fillOpacity=.07;
   add({id:id('accent'),kind:'rect',x:box.x,y:box.y+12,width:4,height:h-24,rx:2,fill:paint,fillOpacity:1,stroke:paint,opacity:0});
   const title=compound.slots.title??'';
   const body=compound.slots.value??compound.slots.caption??'';
   if(title)add(text(id('title'),box.x+20,box.y+28,title,13,paint));
   wrapText(body,w-40,15,2).forEach((line,index)=>add(text(id(`body-${index}`),box.x+20,box.y+(title?50:38)+index*20,line,15,'#e6ecef')));
   break;
  }
  case'brace':{
   const mid=box.x+w/2;
   hull=path(`${compound.id}`,pathD(roundedRectLoop(box.x,box.y+box.height-8,w,8,4)),paint,0,1.5);
   add(text(id('value'),mid,box.y+22,compound.slots.value??'',14,paint,'middle'));
   break;
  }
  case'trace-row':{
   const asset=compound.slots.asset;
   const stateX=asset?box.x+w-92:box.x+w-20;
   hull=path(`${compound.id}`,pathD(roundedRectLoop(box.x,box.y,w,h,12)),paint,0,1.5);
   hull.fill=paint;hull.fillOpacity=.05;
   add({id:id('index'),kind:'circle',cx:box.x+30,cy:box.y+h/2,r:18,stroke:paint,fill:paint,fillOpacity:.12,opacity:0,label:compound.slots.badge??(compound.slots.icon?glyph(compound.slots.icon):'·'),labelSize:14,labelFill:paint});
   add(text(id('title'),box.x+60,box.y+34,compound.slots.title??'',22,'#e6ecef'));
   if(compound.slots.detail)add(text(id('detail'),box.x+60,box.y+57,compound.slots.detail,15,'#9bb5ba'));
   add(text(id('state'),stateX,box.y+37,compound.slots.value??'',22,paint,'end'));
   if(asset)add({id:id('asset'),kind:'asset',name:asset,x:box.x+w-48,y:box.y+24,size:36,color:paint,opacity:0});
   break;
  }
  case'station':{
   const cx=box.x+w/2;
   const large=compound.slots.large===true;
   const radius=large?50:12;
   const cy=large?box.y+62:box.y+20;
   hull=path(`${compound.id}`,pathD(circleLoop(cx,cy,radius)),paint,0,2);
   hull.fill=paint;hull.fillOpacity=large?.1:.16;
   if(compound.slots.badge)add(text(id('badge'),cx,cy+(large?12:3),compound.slots.badge,large?30:10,paint,'middle'));
   if(large){
    add({id:id('index-ring'),kind:'circle',cx:cx+38,cy:cy-38,r:14,fill:paint,fillOpacity:1,stroke:paint,opacity:0});
    add(text(id('value'),cx+38,cy-33,compound.slots.value??'',12,'#071117','middle'));
   }else if(compound.slots.showValue!==false)add(text(id('value'),cx,box.y+50,compound.slots.value??'',16,paint,'middle'));
   const top=large?box.y+136:(compound.slots.showValue===false?box.y+76:box.y+76);
   add(text(id('title'),cx,top,compound.slots.title??'',large?22:24,'#e6ecef','middle'));
   const caption=compound.slots.caption??compound.slots.detail??'';
   if(caption)add(text(id('caption'),cx,top+24,caption,large?16:16,'#9bb5ba','middle'));
   break;
  }
 }
 return{hull,slots,box};
}
