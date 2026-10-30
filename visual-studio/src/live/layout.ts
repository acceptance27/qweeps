import type {Font} from 'opentype.js';
import type {LiveVisual,LiveNode} from './lessonTypes';
export type NodeBox={node:LiveNode;x:number;y:number;width:number;height:number};
export function conceptUsesGrid(v:LiveVisual){return v.layout==='concept'&&(v.nodes.length>4||v.nodes.some(n=>(n.body?.length||0)>180));}
export function resolveDiagramBoxes(nodes:LiveNode[],minMargin=15):NodeBox[]{
 if(nodes.length===0)return [];
 const boxes=nodes.map(node=>({node,x:node.position?.x??45,y:node.position?.y??110,width:node.position?.width??300,height:node.position?.height??250}));
 if(boxes.length<=1)return boxes;
 const minX=45,maxX=1395,minY=110,maxY=505;
 for(let iter=0;iter<20;iter++){
  let overlap=false;
  for(let i=0;i<boxes.length;i++){
   for(let j=i+1;j<boxes.length;j++){
    const a=boxes[i],b=boxes[j];
    const reqOx=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)+minMargin;
    const reqOy=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)+minMargin;
    if(reqOx>0&&reqOy>0){
     overlap=true;
     const cAx=a.x+a.width/2,cBx=b.x+b.width/2;
     const cAy=a.y+a.height/2,cBy=b.y+b.height/2;
     if(reqOx<=reqOy){
      const shift=reqOx/2;
      if(cAx<=cBx){a.x-=shift;b.x+=shift;}else{a.x+=shift;b.x-=shift;}
     }else{
      const shift=reqOy/2;
      if(cAy<=cBy){a.y-=shift;b.y+=shift;}else{a.y+=shift;b.y-=shift;}
     }
    }
   }
  }
  for(const b of boxes){
   b.x=Math.max(minX,Math.min(maxX-b.width,b.x));
   b.y=Math.max(minY,Math.min(maxY-b.height,b.y));
  }
  if(!overlap)break;
 }
 return boxes;
}

export function nodeBoxes(v:LiveVisual):NodeBox[]{
 const n=v.nodes.length;
 if(v.layout==='diagram')return resolveDiagramBoxes(v.nodes);
 if(v.layout==='matrix')return v.nodes.map((node,i)=>({node,x:45,y:148+i*(350/n),width:1350,height:350/n}));
 if(v.layout==='concept'&&conceptUsesGrid(v)&&n<=4){
  const cols=n===4?2:n,rows=Math.ceil(n/cols),width=(1350-25*(cols-1))/cols;
  return v.nodes.map((node,i)=>({node,x:45+(i%cols)*(width+25),y:125+Math.floor(i/cols)*195,width,height:rows===1?365:180}));
 }
 if(v.layout==='concept')return n>4?
  v.nodes.map((node,i)=>({node,x:45+(i%3)*460,y:125+Math.floor(i/3)*210,width:430,height:172})):
  v.nodes.map((node,i)=>({node,x:i%2?965:45,y:125+Math.floor(i/2)*(385/Math.ceil(n/2)),width:430,height:Math.min(180,365/Math.ceil(n/2))}));
 if(v.layout==='loci')return v.nodes.map((node,i)=>({node,x:45+(i%3)*460,y:125+Math.floor(i/3)*210,width:430,height:172}));
 const gap=v.layout==='process'?100:25,w=(1350-gap*(n-1))/n;
 return v.nodes.map((node,i)=>({node,x:45+i*(w+gap),y:v.layout==='timeline'?200:125,width:w,height:v.layout==='timeline'?280:365}));
}
export function wrapCopy(font:Font|null,text:string,width:number,size:number){
 const measure=(s:string)=>font?font.getAdvanceWidth(s,size):s.length*size*.52;
 const lines:string[]=[];let line='';
 for(const word of text.split(/\s+/)){const next=line?line+' '+word:word;if(line&&measure(next)>width){lines.push(line);line=word;}else line=next;}
 if(line)lines.push(line);return lines;
}
export function fitCopy(font:Font|null,text:string,width:number,height:number,preferred=23,min=18){
 // SVG y positions are baselines. Height is space below the first baseline,
 // not the height of an additional invisible line above it.
 const descent=font?Math.max(0,-font.descender/font.unitsPerEm):.3;
 for(let size=preferred;size>=min;size--){
  const lines=wrapCopy(font,text,width,size);
  const heightFits=Math.max(0,lines.length-1)*size*1.36+size*descent<=height;
  const widthFits=!lines.some(line=>(font?font.getAdvanceWidth(line,size):line.length*size*.52)>width);
  if(heightFits&&widthFits)return{lines,size,overflow:false};
 }
 return{lines:wrapCopy(font,text,width,min),size:min,overflow:true};
}

