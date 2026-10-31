import type {Font} from 'opentype.js';

export type IRRole='blue'|'gold'|'green'|'coral'|'purple'|'white'|'muted';
export type IRDir='UP'|'DOWN'|'LEFT'|'RIGHT';
export type IRPoint=[number,number];

type Base={id:string;role?:IRRole;fill?:IRRole|'none';label?:string;labelSize?:number};
export type IRNode=
 | (Base&{kind:'circle';r:number})
 | (Base&{kind:'rect';width:number;height:number})
 | (Base&{kind:'text';text:string;size:number;maxWidth?:number})
 | (Base&{kind:'line';from:IRPoint;to:IRPoint;strokeWidth?:number})
 | (Base&{kind:'arrow';from:string;to:string;fromAnchor?:IRDir;toAnchor?:IRDir;buff?:number;labelOffset?:number})
 | (Base&{kind:'number-line';min:number;max:number;value?:number;width:number})
 | (Base&{kind:'bars';values:number[];width:number;height:number})
 | (Base&{kind:'group';children:string[]});
export type IRLayout=
 | {op:'move_to';id:string;at:IRPoint}
 | {op:'next_to';id:string;ref:string;dir:IRDir;buff?:number}
 | {op:'arrange';id:string;dir:IRDir;buff?:number}
 | {op:'align_to';id:string;ref:string;edge:'left'|'right'|'top'|'bottom'|'center'}
 | {op:'scale_to_fit_width';id:string;width:number};
export type IRScene={objects:IRNode[];layout:IRLayout[]};
export type IRFinding={code:string;severity:'error'|'warning';message:string;id?:string};

type Box={x1:number;y1:number;x2:number;y2:number};
type TextLine={text:string;x:number;y:number;size:number};
type Item={
 node:IRNode;box:Box;children?:Item[];lines?:TextLine[];hasText?:boolean;
 arrow?:{from:IRPoint;to:IRPoint;label?:TextLine&{width:number;height:number}};
};

const FRAME=100;
const MIN_TEXT_PX=11;
const ROLE:Record<IRRole,string>={blue:'blue',gold:'gold',green:'green',coral:'coral',purple:'purple',white:'white',muted:'muted'};

function union(a:Box,b:Box):Box{return{x1:Math.min(a.x1,b.x1),y1:Math.min(a.y1,b.y1),x2:Math.max(a.x2,b.x2),y2:Math.max(a.y2,b.y2)};}
function empty():Box{return{x1:0,y1:0,x2:0,y2:0};}
function center(b:Box):IRPoint{return[(b.x1+b.x2)/2,(b.y1+b.y2)/2];}
function width(b:Box){return b.x2-b.x1;}
function height(b:Box){return b.y2-b.y1;}
function translate(b:Box,dx:number,dy:number):Box{return{x1:b.x1+dx,y1:b.y1+dy,x2:b.x2+dx,y2:b.y2+dy};}

