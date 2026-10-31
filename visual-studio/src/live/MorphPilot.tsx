import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import gsap from 'gsap';
import {lineLoop,rectLoop,pathD,measurePacing,type PacingAction} from './morph';
import './live.css';

const ROUTE=lineLoop([200,300],[1240,300]);
const LEFT=rectLoop(200,220,450,160);
const RIGHT=rectLoop(790,220,450,160);

const ACTIONS:PacingAction[]=[
 {at:0,duration:.4,kind:'reveal route'},
 {at:.4,duration:1.6,kind:'ship move'},
 {at:2.2,duration:1.5,kind:'replace + copy morph'},
 {at:4.5,duration:.8,kind:'dock shipping thumbnail'},
 {at:5.5,duration:1.2,kind:'build proposal'},
 {at:8,duration:.5,kind:'indicate retained context'},
];
const DURATION=10;

export default function MorphPilot(){
 const svg=useRef<SVGSVGElement>(null);
 const route=useRef<SVGPathElement>(null);
 const ship=useRef<SVGGElement>(null);
 const us=useRef<SVGTextElement>(null);
 const europe=useRef<SVGTextElement>(null);
 const leftLabel=useRef<SVGTextElement>(null);
 const rightLabel=useRef<SVGTextElement>(null);
 const comparison=useRef<SVGGElement>(null);
 const proposal=useRef<SVGGElement>(null);
 const timeline=useRef<gsap.core.Timeline|null>(null);
 const[time,setTime]=useState(0);
 const[playing,setPlaying]=useState(false);
 const[clicked,setClicked]=useState(false);
 const pacing=useMemo(()=>measurePacing(ACTIONS,DURATION),[]);
 const routeD=useMemo(()=>pathD(ROUTE),[]);
 const leftD=useMemo(()=>pathD(LEFT),[]);
 const rightD=useMemo(()=>pathD(RIGHT),[]);

 useLayoutEffect(()=>{
  if(!svg.current||!route.current||!ship.current||!comparison.current||!proposal.current)return;
  const tl=gsap.timeline({paused:true,onUpdate:()=>setTime(tl.time())});
  timeline.current=tl;
  gsap.set(ship.current,{x:320,y:300,transformOrigin:'0 0'});
  gsap.set([leftLabel.current,rightLabel.current],{opacity:0});
  gsap.set(proposal.current,{opacity:0});
  gsap.set(route.current,{attr:{d:routeD},fillOpacity:0});

  tl.to(ship.current,{x:640,y:300,duration:1.6,ease:'power1.inOut'},.4);
  tl.to(us.current,{opacity:0,duration:.5},2.2);
  tl.to(europe.current,{opacity:0,duration:.5},2.2);

  const rightClone=route.current.cloneNode(true) as SVGPathElement;
  comparison.current.appendChild(rightClone);
  gsap.set(rightClone,{attr:{d:routeD},fillOpacity:0,stroke:'#8bd0df',opacity:0});
  tl.set(rightClone,{opacity:1},2.2);
  tl.to(route.current,{attr:{d:leftD},fillOpacity:.14,duration:1.5,ease:'power2.inOut'},2.2);
  tl.to(rightClone,{attr:{d:rightD},fillOpacity:.14,duration:1.5,ease:'power2.inOut'},2.2);
  tl.to([leftLabel.current,rightLabel.current],{opacity:1,duration:.6},2.8);

  const rightShip=ship.current.cloneNode(true) as SVGGElement;
  comparison.current.appendChild(rightShip);
  gsap.set(rightShip,{x:640,y:300,transformOrigin:'0 0',opacity:0});
  tl.set(rightShip,{opacity:1},2.2);
  tl.to(ship.current,{x:425,y:300,duration:1.5,ease:'power2.inOut'},2.2);
  tl.to(rightShip,{x:1015,y:300,duration:1.5,ease:'power2.inOut'},2.2);

  tl.to(comparison.current,{x:80,y:70,scale:.33,transformOrigin:'0 0',duration:.8,ease:'power2.inOut'},4.5);
  tl.to(proposal.current,{opacity:1,duration:1.2,ease:'power1.out'},5.5);
  tl.to(comparison.current,{scale:.37,duration:.22,yoyo:true,repeat:1,ease:'power1.inOut'},8);
  tl.set({}, {},DURATION);

  const exposed={timeline:tl,actions:ACTIONS,pacing,duration:DURATION};
  (window as Window&{__morphPilot?:typeof exposed}).__morphPilot=exposed;
  return()=>{tl.kill();delete (window as Window&{__morphPilot?:unknown}).__morphPilot;};
 },[leftD,rightD,routeD,pacing]);

 useEffect(()=>()=>{timeline.current?.kill();},[]);

 const toggle=()=>{
  const tl=timeline.current;if(!tl)return;
  if(playing){tl.pause();setPlaying(false);}
  else{if(tl.time()>=DURATION)tl.seek(0);tl.play();setPlaying(true);}
 };
 const seek=(value:number)=>{timeline.current?.pause();setPlaying(false);timeline.current?.seek(value);setTime(value);};

 return <div className="morph-pilot">
  <header>
   <div><span>QWEEPS · MORPH PILOT</span><h1>Route → comparison, then a retained thumbnail</h1></div>
   <div className="morph-law">
    <strong>{pacing.startsPer10s.toFixed(2)}</strong><span>starts / 10s</span>
    <strong>{pacing.maxHold.toFixed(2)}s</strong><span>max hold</span>
    <em className={pacing.passes?'pass':'fail'}>{pacing.passes?'rhythm passes':'rhythm fails'}</em>
   </div>
  </header>
  <div className="morph-stage">
   <svg ref={svg} viewBox="0 0 1440 600" aria-label="Morph pilot">
    <rect width="1440" height="600" fill="#071117"/>
    <g ref={comparison} data-pilot="comparison" onClick={()=>setClicked(true)} style={{cursor:'pointer'}}>
     <path ref={route} d={routeD} fill="#8bd0df" fillOpacity="0" stroke="#8bd0df" strokeWidth="2"/>
     <g ref={ship}><polygon points="-28,8 28,8 18,-8 -16,-8" fill="#8bd0df" fillOpacity=".2" stroke="#8bd0df" strokeWidth="1.5"/><rect x="-6" y="-22" width="12" height="14" fill="#071117" stroke="#8bd0df" strokeWidth="1"/></g>
     <text ref={us} x="180" y="235" fill="#8bd0df" fontSize="22" fontFamily="Arial">US</text>
     <text ref={europe} x="1235" y="235" fill="#7899a5" fontSize="22" fontFamily="Arial" textAnchor="end">Europe</text>
     <text ref={leftLabel} x="425" y="195" fill="#8bd0df" fontSize="22" fontFamily="Arial" textAnchor="middle">1916: restrictions</text>
     <text ref={rightLabel} x="1015" y="195" fill="#eda994" fontSize="22" fontFamily="Arial" textAnchor="middle">Feb 1917: unrestricted</text>
    </g>
    <g ref={proposal}>
     <rect x="500" y="390" width="150" height="60" rx="6" fill="none" stroke="#c4b0e2"/>
     <text x="575" y="427" fill="#c4b0e2" fontSize="20" fontFamily="Arial" textAnchor="middle">Germany</text>
     <rect x="850" y="390" width="150" height="60" rx="6" fill="none" stroke="#c4b0e2"/>
     <text x="925" y="427" fill="#c4b0e2" fontSize="20" fontFamily="Arial" textAnchor="middle">Mexico</text>
     <path d="M650 420H850" stroke="#c4b0e2" strokeWidth="2" strokeDasharray="8 7" fill="none"/>
     <text x="750" y="405" fill="#edca82" fontSize="18" fontFamily="Arial" textAnchor="middle">proposed, not a pact</text>
     <text x="750" y="475" fill="#c9d9dd" fontSize="20" fontFamily="Arial" textAnchor="middle">the shipping thumbnail stays live and clickable</text>
    </g>
   </svg>
  </div>
  <footer className="morph-controls">
   <button onClick={toggle}>{playing?'Pause':'Play'}</button>
   <input type="range" min="0" max={DURATION} step=".01" value={time} onChange={e=>seek(Number(e.target.value))} aria-label="Pilot time"/>
   <span>{time.toFixed(1)}s / {DURATION}s</span>
   <span className="morph-pacing">{clicked?'thumbnail inspected':'click the retained thumbnail'}</span>
  </footer>
 </div>;
}