export function diagramCopy(font:Font|null,node:LiveNode,width:number,height:number,textMode:'labels'|'descriptive'='descriptive'){
 const ascent=font?font.ascender/font.unitsPerEm:1,descent=font?Math.max(0,-font.descender/font.unitsPerEm):.3;
 const title=fitCopy(font,node.title,width-16,45,23),titleHeight=(title.lines.length-1)*title.size*1.36+title.size*(ascent+descent);
 if(textMode==='labels'){
  const artHeight=height-titleHeight-16;
  return{artHeight,title:{x:8,y:artHeight+8+title.size*ascent,width:width-16,height:45,size:title.size},
   body:{x:0,y:0,width:0,height:0,size:0},showBody:false,overflow:title.overflow||artHeight<60};
 }
 const body=fitCopy(font,node.body,width-16,Math.max(20,height-60-titleHeight-24-19*ascent),19);
 const bodyHeight=(body.lines.length-1)*body.size*1.36+body.size*(ascent+descent);
 const artHeight=height-titleHeight-bodyHeight-24;
 return{artHeight,title:{x:8,y:artHeight+8+title.size*ascent,width:width-16,height:45,size:title.size},
  body:{x:8,y:artHeight+16+titleHeight+body.size*ascent,width:width-16,height:Math.max(0,bodyHeight-body.size*ascent),size:body.size},
  showBody:true,overflow:title.overflow||body.overflow||artHeight<60};
}

export function nodeCopy(font:Font|null,node:LiveNode,width:number,height:number,layout:LiveVisual['layout']){
 const compact=layout==='concept'||layout==='loci',titleX=compact?82:100,titleY=43;
 const titleWidth=width-(layout==='loci'?130:compact?102:120),bodySize=compact?21:24;
 const descent=font?Math.max(0,-font.descender/font.unitsPerEm):.3;
 const ascent=font?font.ascender/font.unitsPerEm:1;
 // Fit the two blocks together. Their baselines fitting independently does not
 // prevent a wrapped heading's descenders from colliding with the body ascenders.
 let result;
 for(let preferred=26;preferred>=18;preferred--){
  const title=fitCopy(font,node.title,titleWidth,compact?40:72,preferred);
  const titleBottom=titleY+(title.lines.length-1)*title.size*1.36+title.size*descent;
  const bodyY=Math.max(compact?91:124,titleBottom+8+bodySize*ascent);
  const bodyHeight=height-bodyY-(compact?3:34);
  const body=fitCopy(font,node.body,width-46,bodyHeight,bodySize);
  result={title:{x:titleX,y:titleY,width:titleWidth,height:compact?40:72,size:title.size},
          body:{x:23,y:bodyY,width:width-46,height:bodyHeight,size:body.size},overflow:title.overflow||body.overflow};
  if(!result.overflow)return result;
 }
 return result!;
}

export function gridRelationships(v:LiveVisual){
 // In a dense concept grid, attach each spoke's named relationship to its own
 // card rather than drawing several crossing lines through a tiny shared gutter.
 if(!conceptUsesGrid(v))return [];
 const degree=(id:string)=>v.connections.filter(c=>c.from===id||c.to===id).length;
 return v.nodes.flatMap(node=>{
  const links=v.connections.filter(c=>c.from===node.id||c.to===node.id);
  if(links.length!==1)return [];
  const link=links[0],other=v.nodes.find(n=>n.id===(link.from===node.id?link.to:link.from))!;
  if(degree(other.id)<=1&&node.id!==link.from)return [];
  return[{id:node.id,from:link.from,to:link.to,at:link.at,text:link.from===node.id?`${link.label} → ${other.title}`:`${other.title} → ${link.label}`}];
 });
}

export type DiagramEdgePath={
 d:string;
 from:{x:number;y:number};
 to:{x:number;y:number};
 label:{x:number;y:number;width:number;height:number};
 pill:{x:number;y:number;width:number;height:number};
};