export function compileArtworkIR(scene:IRScene,options:{artViewportPx:number;font:Font;minTextPx?:number}):{
 artwork:Record<string,unknown>[];bbox:{x:number;y:number;width:number;height:number};findings:IRFinding[];
}{
 const scale=Math.max(1,options.artViewportPx)/FRAME;
 const minPx=options.minTextPx??MIN_TEXT_PX;
 const findings:IRFinding[]=[];
 const font=options.font;
 const items=new Map<string,Item>();
 for(const node of scene.objects)items.set(node.id,{node,box:empty()});

 function measure(text:string,size:number,maxWidth?:number){
  const px=size*scale;
  if(px<minPx)findings.push({code:'text_too_small',severity:'error',message:`"${text.slice(0,40)}" renders at ${px.toFixed(1)}px, below the ${minPx}px floor.`});
  const measured=font.getAdvanceWidth(text,px)/scale;
  const ascent=(font.ascender/font.unitsPerEm)*size;
  const descent=(Math.max(0,-font.descender)/font.unitsPerEm)*size;
  const lines:textWrap[] = maxWidth?wrapText(text,maxWidth,size):[{text,width:measured}];
  const lineHeight=size*1.25;
  const total=lines.length*lineHeight;
  return{lines,width:Math.max(...lines.map(line=>line.width),0),ascent,descent,lineHeight,total};
 }
 function wrapText(text:string,maxWidth:number,size:number):textWrap[]{
  const words=text.split(/\s+/).filter(Boolean),out:textWrap[]=[];
  let line='';
  for(const word of words){
   const next=line?line+' '+word:word;
   const measured=font.getAdvanceWidth(next,size*scale)/scale;
   if(line&&measured>maxWidth){out.push({text:line,width:font.getAdvanceWidth(line,size*scale)/scale});line=word;}
   else line=next;
  }
  if(line)out.push({text:line,width:font.getAdvanceWidth(line,size*scale)/scale});
  return out.length?out:[{text:'',width:0}];
 }
 type textWrap={text:string;width:number};

 function textItem(node:Base&{kind:'text';text:string;size:number;maxWidth?:number}):Item{
  const m=measure(node.text,node.size,node.maxWidth);
  const lines:TextLine[]=m.lines.map((line,index)=>({text:line.text,x:-line.width/2,y:m.total/2-m.ascent-index*m.lineHeight,size:node.size}));
  return{node,box:{x1:-m.width/2,y1:-m.total/2,x2:m.width/2,y2:m.total/2},lines,hasText:true};
 }
 function place(item:Item,next:Box){const [cx,cy]=center(item.box);const [ncx,ncy]=center(next);const dx=ncx-cx,dy=ncy-cy;item.box=next;if(item.children)for(const child of item.children)place(child,translate(child.box,dx,dy));}
 function move(item:Item,dx:number,dy:number){item.box=translate(item.box,dx,dy);if(item.children)for(const child of item.children)move(child,dx,dy);item.lines?.forEach(line=>{line.x+=dx;line.y+=dy});if(item.arrow){item.arrow.from=[item.arrow.from[0]+dx,item.arrow.from[1]+dy];item.arrow.to=[item.arrow.to[0]+dx,item.arrow.to[1]+dy];if(item.arrow.label){item.arrow.label.x+=dx;item.arrow.label.y+=dy;}}}

 for(const node of scene.objects){
  const item=items.get(node.id)!;
  if(node.kind==='circle'){
   item.box={x1:-node.r,y1:-node.r,x2:node.r,y2:node.r};
   item.hasText=!!node.label;
   if(node.label){const m=measure(node.label,node.labelSize??6);if(m.width>node.r*1.8)findings.push({code:'label_overflow',severity:'warning',message:`Label "${node.label}" is wider than circle "${node.id}".`,id:node.id});item.lines=m.lines.map((line,index)=>({text:line.text,x:-line.width/2,y:-m.total/2+m.ascent+index*m.lineHeight,size:node.labelSize??6}));}
  }else if(node.kind==='rect'){
   item.box={x1:-node.width/2,y1:-node.height/2,x2:node.width/2,y2:node.height/2};
   item.hasText=!!node.label;
   if(node.label){const m=measure(node.label,node.labelSize??6);item.lines=m.lines.map((line,index)=>({text:line.text,x:-line.width/2,y:-m.total/2+m.ascent+index*m.lineHeight,size:node.labelSize??6}));}
  }else if(node.kind==='text'){
   items.set(node.id,textItem(node));
  }else if(node.kind==='line'){
   const b={x1:Math.min(node.from[0],node.to[0]),y1:Math.min(node.from[1],node.to[1]),x2:Math.max(node.from[0],node.to[0]),y2:Math.max(node.from[1],node.to[1])};
   item.box=b;
  }else if(node.kind==='arrow'){
   item.box={x1:0,y1:0,x2:0,y2:0};item.hasText=!!node.label;
  }else if(node.kind==='number-line'){
   const m=measure(String(node.max),6);
   item.box={x1:-node.width/2,y1:-12,x2:node.width/2,y2:14};
   item.hasText=true;
   item.lines=[]; // labels are emitted from the number-line itself
  }else if(node.kind==='bars'){
   item.box={x1:-node.width/2,y1:-node.height/2,x2:node.width/2,y2:node.height/2};
   item.hasText=true;
  }else if(node.kind==='group'){
   item.children=node.children.map(id=>items.get(id)).filter(Boolean) as Item[];
   item.hasText=item.children.some(child=>child.hasText);
   item.box=item.children.length?item.children.map(child=>child.box).reduce(union):empty();
  }
 }

 const get=(id:string)=>{const item=items.get(id);if(!item)throw new Error(`Unknown object "${id}"`);return item;};
 for(const op of scene.layout){
  if(op.op==='move_to'){const item=get(op.id);move(item,op.at[0]-center(item.box)[0],op.at[1]-center(item.box)[1]);}
  else if(op.op==='next_to'){
   const item=get(op.id),ref=get(op.ref),buff=op.buff??4,[rx,ry]=center(ref.box);
   if(op.dir==='RIGHT')move(item,ref.box.x2+buff+width(item.box)/2-center(item.box)[0],ry-center(item.box)[1]);
   if(op.dir==='LEFT')move(item,ref.box.x1-buff-width(item.box)/2-center(item.box)[0],ry-center(item.box)[1]);
   if(op.dir==='UP')move(item,rx-center(item.box)[0],ref.box.y2+buff+height(item.box)/2-center(item.box)[1]);
   if(op.dir==='DOWN')move(item,rx-center(item.box)[0],ref.box.y1-buff-height(item.box)/2-center(item.box)[1]);
  }else if(op.op==='arrange'){
   const item=get(op.id),children=item.children??[item],buff=op.buff??4;
   const [ox,oy]=center(item.box);
   if(op.dir==='RIGHT'||op.dir==='LEFT'){
    const total=children.reduce((sum,child)=>sum+width(child.box),0)+buff*(children.length-1);
    let cursor=-total/2;
    for(const child of children){const w=width(child.box);move(child,ox+cursor+w/2-center(child.box)[0],oy-center(child.box)[1]);cursor+=w+buff;}
   }else{
    const total=children.reduce((sum,child)=>sum+height(child.box),0)+buff*(children.length-1);
    let cursor=total/2;
    for(const child of children){const h=height(child.box);move(child,ox-center(child.box)[0],oy+cursor-h/2-center(child.box)[1]);cursor-=h+buff;}
   }
   item.box=children.map(child=>child.box).reduce(union);
  }else if(op.op==='align_to'){
   const item=get(op.id),ref=get(op.ref),[rx,ry]=center(ref.box);
   if(op.edge==='left')move(item,ref.box.x1-item.box.x1,0);
   if(op.edge==='right')move(item,ref.box.x2-item.box.x2,0);
   if(op.edge==='top')move(item,0,ref.box.y2-item.box.y2);
   if(op.edge==='bottom')move(item,0,ref.box.y1-item.box.y1);
   if(op.edge==='center')move(item,rx-center(item.box)[0],ry-center(item.box)[1]);
  }else if(op.op==='scale_to_fit_width'){
   const item=get(op.id);
   if(item.hasText){findings.push({code:'text_scaling',severity:'error',message:`scale_to_fit_width on "${op.id}" contains text; re-layout instead of rescaling measured text.`,id:op.id});continue;}
   const factor=op.width/Math.max(width(item.box),.001);
   const [cx,cy]=center(item.box);const scaleBox=(box:Box):Box=>({x1:cx+(box.x1-cx)*factor,y1:cy+(box.y1-cy)*factor,x2:cx+(box.x2-cx)*factor,y2:cy+(box.y2-cy)*factor});
   item.box=scaleBox(item.box);if(item.children)for(const child of item.children)child.box=scaleBox(child.box);
  }
 }

 function anchorPoint(box:Box,dir:IRDir|undefined,toward:IRPoint):IRPoint{
  if(dir==='LEFT')return[box.x1,(box.y1+box.y2)/2];
  if(dir==='RIGHT')return[box.x2,(box.y1+box.y2)/2];
  if(dir==='UP')return[(box.x1+box.x2)/2,box.y2];
  if(dir==='DOWN')return[(box.x1+box.x2)/2,box.y1];
  const [cx,cy]=center(box);const dx=toward[0]-cx,dy=toward[1]-cy;
  const tx=dx?((dx>0?box.x2-cx:box.x1-cx)/dx):Infinity;
  const ty=dy?((dy>0?box.y2-cy:box.y1-cy)/dy):Infinity;
  const t=Math.min(tx,ty);return[cx+dx*t,cy+dy*t];
 }

 for(const item of items.values()){
  if(item.node.kind!=='arrow')continue;
  const from=get(item.node.from),to=get(item.node.to),buff=item.node.buff??3;
  const [fx,fy]=center(from.box),[tx,ty]=center(to.box);
  const start=anchorPoint(from.box,item.node.fromAnchor,[tx,ty]);
  const end=anchorPoint(to.box,item.node.toAnchor,[fx,fy]);
  const dx=end[0]-start[0],dy=end[1]-start[1],len=Math.hypot(dx,dy)||1;
  const ux=dx/len,uy=dy/len;
  const a:[number,number]=[start[0]+ux*buff,start[1]+uy*buff];
  const b2:[number,number]=[end[0]-ux*buff,end[1]-uy*buff];
  item.arrow={from:a,to:b2};
  item.box={x1:Math.min(a[0],b2[0]),y1:Math.min(a[1],b2[1]),x2:Math.max(a[0],b2[0]),y2:Math.max(a[1],b2[1])};
  if(item.node.label){
   const size=item.node.labelSize??6,m=measure(item.node.label,size);
   const offset=item.node.labelOffset??5;
   const mx=(a[0]+b2[0])/2,my=(a[1]+b2[1])/2;
   let nx=-uy,ny=ux;if(ny<0){nx=-nx;ny=-ny;}
   const cx2=mx+nx*offset,cy2=my+ny*offset;
   const label:TextLine={text:m.lines[0].text,x:cx2-m.width/2,y:cy2-m.ascent,size};
   item.arrow.label={...label,width:m.width,height:m.total};
   item.box=union(item.box,{x1:cx2-m.width/2,y1:cy2-m.total/2,x2:cx2+m.width/2,y2:cy2+m.total/2});
  }
 }

 const visible=[...items.values()].filter(item=>item.node.kind!=='group');
 const inkBox=visible.map(item=>item.box).reduce(union,{x1:0,y1:0,x2:0,y2:0});
 if(width(inkBox)>FRAME||height(inkBox)>FRAME)findings.push({code:'art_overflow',severity:'error',message:`Artwork ink is ${width(inkBox).toFixed(1)}×${height(inkBox).toFixed(1)} in a ${FRAME}×${FRAME} frame; remove objects or reflow instead of scaling text.`});
 const [cx,cy]=center(inkBox),dx=FRAME/2-cx,dy=FRAME/2-cy;
 for(const item of items.values())if(item.node.kind!=='group')move(item,dx,dy);

 const artwork:Record<string,unknown>[]=[];
 const paint=(role?:IRRole)=>ROLE[role??'white'];
 const svgY=(y:number)=>FRAME-y;
 function emitText(lines:TextLine[],role:IRRole|undefined){
  for(const line of lines)artwork.push({type:'text',x:round(line.x),y:round(svgY(line.y)),size:round(line.size),fill:paint(role),text:line.text});
 }
 for(const item of scene.objects){
  const node=items.get(item.id)!;const color=paint(node.node.role);
  if(node.node.kind==='circle'){
   artwork.push({type:'circle',cx:round(center(node.box)[0]),cy:round(svgY(center(node.box)[1])),r:round(Math.min(width(node.box),height(node.box))/2),fill:node.node.fill&&node.node.fill!=='none'?paint(node.node.fill):'none',stroke:color});
   emitText(node.lines??[],node.node.role??'white');
  }else if(node.node.kind==='rect'){
   artwork.push({type:'rect',x:round(node.box.x1),y:round(svgY(node.box.y2)),width:round(width(node.box)),height:round(height(node.box)),rx:2,fill:node.node.fill&&node.node.fill!=='none'?paint(node.node.fill):'none',stroke:color});
   emitText(node.lines??[],node.node.role??'white');
  }else if(node.node.kind==='text'){
   emitText(node.lines??[],node.node.role??'white');
  }else if(node.node.kind==='line'){
   artwork.push({type:'path',d:`M${round(node.node.from[0]+dx)} ${round(svgY(node.node.from[1]+dy))}L${round(node.node.to[0]+dx)} ${round(svgY(node.node.to[1]+dy))}`,fill:'none',stroke:color,strokeWidth:node.node.strokeWidth??1.4});
  }else if(node.node.kind==='arrow'&&node.arrow){
   const a=node.arrow.from,b2=node.arrow.to;
   artwork.push({type:'path',d:`M${round(a[0])} ${round(svgY(a[1]))}L${round(b2[0])} ${round(svgY(b2[1]))}`,fill:'none',stroke:color,strokeWidth:1.4});
   const ang=Math.atan2(b2[1]-a[1],b2[0]-a[0]),size=4;
   const p1:[number,number]=[b2[0]-Math.cos(ang-.5)*size,b2[1]-Math.sin(ang-.5)*size];
   const p2:[number,number]=[b2[0]-Math.cos(ang+.5)*size,b2[1]-Math.sin(ang+.5)*size];
   artwork.push({type:'path',d:`M${round(b2[0])} ${round(svgY(b2[1]))}L${round(p1[0])} ${round(svgY(p1[1]))}L${round(p2[0])} ${round(svgY(p2[1]))}Z`,fill:color,stroke:color});
   if(node.arrow.label)emitText([node.arrow.label],node.node.role??'white');
  }else if(node.node.kind==='number-line'){
   emitNumberLine(node.node,node.box,artwork,paint);
  }else if(node.node.kind==='bars'){
   emitBars(node.node,node.box,artwork,paint,measure);
  }
 }
 return{artwork,bbox:{x:round(inkBox.x1+dx),y:round(inkBox.y1+dy),width:round(width(inkBox)),height:round(height(inkBox))},findings};
}

