import React from 'react';
import {BookOpen,GraduationCap,Landmark,ScrollText,UserRound} from 'lucide-react';
import type {Font} from 'opentype.js';
import {MapGeometry,MapPin,projection} from './Geography';
import {Book,Clinic} from './Artwork';
import {SourcedEye,SourcedQuill} from './SourcedArtwork';
import {TraceText} from './TraceText';
import {progress} from './geometry';

type Role=(id:string)=>React.SVGProps<SVGGElement>;
const gold='#edca82',blue='#86ccd9',coral='#ecaa96',green='#9ccbb1';
export function Copy({x=32,y=128,lines,color='#c6d4d8',size=22,step=32}:{x?:number;y?:number;lines:string[];color?:string;size?:number;step?:number}){
 return <g className="dossier-copy">{lines.map((line,i)=><text key={i} className="copy-line" x={x} y={y+i*step} fill={color} fontSize={size}>{line}</text>)}</g>;
}
function Dossier({id,x,width=430,kicker,title,lines,color=gold,children,role}:{id:string;x:number;width?:number;kicker:string;title:string;lines:string[];color?:string;children?:React.ReactNode;role?:React.SVGProps<SVGGElement>}){
 return <g className={id} transform={`translate(${x} 65)`} {...role}>
  <rect className="dossier-frame" width={width} height="460" rx="12" fill="#10202a" fillOpacity=".7" stroke={color} strokeOpacity=".7" strokeWidth="1.5"/>
  <g className="dossier-copy"><text className="copy-line dossier-kicker" x="30" y="42" fill={color} fontSize="17">{kicker}</text><text className="copy-line dossier-title" x="30" y="85" fill="#f1e8d4" fontSize="30">{title}</text></g>
  <Copy lines={lines} size={width<400?20:22} step={32}/>{children}
 </g>;
}
function Citizen({x,y,color=green,label}:{x:number;y:number;color?:string;label?:string}){return <g transform={`translate(${x} ${y})`} data-asset="lucide-user-round"><UserRound x={-26} y={-40} width={52} height={65} stroke={color} strokeWidth={1.3}/>{label&&<text y="56" textAnchor="middle" fill={color} fontSize="18">{label}</text>}</g>;}
const euBox={x:340,y:125,width:510,height:300},euExtent:[number,number,number,number]=[-12,17,35,60];
const ep=projection(euExtent,euBox),phBox={x:65,y:200,width:170,height:230},pp=projection([116,127,5,21],phBox);
const exBox={x:45,y:180,width:195,height:270},xp=projection([116,127,5,21],exBox);
export function RizalPanels({time:t,font,role,active}:{time:number;font:Font|null;role:Role;active:string}){
 const scene=(id:string,index:number)=>({className:`live-scene scene-${index}`,'data-chapter':id,'aria-hidden':active!==id,style:{pointerEvents:active===id?'auto' as const:'none' as const}});
 return <>
 <g {...scene('formation',0)}>
  <Dossier id="origins-dossier" x={45} kicker="01 · CALAMBA, LAGUNA · 1861" title="A student before a symbol" role={role('calamba')} lines={['Born on 19 June 1861, Rizal','first learned from his mother,','Teodora Alonso. Schooling in','Manila developed his abilities.']}>
   <g className="origins-art" transform="translate(105 270)" data-asset="lucide-book-open"><BookOpen width={220} height={125} stroke={gold} strokeWidth={.8}/><text x="110" y="165" fill={gold} textAnchor="middle" fontSize="23">Education begins at home.</text></g>
  </Dossier>
  <Dossier id="gomburza-dossier" x={505} kicker="02 · COLONIAL PHILIPPINES · 1872" title="The world he grew up in" color={coral} role={role('gomburza')} lines={['Gómez, Burgos and Zamora:','three priests executed in 1872.','Their deaths became a lasting','reference in Filipino nationalism.']}>
   <g className="gomburza-art"><Citizen x={89} y={320} color={coral} label="Gómez"/><Citizen x={215} y={320} color={coral} label="Burgos"/><Citizen x={341} y={320} color={coral} label="Zamora"/><path d="M52 400H378" stroke={coral} strokeWidth="1.2"/><Copy x={52} y={430} size={20} lines={['Executed · 17 February 1872']}/></g>
  </Dossier>
  <Dossier id="medical-dossier" x={965} kicker="03 · MEDICINE → OPHTHALMOLOGY" title="A specialist in the eye" color={blue} role={role('medical-lens')} lines={['His mother’s failing eyesight','helped motivate his interest in','ophthalmology: the study and','treatment of eye disease.']}>
   <g className="medical-study" transform="translate(78 250) scale(.72)"><SourcedEye/></g>
  </Dossier>
 </g>
 <g {...scene('journey',1)}>
  <g className="journey-map" {...role('education-route')}><rect className="journey-frame" x="45" y="65" width="850" height="460" rx="12" fill="#10202a" stroke="#6d8c96" strokeWidth="1.4"/>
   <text className="journey-heading dossier-title" x="75" y="113" fill={gold} fontSize="29">From Manila to European study</text>
   <g className="journey-coasts"><MapGeometry countries={['PHL']} extent={[116,127,5,21]} box={phBox}/><MapGeometry countries={['ESP','PRT','FRA','GBR','DEU','BEL','NLD','ITA','CHE','AUT']} extent={euExtent} box={euBox}/></g>
   <g className="journey-pins"><MapPin point={pp(120.984,14.6)} label="Manila" dx={-36} dy={-26}/><g {...role('madrid')}><MapPin point={ep(-3.704,40.417)} label="Madrid" dx={-25} dy={29}/></g><MapPin point={ep(2.352,48.857)} label="Paris" dx={-45} dy={-24} color={blue}/><MapPin point={ep(8.675,49.4)} label="Heidelberg" dx={30} dy={33} color={blue}/><MapPin point={ep(13.405,52.52)} label="Berlin" dx={23} dy={-24}/></g>
   <path className="education-journey" d={`M${pp(120.984,14.6).x},${pp(120.984,14.6).y}C250,510 350,510 ${ep(-3.704,40.417).x},${ep(-3.704,40.417).y}`} fill="none" stroke={gold} strokeWidth="2.5" markerEnd="url(#live-arrow)"/>
   <path className="study-journey" d={`M${ep(-3.704,40.417).x},${ep(-3.704,40.417).y}L${ep(2.352,48.857).x},${ep(2.352,48.857).y}L${ep(8.675,49.4).x},${ep(8.675,49.4).y}L${ep(13.405,52.52).x},${ep(13.405,52.52).y}`} fill="none" stroke={blue} strokeWidth="2.1"/>
   <Copy x={77} y={480} size={18} lines={['Selected stops · modern coastlines · the panels use different scales.','The connecting arc is orientation, not his exact sailing route.']}/>
  </g>
  <Dossier id="journey-work" x={935} width={460} kicker="1882 → 1887 · TWO OUTCOMES" title="The doctor and the writer" lines={['Madrid: continued medical study.','Paris and Heidelberg: training','as an eye specialist.','Berlin: a novel reached print.']}>
   <g className="writing-study" {...role('writing-pen')} transform="translate(140 245) scale(.62)"><SourcedQuill/></g>
   <g className="printing-note" {...role('noli-printing')}><text x="230" y="435" fill={gold} textAnchor="middle" fontSize="22">Noli Me Tangere · Berlin, 1887</text></g>
  </Dossier>
 </g>
 <g {...scene('novels',2)}>
  <Dossier id="noli-dossier" x={45} kicker="01 · BERLIN · 1887" title="Noli Me Tangere" role={role('noli')} lines={['A novel about colonial society.','Fictional people and situations','made abuses concrete: readers','could recognize unequal power.']}>
   <g className="noli-art" transform="translate(215 325) scale(.95)"><Book/><text x="0" y="125" textAnchor="middle" fontSize="16" fill={gold}>The Social Cancer</text></g>
  </Dossier>
  <Dossier id="fili-dossier" x={505} kicker="02 · GHENT · 1891" title="El Filibusterismo" color="#c8b6df" role={role('fili')} lines={['A second novel continued','his criticism of Spanish rule.','Read alongside Noli, it shows','a sustained political argument.']}>
   <g className="fili-art" transform="translate(215 325) scale(.95)"><Book title="FILI" color="#c8b6df"/><text x="0" y="125" textAnchor="middle" fontSize="16" fill="#c8b6df">The Reign of Greed</text></g>
  </Dossier>
  <Dossier id="readers-dossier" x={965} kicker="03 · FROM PAGES TO DISCUSSION" title="Why the novels mattered" color={green} role={role('readers')} lines={['Stories could expose oppression','and give readers a shared','language for discussing it.','Influence is not military command.']}>
   <g className="reading-art" {...role('colonial-abuses')}><Citizen x={108} y={320} label="Reader"/><Citizen x={310} y={320} label="Reader"/><path d="M166 302H252M166 319H252M166 336H252" stroke={gold} strokeWidth="1.5"/><text x="215" y="430" textAnchor="middle" fill={green} fontSize="20">Read → discuss → question</text></g>
  </Dossier>
 </g>
 <g {...scene('dapitan',3)}>
  <g className="liga-note" {...role('la-liga')}><text x="45" y="55" className="dossier-title" fill={green} fontSize="30">3 July 1892 · La Liga Filipina</text><Copy x={45} y={94} lines={['A civic association for mutual help and reform. Colonial authorities soon sent Rizal into exile.']} size={22}/></g>
  <g className="exile-map" {...role('exile-route')}><MapGeometry countries={['PHL']} extent={[116,127,5,21]} box={exBox}/><MapPin point={xp(120.984,14.6)} label="Manila" dx={-28} dy={-22}/><g {...role('dapitan')}><MapPin point={xp(123.417,8.656)} label="Dapitan" dx={42} dy={-6} color={coral}/></g><path className="exile-travel" d={`M${xp(120.984,14.6).x},${xp(120.984,14.6).y}C0,300 25,410 ${xp(123.417,8.656).x},${xp(123.417,8.656).y}`} fill="none" stroke={coral} strokeWidth="2.3" markerEnd="url(#live-arrow)"/><Copy x={45} y={490} lines={['Dapitan','NW Mindanao','1892–1896']} color={coral} size={21} step={28}/></g>
  <g transform="translate(0 45)">
   <Dossier id="clinic-dossier" x={295} width={340} kicker="01 · MEDICAL PRACTICE" title="Treating patients" color={blue} role={role('clinic')} lines={['Exile did not end his work','as a physician. He continued','to treat patients in Dapitan.']}><g className="clinic-art" transform="translate(90 255) scale(.72)"><Clinic/><text x="110" y="285" textAnchor="middle" fontSize="19" fill={blue}>A clinic, not a prison cell.</text></g></Dossier>
   <Dossier id="school-dossier" x={670} width={340} kicker="02 · EDUCATION" title="Teaching pupils" color={gold} role={role('school')} lines={['Teaching was another form','of civic work: knowledge','passed from person to person.']}><g className="school-art" data-asset="lucide-graduation-cap"><GraduationCap x={85} y={250} width={170} height={95} stroke={gold} strokeWidth={1}/><Citizen x={120} y={385}/><Citizen x={230} y={385}/></g></Dossier>
   <Dossier id="water-dossier" x={1045} width={350} kicker="03 · CIVIC ENGINEERING" title="Supplying water" color={green} role={role('waterworks')} lines={['He helped design waterworks.','This channel shows the idea','of carrying water to people,','not the historic building plan.']}><g className="water-art"><path d="M30 345L85 285L145 345" fill="#18343b" stroke="#789aa5" strokeWidth="1.5"/><path className="water-channel" d="M85 325C150 320 170 385 240 385H290V369H319V384" fill="none" stroke={blue} strokeWidth="4"/><path className="water-drop" d="M319 389Q308 405 319 411Q330 405 319 389Z" fill={blue} stroke={blue} strokeWidth="1"/><path d="M301 409H332L327 441H306Z" fill="#16313c" stroke={blue} strokeWidth="1.5"/><text x="48" y="380" fill={blue} fontSize="19">Source</text><text x="252" y="455" fill={green} fontSize="19">Community</text></g></Dossier>
  </g>
  <g className="katipunan-note" {...role('katipunan')}><text x="45" y="590" fill={coral} fontSize="21">La Liga was a civic association. The Katipunan was a separate revolutionary organization.</text></g>
 </g>
 <g {...scene('1896',4)}>
  <Dossier id="trial-dossier" x={45} width={465} kicker="30 DECEMBER 1896 · BAGUMBAYAN" title="Trial, execution, farewell" color={coral} role={role('execution-december')} lines={['A Spanish military court convicted','him of forming an illicit group','and inciting rebellion. He was','executed at Bagumbayan, Manila.']}>
   <g className="farewell-art" {...role('farewell')} data-asset="lucide-scroll-text"><ScrollText x={140} y={260} width={185} height={105} stroke={gold} strokeWidth={1}/><Copy x={32} y={390} lines={['His farewell poem survived:','Mi Último Adiós','(My Last Farewell).']} color={gold} size={22} step={28}/></g>
  </Dossier>
  <g className="chronology-axis"><text x="570" y="114" className="dossier-title" fill="#eee3cc" fontSize="29">Put the claim against the dates</text><path d="M595 220H1380M595 350H1380" stroke="#617c85" strokeWidth="1.4"/>{['AUG','SEP','OCT','NOV','DEC'].map((label,i)=><g key={label} data-no-trace><path d={`M${625+i*180} 172V364`} stroke="#36525e" strokeDasharray="4 8"/><text x={625+i*180} y="156" fill="#9ab2bc" textAnchor="middle" fontSize="19">{label}</text></g>)}</g>
  <g className="revolution-event" {...role('revolution-august')}><circle cx="625" cy="220" r="8" fill={coral} stroke={coral}/><path className="revolution-track" d="M625 220H1380" stroke={coral} strokeWidth="3"/><text x="650" y="260" fill={coral} fontSize="29">Revolution begins</text><text x="650" y="291" fill="#c6d4d8" fontSize="22">August 1896 · already underway</text></g>
  <g className="execution-event"><circle cx="1345" cy="350" r="8" fill={gold} stroke={gold}/><text x="1335" y="395" textAnchor="end" fill={gold} fontSize="29">Rizal is executed</text><text x="1335" y="427" textAnchor="end" fill="#c6d4d8" fontSize="22">30 December 1896 · after a military trial</text></g>
  <g className="chronology-comparison" {...role('chronology-test')}><path className="order-proof" d="M625 455V474H1345V455" fill="none" stroke="#d9e4e5" strokeWidth="1.5"/><Copy x={610} y={516} lines={['December cannot begin an uprising','already underway in August.']} size={27} step={37} color="#f1e8d4"/><g {...role('influence')}><text x="610" y="601" fontSize="20" fill="#a0bac3">Inspiration is a different relationship from military command.</text></g></g>
 </g>
 <g {...scene('memory',5)}>
  <Dossier id="memory-books" x={45} kicker="01 · WRITING OUTLIVES THE WRITER" title="A body of work" role={role('legacy-books')} lines={['The novels remain available','to later generations. Reading','lets people encounter Rizal’s','arguments, not only his image.']}><g className="memory-book-art" transform="translate(215 330) scale(.95)"><Book/></g><g className="memory-monument" {...role('monument')} data-asset="lucide-landmark"><Landmark x={318} y={345} width={70} height={70} stroke="#a1b8c2" strokeWidth={1}/><text x="215" y="440" textAnchor="middle" fill="#a1b8c2" fontSize="19">Public monuments also sustain memory.</text></g></Dossier>
  <Dossier id="memory-law" x={505} kicker="02 · REPUBLIC ACT 1425 · 1956" title="Memory enters education" color={gold} role={role('rizal-law')} lines={['The Rizal Law requires study','of his life, works and writings.','An institution carries the work','beyond its original audience.']}><g className="memory-law-art" data-asset="lucide-scroll-text"><ScrollText x={120} y={260} width={190} height={130} stroke={gold} strokeWidth={1}/><text x="215" y="435" textAnchor="middle" fill={gold} fontSize="26">RA 1425</text></g></Dossier>
  <Dossier id="memory-readers" x={965} kicker="03 · A NEW GENERATION" title="New readers, new questions" color={green} role={role('contributions')} lines={['Remembrance is an ongoing act:','read, discuss and reconsider.','A life becomes a symbol through','work, events and institutions.']}><g className="memory-reader-art"><Citizen x={112} y={315} label="Read"/><Citizen x={310} y={315} label="Discuss"/><path d="M166 305H254" stroke={gold} strokeWidth="2" markerEnd="url(#live-arrow)"/><BookOpen x={176} y={385} width={90} height={65} stroke={gold} strokeWidth={1}/></g></Dossier>
  <g className="memory-conclusion"><TraceText font={font} text="The person. The work. The memory." x={720} y={558} anchor="middle" size={33} value={progress(t,208,3)} color={gold}/></g>
 </g>
 </>;
}
