export type Point=[number,number];

/** A closed path starts at points[0], then every three points are c1,c2,end. */
export type CubicLoop=Point[];

function lerp(a:Point,b:Point,t:number):Point{return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];}

/**
 * Eight cubic segments around a clockwise polygon. Both the line and the rect
 * use exactly this structure, so `d` interpolation has no command mismatch.
 */
export function polygonLoop(corners:Point[]):CubicLoop{
 const points:CubicLoop=[corners[0]];
 for(let edge=0;edge<corners.length;edge++){
  const start=corners[edge],end=corners[(edge+1)%corners.length];
  for(let half=0;half<2;half++){
   const t0=half/2,t1=(half+1)/2;
   const a=lerp(start,end,t0),b=lerp(start,end,t1);
   points.push(lerp(a,b,1/3),lerp(a,b,2/3),b);
  }
 }
 return points;
}

/** A line as a zero-thickness clockwise loop; it unzips into a rectangle cleanly. */
export function lineLoop(from:Point,to:Point):CubicLoop{
 return polygonLoop([from,to,to,from]);
}

export function rectLoop(x:number,y:number,width:number,height:number):CubicLoop{
 return polygonLoop([[x,y],[x+width,y],[x+width,y+height],[x,y+height]]);
}

export function pathD(points:CubicLoop):string{
 if(points.length<4||(points.length-1)%3!==0)throw new Error('A cubic loop needs 1+3n points');
 const fmt=(n:number)=>Math.round(n*1000)/1000;
 let d=`M${fmt(points[0][0])} ${fmt(points[0][1])}`;
 for(let i=1;i<points.length;i+=3)d+=`C${fmt(points[i][0])} ${fmt(points[i][1])} ${fmt(points[i+1][0])} ${fmt(points[i+1][1])} ${fmt(points[i+2][0])} ${fmt(points[i+2][1])}`;
 return `${d}Z`;
}

export function translateLoop(points:CubicLoop,dx:number,dy:number):CubicLoop{
 return points.map(([x,y])=>[x+dx,y+dy]);
}
export function scaleLoop(points:CubicLoop,scale:number):CubicLoop{
 return points.map(([x,y])=>[x*scale,y*scale]);
}

export type PacingAction={at:number;duration:number;kind:string};
export type Pacing={starts:number;startsPer10s:number;opsPer10s:number;maxHold:number;passes:boolean};

/**
 * The WWIDecision rhythm: one play start every ~4.5s, no dead hold over 2.5s.
 * A 4s move is continuous motion, not a hold; this measures gaps after an action
 * ends, not gaps between starts.
 */
export function measurePacing(actions:PacingAction[],duration:number):Pacing{
 const sorted=[...actions].sort((a,b)=>a.at-b.at);
 const starts=sorted.length;
 let maxHold=sorted.length?Math.max(0,sorted[0].at):duration;
 for(let i=0;i<sorted.length;i++){
  const end=sorted[i].at+sorted[i].duration;
  const next=sorted[i+1]?.at??duration;
  maxHold=Math.max(maxHold,Math.max(0,next-end));
 }
 const startsPer10s=starts/Math.max(duration,.001)*10;
 return{
  starts,
  startsPer10s:Math.round(startsPer10s*100)/100,
  opsPer10s:Math.round(startsPer10s*100)/100,
  maxHold:Math.round(maxHold*100)/100,
  passes:startsPer10s>=2&&maxHold<=2.5,
 };
}
