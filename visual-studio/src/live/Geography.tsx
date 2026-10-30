import React,{useId} from 'react';
import data from './geography.json';
type Extent=[number,number,number,number];
export function projection(extent:Extent,box:{x:number;y:number;width:number;height:number}){
 const[west,east,south,north]=extent,longitudeScale=Math.cos((south+north)/2*Math.PI/180);
 const scale=Math.min(box.width/((east-west)*longitudeScale),box.height/(north-south));
 const w=(east-west)*longitudeScale*scale,h=(north-south)*scale,ox=box.x+(box.width-w)/2,oy=box.y+(box.height-h)/2;
 return(lon:number,lat:number)=>({x:ox+(lon-west)*longitudeScale*scale,y:oy+(north-lat)*scale});
}
export function MapGeometry({countries,extent,box}:{countries:(keyof typeof data.countries)[];extent:Extent;box:{x:number;y:number;width:number;height:number}}){
 const project=projection(extent,box),clip='geo-'+useId().replaceAll(':','');return <g className="live-map-geometry"><defs data-no-trace><clipPath id={clip}><rect {...box}/></clipPath></defs><g clipPath={`url(#${clip})`}>{countries.flatMap(code=>data.countries[code].map((ring,i)=><path key={code+i} data-country={code} d={ring.map(([lon,lat],j)=>{const p=project(lon,lat);return`${j?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`;}).join(' ')+'Z'} fill={code==='PHL'||code==='ESP'?'#12313c':'#131e27'} stroke={code==='PHL'||code==='ESP'?'#72c6d7':'#667e8a'} strokeWidth={1.2} strokeLinejoin="round"/>))}</g></g>;
}
export function MapPin({point,label,dx=24,dy=-20,color='#f0ce83'}:{point:{x:number;y:number};label:string;dx?:number;dy?:number;color?:string}){
 return <g className="live-map-pin"><circle cx={point.x} cy={point.y} r={5} fill={color}/><path d={`M${point.x},${point.y}L${point.x+dx*.65},${point.y+dy}`} stroke={color} fill="none"/><text x={point.x+dx} y={point.y+dy+5} textAnchor={dx<0?'end':'start'} fill={color} fontSize={19} paintOrder="stroke" stroke="#071117" strokeWidth={5}>{label}</text></g>;
}