export function diagramEdge(a:NodeBox,b:NodeBox,obstacles:NodeBox[]=[],font:Font|null=null,textMode:'labels'|'descriptive'='descriptive'):DiagramEdgePath{
 const artA=diagramCopy(font,a.node,a.width,a.height,textMode).artHeight;
 const artB=diagramCopy(font,b.node,b.width,b.height,textMode).artHeight;
 const cA={x:a.x+a.width/2,y:a.y+artA/2};
 const cB={x:b.x+b.width/2,y:b.y+artB/2};
 const dx=cB.x-cA.x,dy=cB.y-cA.y;

 if(Math.abs(dx)<0.001&&Math.abs(dy)<0.001){
  return{
   d:`M${cA.x} ${cA.y}L${cB.x} ${cB.y}`,from:cA,to:cB,
   label:{x:cA.x-90,y:cA.y-14,width:180,height:35},
   pill:{x:cA.x-95,y:cA.y-28,width:190,height:26}
  };
 }

 const padA=6;
 const scaleXA=dx!==0?(a.width/2+padA)/Math.abs(dx):Infinity;
 const scaleYA=dy!==0?(artA/2+padA)/Math.abs(dy):Infinity;
 const tA=Math.min(scaleXA,scaleYA);

 const padB=11;
 const scaleXB=dx!==0?(b.width/2+padB)/Math.abs(dx):Infinity;
 const scaleYB=dy!==0?(artB/2+padB)/Math.abs(dy):Infinity;
 const tB=Math.min(scaleXB,scaleYB);

 let from:{x:number;y:number};
 let to:{x:number;y:number};
 if(tA+tB>=0.95){
  from={x:cA.x+dx*Math.min(tA,0.45),y:cA.y+dy*Math.min(tA,0.45)};
  to={x:cB.x-dx*Math.min(tB,0.45),y:cB.y-dy*Math.min(tB,0.45)};
 }else{
  from={x:cA.x+dx*tA,y:cA.y+dy*tA};
  to={x:cB.x-dx*tB,y:cB.y-dy*tB};
 }

 let obstacle:NodeBox|null=null;
 const segDx=to.x-from.x,segDy=to.y-from.y;
 for(const obs of obstacles){
  if(obs.node.id===a.node.id||obs.node.id===b.node.id)continue;
  const oPad=10;
  const xMin=obs.x-oPad,xMax=obs.x+obs.width+oPad;
  const yMin=obs.y-oPad,yMax=obs.y+obs.height+oPad;
  let tMin=0,tMax=1,hit=true;
  if(Math.abs(segDx)<0.001){
   if(from.x<xMin||from.x>xMax)hit=false;
  }else{
   const t1=(xMin-from.x)/segDx,t2=(xMax-from.x)/segDx;
   tMin=Math.max(tMin,Math.min(t1,t2));tMax=Math.min(tMax,Math.max(t1,t2));
  }
  if(Math.abs(segDy)<0.001){
   if(from.y<yMin||from.y>yMax)hit=false;
  }else{
   const t3=(yMin-from.y)/segDy,t4=(yMax-from.y)/segDy;
   tMin=Math.max(tMin,Math.min(t3,t4));tMax=Math.min(tMax,Math.max(t3,t4));
  }
  if(hit&&tMin<=tMax&&tMax>=0&&tMin<=1){obstacle=obs;break;}
 }

 let d='',midX=(from.x+to.x)/2,midY=(from.y+to.y)/2;
 if(obstacle){
  const obsCenterY=obstacle.y+obstacle.height/2;
  const archUp=obsCenterY>=midY;
  const clearanceY=archUp?Math.min(from.y,to.y,obstacle.y-25):Math.max(from.y,to.y,obstacle.y+obstacle.height+25);
  const ctrl={x:midX,y:clearanceY};
  d=`M${from.x} ${from.y}Q${ctrl.x} ${ctrl.y} ${to.x} ${to.y}`;
  midX=0.25*from.x+0.5*ctrl.x+0.25*to.x;
  midY=0.25*from.y+0.5*ctrl.y+0.25*to.y;
 }else{
  d=`M${from.x} ${from.y}L${to.x} ${to.y}`;
 }

 return{
  d,from,to,
  label:{x:midX-90,y:midY-14,width:180,height:35},
  pill:{x:midX-95,y:midY-28,width:190,height:26}
 };
}

