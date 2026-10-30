import type {Font} from 'opentype.js';
import type {LiveVisual,LiveNode} from './lessonTypes';
export type NodeBox={node:LiveNode;x:number;y:number;width:number;height:number};
export function conceptUsesGrid(v:LiveVisual){return v.layout==='concept'&&(v.nodes.length>4||v.nodes.some(n=>(n.body?.length||0)>180));}
export function nodeBoxes(v:LiveVisual):NodeBox[]{
 const n=v.nodes.length;
 if(v.layout==='diagram')return v.nodes.map(node=>({node,...node.position!}));
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
