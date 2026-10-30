import React from 'react';
import illustrations from './illustrations.json';

export function SourcedEye(){return <g data-asset="wikimedia-eye" aria-label="Anatomical eye cross-section">
 <g transform="scale(.48) translate(-110 0)">{illustrations.eye.paths.map(p=><path key={p.id} {...p}/>)}</g>
 <path d="M66 116L31 239H-3M209 114L257 215H278" fill="none" stroke="#8eb0be" strokeWidth="1.2"/>
 <text x="-8" y="259" textAnchor="middle" fontSize="17" fill="#a9c6ce">Lens</text><text x="284" y="220" fontSize="17" fill="#d5a68f">Retina</text>
 </g>;}
export function SourcedQuill(){return <g data-asset="lorc-quill-ink" aria-label="Quill and ink illustration" transform="translate(-8 -10) scale(.49)">
 {illustrations.quill.paths.map(p=><path key={p.id} {...p}/>)}
 </g>;}
