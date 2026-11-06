import type {CustomVisualCardSpec,GraphNode,NodeAccentColor} from './types/lesson';
export const ROW_VISUALS=new Set(['lookup-table','funnel-pool','score-meter','podium-rank','gate-keep-drop','blueprint-slots','heatmap-spotlight','citation-verifier']);
export function transferLabel(value:unknown){
 const text=Array.isArray(value)&&value.length&&value.every(row=>row&&typeof row==='object'&&'id' in row)
  ?value.slice(0,3).map(row=>String(row.id)+(typeof row.score==='number'?': '+row.score.toFixed(4):'')).join(' · ')+(value.length>3?' · +'+(value.length-3):'')
  :typeof value==='string'?value:JSON.stringify(value)??'';
 return text.length>100?text.slice(0,97)+'…':text;
}
/** Preserve the ZIP's visual grammar while making legacy line payloads visible. */
export function normalizeVisual(input:CustomVisualCardSpec,fallback:string,color:NodeAccentColor='sky'):CustomVisualCardSpec{
 const visual={...input},lines=visual.lines?.length?visual.lines:[fallback].filter(Boolean);
 if(visual.rows)visual.rows=visual.rows.map(row=>{
  try{
   const value=JSON.parse(row.rightValue);
   if(value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.text==='string')return{...row,rightValue:value.vector?JSON.stringify(value.vector):value.text,note:value.vector?value.text:row.note};
  }catch{/* Ordinary authored labels are not JSON. */}
  return row;
 });
 if(ROW_VISUALS.has(visual.variant)&&!visual.rows?.length)visual.rows=lines.map((line,i)=>({leftChip:String(i+1),rightValue:line,color}));
 if(['paper-card','doc-scroll','dropped-bin'].includes(visual.variant)&&!visual.lines?.length)visual.lines=visual.rows?.map(row=>row.leftChip+': '+row.rightValue)||lines;
 if(visual.variant==='output-pill'&&!visual.highlightText)visual.highlightText=lines.join(' · ')||visual.title;
 if(visual.variant==='token-tiles'&&!visual.tiles?.length)visual.tiles=lines.map(text=>({text,color}));
 if(visual.variant==='score-meter'&&visual.rows?.length&&visual.rows.every(row=>row.rightValue.trim()!==''&&Number.isFinite(Number(row.rightValue)))){
  const scale=Math.max(...visual.rows.map(row=>Math.abs(Number(row.rightValue))))||1;
  if(visual.rows.some(row=>row.barPercent===undefined)){
   visual.rows=visual.rows.map(row=>({...row,barPercent:row.barPercent??Math.abs(Number(row.rightValue))/scale*100}));
   visual.footerNote='Bars: |score| / max |score|';
  }
 }
 return visual;
}
export function generatedNodeSize(node:Pick<GraphNode,'label'|'defaultPreview'|'customVisual'>){
 const visual=node.customVisual,rows=visual?.rows?.length||0,lines=visual?.lines?.reduce((count,line)=>count+Math.max(1,Math.ceil(line.length/38)),0)||0;
 const width=rows?400:340;
 const title=Math.max(1,Math.ceil(node.label.length/30))*20;
 const content=visual?.variant==='vector-bars'?150:visual?.tiles?.length?Math.ceil(visual.tiles.length/3)*52:rows?visual!.rows!.slice(0,8).reduce((height,row)=>height+Math.max(24,Math.ceil(row.rightValue.length/28)*15+(row.note?Math.ceil(row.note.length/38)*14:0))+18,0):Math.max(2,Math.min(12,lines))*22;
 return {width,height:Math.max(180,Math.min(640,content+title+72))};
}