function emitNumberLine(node:Extract<IRNode,{kind:'number-line'}>,box:Box,out:Record<string,unknown>[],paint:(r?:IRRole)=>string){
 const x1=round(box.x1+4),x2=round(box.x2-4),y=round(FRAME-((box.y1+box.y2)/2+2));
 out.push({type:'path',d:`M${x1} ${y}H${x2}`,fill:'none',stroke:paint(node.role),strokeWidth:1.2});
 for(let i=0;i<=4;i++){
  const x=round(x1+(x2-x1)*i/4);out.push({type:'line',x1:x,y1:y-3,x2:x,y2:y+3,stroke:paint(node.role),strokeWidth:1});
 }
 const fmt=(v:number)=>Number.isInteger(v)?String(v):v.toFixed(1);
 out.push({type:'text',x:x1,y:y+12,size:6,fill:paint('muted'),text:fmt(node.min)});
 out.push({type:'text',x:x2-4,y:y+12,size:6,fill:paint('muted'),text:fmt(node.max)});
 if(node.value!==undefined){
  const t=(node.value-node.min)/(node.max-node.min),x=round(x1+(x2-x1)*t);
  out.push({type:'circle',cx:x,cy:y,r:3,fill:paint('gold'),stroke:'none'});
  out.push({type:'text',x:round(x-4),y:y-7,size:7,fill:paint('gold'),text:fmt(node.value)});
 }
}
function emitBars(node:Extract<IRNode,{kind:'bars'}>,box:Box,out:Record<string,unknown>[],paint:(r?:IRRole)=>string,measure:(text:string,size:number)=>unknown){
 const n=node.values.length,gap=4,w=(width(box)-gap*(n-1))/n,base=box.y1+3,max=Math.max(...node.values.map(Math.abs),1);
 node.values.forEach((value,i)=>{
  const h=Math.max(2,(height(box)-14)*Math.abs(value)/max),x=box.x1+i*(w+gap);
  out.push({type:'rect',x:round(x),y:round(FRAME-(base+h)),width:round(w),height:round(h),rx:1,fill:value>=0?paint('green'):paint('coral'),stroke:'none'});
  out.push({type:'text',x:round(x),y:round(FRAME-(base+h)-3),size:6,fill:paint('white'),text:String(value)});
 });
}
function round(value:number){return Math.round(value*10)/10;}
