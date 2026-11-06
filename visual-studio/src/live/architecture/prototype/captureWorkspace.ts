/** Capture the supplied workspace, including its HTML source pane and rich SVG cards. */
export async function captureWorkspace(root:HTMLElement):Promise<string>{
 const svg=root.querySelector('svg.prototype-diagram') as SVGSVGElement|null;
 if(!svg)throw new Error('The prototype diagram did not mount.');
 const r=root.getBoundingClientRect(),ns='http://www.w3.org/2000/svg';
 const output=document.createElementNS(ns,'svg');output.setAttribute('xmlns',ns);output.setAttribute('width',String(r.width));output.setAttribute('height',String(r.height));
 const properties=['font-family','font-size','font-weight','line-height','letter-spacing','color','background-color','border','border-radius','padding','margin','display','flex-direction','flex-wrap','align-items','justify-content','gap','width','height','min-width','min-height','max-width','max-height','box-sizing','overflow','white-space','text-align','text-overflow','opacity','position','top','right','bottom','left','grid-template-columns','grid-template-rows','flex','flex-shrink','flex-grow','word-break','overflow-wrap','z-index','accent-color','appearance'];
 function freeze(original:Element){
  const clone=original.cloneNode(true) as Element,originals=[original,...original.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
  originals.forEach((element,i)=>{const target=copies[i] as HTMLElement,style=getComputedStyle(element);
   const fields=properties;
   for(const property of fields)target.style.setProperty(property,style.getPropertyValue(property));});
  return clone;
 }
 const object=document.createElementNS(ns,'foreignObject');object.setAttribute('width','100%');object.setAttribute('height','100%');
 const clone=freeze(root) as HTMLElement;clone.style.position='relative';clone.style.width='100%';clone.style.height='100%';
 const computed=getComputedStyle(root);for(const property of computed)if(property.startsWith('--'))clone.style.setProperty(property,computed.getPropertyValue(property));
 const style=document.createElement('style');style.textContent='*::-webkit-scrollbar{width:6px;height:6px}*::-webkit-scrollbar-track{background:#0B1717}*::-webkit-scrollbar-thumb{background:#354D42;border-radius:3px}';clone.prepend(style);
 object.append(clone);output.append(object);
 const bytes=new TextEncoder().encode(new XMLSerializer().serializeToString(output));let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
 const img=new Image();await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('The prototype workspace could not be captured.'));img.src='data:image/svg+xml;base64,'+btoa(binary);});
 const canvas=document.createElement('canvas');canvas.width=Math.round(r.width);canvas.height=Math.round(r.height);const ctx=canvas.getContext('2d')!;ctx.fillStyle='#0B1717';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
 return canvas.toDataURL('image/jpeg',.94).split(',')[1];
}
