import React from 'react';
import {Copyright,FileCode2,LockKeyhole,BadgeCheck,Scale,BookOpen,Code2,Package,AppWindow,GitBranch,ShieldCheck,FileText,KeyRound,Lightbulb,HandHelping,Building2,UserRound,Search,ListChecks,ClipboardCheck,CircleHelp,Network,Database,Brain,Cpu,MapPin,Globe2,Wrench,Route,TriangleAlert,Check,X,GraduationCap,BriefcaseBusiness,FolderOpen,Eye,Heart,Coins,Bomb,Flame,FlaskConical,Atom,Zap,Sparkles,Skull,Factory,type LucideIcon} from 'lucide-react';
import {SourcedEye,SourcedQuill} from './SourcedArtwork';
const icons:Record<string,LucideIcon>={'copyright':Copyright,'file-code':FileCode2,lock:LockKeyhole,badge:BadgeCheck,scale:Scale,book:BookOpen,code:Code2,package:Package,app:AppWindow,branch:GitBranch,shield:ShieldCheck,document:FileText,key:KeyRound,bulb:Lightbulb,help:HandHelping,building:Building2,person:UserRound,search:Search,checklist:ListChecks,clipboard:ClipboardCheck,question:CircleHelp,network:Network,database:Database,brain:Brain,cpu:Cpu,pin:MapPin,globe:Globe2,tools:Wrench,route:Route,warning:TriangleAlert,check:Check,cross:X,graduation:GraduationCap,briefcase:BriefcaseBusiness,folder:FolderOpen,eye:Eye,heart:Heart,coins:Coins,bomb:Bomb,flame:Flame,'flask-conical':FlaskConical,atom:Atom,zap:Zap,sparkles:Sparkles,skull:Skull,factory:Factory};
export const palette:Record<string,string>={blue:'#8bd0df',gold:'#edca82',green:'#9dceb1',coral:'#eda994',purple:'#c4b0e2'};
export function LiveAsset({name,x=0,y=0,size=64,color=palette.gold}:{name:string;x?:number;y?:number;size?:number;color?:string}){
 if(name==='anatomical-eye')return <g transform={`translate(${x} ${y}) scale(${size/300})`}><SourcedEye/></g>;
 if(name==='quill-ink')return <g transform={`translate(${x} ${y}) scale(${size/250})`}><SourcedQuill/></g>;
 const Icon=icons[name]||CircleHelp;return <g data-asset={`lucide-${name}`}><Icon x={x} y={y} width={size} height={size} stroke={color} strokeWidth={1.3}/></g>;
}
