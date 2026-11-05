import {Copyright,FileCode2,LockKeyhole,BadgeCheck,Scale,BookOpen,Code2,Package,AppWindow,GitBranch,ShieldCheck,FileText,KeyRound,Lightbulb,HandHelping,Building2,UserRound,Search,ListChecks,ClipboardCheck,CircleHelp,Network,Database,Brain,Cpu,MapPin,Globe2,Wrench,Route,TriangleAlert,Check,X,GraduationCap,BriefcaseBusiness,FolderOpen,Eye,Heart,Coins,Bomb,Flame,FlaskConical,Atom,Zap,Sparkles,Skull,Factory,Grid3x3,SlidersHorizontal,Layers,Crown,Compass,Binary,Workflow,ShieldAlert,LockOpen,type LucideIcon} from 'lucide-react';
import {SourcedEye,SourcedQuill} from './SourcedArtwork';

const icons:Record<string,LucideIcon>={'copyright':Copyright,'file-code':FileCode2,lock:LockKeyhole,'lock-open':LockOpen,badge:BadgeCheck,scale:Scale,book:BookOpen,code:Code2,package:Package,app:AppWindow,branch:GitBranch,'git-branch':GitBranch,shield:ShieldCheck,'shield-alert':ShieldAlert,document:FileText,key:KeyRound,bulb:Lightbulb,help:HandHelping,building:Building2,person:UserRound,search:Search,checklist:ListChecks,clipboard:ClipboardCheck,question:CircleHelp,network:Network,database:Database,brain:Brain,cpu:Cpu,pin:MapPin,globe:Globe2,tools:Wrench,wrench:Wrench,route:Route,warning:TriangleAlert,check:Check,cross:X,graduation:GraduationCap,briefcase:BriefcaseBusiness,folder:FolderOpen,eye:Eye,heart:Heart,coins:Coins,bomb:Bomb,flame:Flame,'flask-conical':FlaskConical,atom:Atom,zap:Zap,sparkles:Sparkles,skull:Skull,factory:Factory,grid:Grid3x3,sliders:SlidersHorizontal,layers:Layers,crown:Crown,compass:Compass,binary:Binary,workflow:Workflow};

const aliases:Record<string,string>={
  'grid3x3':'grid','git-branch':'branch','wrench':'tools','file-code':'code','shield-check':'shield','lightning':'zap','fire':'flame',
  'puzzle':'grid','matrix':'grid','table':'grid','tree':'branch','graph':'network','balance':'scale','certificate':'badge',
  'witness':'badge','verifier':'shield','solution':'check','optimization':'route','decision':'check','guesser':'sparkles',
  'barrier':'shield-alert','formula':'binary','sat':'binary','clique':'network','atlas':'globe','core':'cpu','processor':'cpu',
  'secret':'key','factor':'key','prime':'key','proof':'lock'
};

