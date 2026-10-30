import gsap from 'gsap';

const geometry='path,rect,circle,ellipse,line,polyline,polygon';
/** Measure once; reconstruct every stroke and fill from absolute timeline time. */
export function traceGeometry(timeline:gsap.core.Timeline,root:Element,selector:string,start:number,duration=2.4,staggerWindow=.65){
 const nodes=Array.from(root.querySelectorAll<SVGGeometryElement>(selector)).flatMap(node=>node.matches(geometry)?[node]:Array.from(node.querySelectorAll<SVGGeometryElement>(geometry)))
  .filter(node=>!node.closest('.live-trace-text,[data-no-trace]'));
 const unique=[...new Set(nodes)];
 unique.forEach((node,index)=>{
  const style=getComputedStyle(node),length=node.getTotalLength();if(!Number.isFinite(length)||length<=0)return;
  // A pathLength of 1 makes dashes proportional for curves, lines and imported SVGs.
  node.setAttribute('pathLength','1');
  const at=start+(unique.length>1?index/(unique.length-1)*staggerWindow:0);
  const hasFill=style.fill!=='none',fill=Number.parseFloat(style.fillOpacity)||0;
  timeline.fromTo(node,{strokeDasharray:'1 1',strokeDashoffset:1,...(hasFill?{fillOpacity:0}:{})},
   {strokeDashoffset:0,autoRound:false,duration:duration*.78,ease:'power2.inOut',immediateRender:true},at);
  if(hasFill)timeline.to(node,{fillOpacity:fill,duration:duration*.3,ease:'power1.out'},at+duration*.7);
  const marker=node.getAttribute('marker-end');
  if(marker){timeline.set(node,{attr:{'marker-end':'none'}},0);timeline.set(node,{attr:{'marker-end':marker}},at+duration*.78);}
 });
 return unique.length;
}
