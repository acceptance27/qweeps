import React from 'react';
export function EyeStudy(){return <g fill="none" strokeLinecap="round" strokeLinejoin="round">
 <path d="M20 110C64 36 161 34 220 110C164 177 67 180 20 110Z" stroke="#87cbd8" strokeWidth="2.4"/>
 <path d="M21 110Q65 82 85 110Q66 139 21 110" fill="#12343f" stroke="#87cbd8" strokeWidth="1.5"/>
 <ellipse cx="92" cy="110" rx="14" ry="36" fill="#bddce8" fillOpacity=".13" stroke="#b5e0e6" strokeWidth="2"/>
 <path d="M204 94L236 82M211 110H248M204 126L236 138" stroke="#6c9fae" strokeWidth="2"/>
 <path d="M109 51C172 45 212 79 220 110C210 153 163 179 109 169" stroke="#d79c8d" strokeWidth="4"/>
 <path className="eye-rays" pathLength="1" d="M-18 83L89 91L205 111M-18 137L89 128L205 111" stroke="#e8c57b" strokeWidth="1.8"/>
 <path d="M92 160L92 196H56M194 142L214 190H250" stroke="#648897" strokeWidth="1.1"/>
 <text x="50" y="212" textAnchor="middle" fill="#a7bec7" fontSize="16">lens</text><text x="256" y="196" fill="#a7bec7" fontSize="16">retina</text>
 <path d="M18 110Q71 189 158 165" stroke="#375764" strokeWidth="1"/>
 </g>;}
export function Quill(){return <g fill="none" stroke="#e9c77f" strokeLinecap="round" strokeLinejoin="round">
 <path d="M42 193C48 111 85 32 176 10C184 92 121 164 42 193Z" fill="#927540" fillOpacity=".11" strokeWidth="2.2"/>
 <path d="M28 221C65 131 115 65 164 25" strokeWidth="2.2"/>
 {[0,1,2,3,4,5,6].map(i=><path key={i} d={`M${62+i*11} ${154-i*17}Q${72+i*10} ${141-i*16} ${88+i*11} ${144-i*16}M${62+i*11} ${154-i*17}L${51+i*10} ${133-i*17}`} strokeWidth="1" opacity=".65"/>)}
 <path d="M27 222L39 204L35 226L25 239Z" fill="#e9c77f" strokeWidth="1.4"/>
 <path d="M116 218H172L184 232V266H105V232Z" fill="#15333d" strokeWidth="1.5"/>
 <ellipse cx="144" cy="218" rx="28" ry="7" fill="#071117" strokeWidth="1.5"/><path d="M116 244H172" opacity=".4"/>
 </g>;}
export function Person({x=0,y=0,color='#83bdac',official=false}:{x?:number;y?:number;color?:string;official?:boolean}){return <g transform={`translate(${x} ${y})`} stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round">
 <path d="M-10-44Q-14-63 0-65Q16-63 11-44Q9-32 0-32Q-10-32-10-44Z" fill={color} fillOpacity=".12"/>
 <path d="M-12-57Q0-72 13-56" fill={official?'#4d3b58':'#213d42'} strokeWidth="2.8"/>
 {official&&<><path d="M-17-60H17L10-70H-9Z" fill="#44364e"/><path d="M-25-11H-12M12-11H25" strokeWidth="5"/></>}
 <path d="M-7-32L-21-21Q-31-6-30 22H30Q30-7 19-21L7-32" fill={color} fillOpacity=".08"/>
 <path d="M-7-31L0-17L7-31M0-17V22M-20-6L-17 22M20-6L17 22" opacity=".7"/>
 <circle cx="3" cy="-7" r=".8" fill={color}/><circle cx="3" cy="5" r=".8" fill={color}/>
 <path d="M-17 23L-20 48M17 23L20 48"/>
 </g>;}
export function Clinic(){return <g fill="none" stroke="#83bdac" strokeWidth="2" strokeLinejoin="round">
 <path d="M0 68L110 0L220 68L198 76L110 23L22 76Z" fill="#24382e"/><path d="M22 76V192H198V76M5 192H215M40 193V221M181 193V221"/>
 <path d="M92 192V113H132V192M47 97H77V130H47ZM148 97H178V130H148ZM47 113H77M162 97V130" strokeWidth="1.5"/>
 <path d="M100 211H122M94 220H128M88 229H134"/><path d="M25 153H90M134 153H195M25 169H90M134 169H195" opacity=".3"/>
 <rect x="93" y="64" width="37" height="31" fill="#0a2026"/><path d="M111 70V89M102 79H120" stroke="#b5d9cf" strokeWidth="3"/>
 </g>;}
export function Book({title='NOLI',color='#e9c77f'}:{title?:string;color?:string}){return <g fill="none" stroke={color} strokeWidth="2">
 <path d="M-64-86H50L64-72V86H-64Z" fill={color} fillOpacity=".07"/><path d="M-52-86V86M50-86V72H64M-51 73H51" opacity=".6"/>
 <text x="2" y="-14" textAnchor="middle" fontFamily="Georgia,serif" fontSize="25" stroke="none" fill={color}>{title}</text>
 <path d="M-27 13H29M-27 23H29M-19 33H21" strokeWidth="1.2"/>
 <path d="M-40-61H38M-40 59H38" strokeWidth=".8" opacity=".6"/>
 </g>;}