export function resolveIconKey(name?:string,context?:string):string{
  const clean=name?.trim()?.toLowerCase();
  if(clean&&icons[clean])return clean;
  if(clean&&aliases[clean]&&icons[aliases[clean]])return aliases[clean];
  const raw=`${clean||''} ${context||''}`.toLowerCase();
  if(!raw.trim())return 'layers';
  if(clean==='question'||clean==='help'||clean==='circle-help')return 'question';

  if(raw.includes('opt')||raw.includes('shortest')||raw.includes('tour')||raw.includes('tsp')||raw.includes('cycle')||raw.includes('path')||raw.includes('route'))return 'route';
  if(raw.includes('decision')||raw.includes('check')||raw.includes('predicate')||raw.includes('yes')||raw.includes('verify')||raw.includes('test'))return 'check';
  if(raw.includes('key')||raw.includes('secret')||raw.includes('factor')||raw.includes('prime')||raw.includes('crypto'))return 'key';
  if(raw.includes('lock')||raw.includes('natural proof')||(raw.includes('barrier')&&raw.includes('proof')))return 'lock';
  if(raw.includes('relativiz')||raw.includes('hazard')||raw.includes('alert')||raw.includes('warn')||raw.includes('barrier'))return 'shield-alert';
  if(raw.includes('shield')||raw.includes('soundness')||raw.includes('verifier'))return 'shield';
  if(raw.includes('tree')||raw.includes('branch')||raw.includes('split')||raw.includes('fork'))return 'branch';
  if(raw.includes('leaf')||raw.includes('leaves')||raw.includes('explosion')||raw.includes('exponential')||raw.includes('flame')||raw.includes('fire'))return 'flame';
  if(raw.includes('grid')||raw.includes('sudoku')||raw.includes('matrix')||raw.includes('table')||raw.includes('puzzle'))return 'grid';
  if(raw.includes('sat')||raw.includes('boolean')||raw.includes('formula')||raw.includes('binary')||raw.includes('clause')||raw.includes('logic'))return 'binary';
  if(raw.includes('clique')||raw.includes('vertex')||raw.includes('graph')||raw.includes('network')||raw.includes('web'))return 'network';
  if(raw.includes('reduction')||raw.includes('bridge')||raw.includes('translate')||raw.includes('workflow')||raw.includes('pipeline'))return 'workflow';
  if(raw.includes('scale')||raw.includes('hardness')||raw.includes('contrapositive')||raw.includes('tradeoff')||raw.includes('balance'))return 'scale';
  if(raw.includes('tool')||raw.includes('coping')||raw.includes('heuristic')||raw.includes('engineer')||raw.includes('wrench'))return 'tools';
  if(raw.includes('cpu')||raw.includes('machine')||raw.includes('turing')||raw.includes('tractable')||raw.includes('core')||raw.includes('hardware')||raw.includes('solver')||raw.includes('compute'))return 'cpu';
  if(raw.includes('guesser')||raw.includes('nondet')||raw.includes('magic')||raw.includes('oracle')||raw.includes('sparkle'))return 'sparkles';
  if(raw.includes('atlas')||raw.includes('cosmos')||raw.includes('horizon')||raw.includes('pspace')||raw.includes('exptime')||raw.includes('globe')||raw.includes('world'))return 'globe';
  if(raw.includes('badge')||raw.includes('cert')||raw.includes('witness')||raw.includes('proof')||raw.includes('realm'))return 'badge';
  if(raw.includes('root')||raw.includes('layer')||raw.includes('stack')||raw.includes('instance')||raw.includes('set'))return 'layers';
  if(raw.includes('brain')||raw.includes('mind')||raw.includes('reason')||raw.includes('curiosity')||raw.includes('intelligence'))return 'brain';
  if(raw.includes('search')||raw.includes('find')||raw.includes('seek'))return 'search';
  if(raw.includes('slider')||raw.includes('parameter')||raw.includes('bound')||raw.includes('threshold')||raw.includes('range'))return 'sliders';
  if(raw.includes('crown')||raw.includes('complete')||raw.includes('summit')||raw.includes('peak'))return 'crown';
  if(raw.includes('compass')||raw.includes('explore')||raw.includes('navigate')||raw.includes('direction'))return 'compass';
  if(raw.includes('atom')||raw.includes('fundamental')||raw.includes('physics'))return 'atom';
  if(raw.includes('zap')||raw.includes('fast')||raw.includes('speed')||raw.includes('instant')||raw.includes('power'))return 'zap';
  if(raw.includes('database')||raw.includes('data')||raw.includes('store'))return 'database';
  if(raw.includes('code')||raw.includes('script')||raw.includes('program'))return 'code';
  if(raw.includes('document')||raw.includes('file')||raw.includes('text'))return 'document';

  return 'layers';
}

export const palette:Record<string,string>={blue:'#8bd0df',gold:'#edca82',green:'#9dceb1',coral:'#eda994',purple:'#c4b0e2'};

export function LiveAsset({name,context,x=0,y=0,size=64,color=palette.gold}:{name?:string;context?:string;x?:number;y?:number;size?:number;color?:string}){
 if(name==='anatomical-eye')return <g transform={`translate(${x} ${y}) scale(${size/300})`}><SourcedEye/></g>;
 if(name==='quill-ink')return <g transform={`translate(${x} ${y}) scale(${size/250})`}><SourcedQuill/></g>;
 const key=resolveIconKey(name,context);
 const Icon=icons[key]||Layers;
 return <g className={`lucide-animated lucide-anim-${key}`} data-asset={`lucide-${key}`} style={{transformBox:'fill-box',transformOrigin:'center'}}><Icon x={x} y={y} width={size} height={size} stroke={color} strokeWidth={1.5}/></g>;
}
