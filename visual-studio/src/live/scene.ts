import type {Point} from './morph';

export type SceneObject=
 | {id:string;kind:'circle';cx:number;cy:number;r:number;fill?:string;fillOpacity?:number;stroke?:string;strokeWidth?:number;opacity?:number;label?:string;labelSize?:number;labelFill?:string}
 | {id:string;kind:'rect';x:number;y:number;width:number;height:number;rx?:number;fill?:string;fillOpacity?:number;stroke?:string;strokeWidth?:number;opacity?:number}
 | {id:string;kind:'path';d:string;fill?:string;fillOpacity?:number;stroke?:string;strokeWidth?:number;opacity?:number;dash?:string}
 | {id:string;kind:'text';x:number;y:number;text:string;size:number;fill?:string;anchor?:'start'|'middle'|'end';opacity?:number}
 | {id:string;kind:'arrow';from:Point;to:Point;stroke?:string;strokeWidth?:number;opacity?:number}
 | {id:string;kind:'group';children:SceneObject[];opacity?:number};

export type SceneAction=
 | {at:number;duration:number;kind:'show'|'fade';id:string;opacity?:number}
 | {at:number;duration:number;kind:'move';id:string;x:number;y:number}
 | {at:number;duration:number;kind:'scale';id:string;scale:number}
 | {at:number;duration:number;kind:'morph';id:string;d:string;mode:'replace'|'copy';fill?:string;fillOpacity?:number;stroke?:string}
 | {at:number;duration:number;kind:'indicate';id:string}
 | {at:number;duration:number;kind:'draw';id:string}
 | {at:number;duration:number;kind:'dock';id:string;x:number;y:number;scale:number};

export type Scene={
 id:string;title:string;question:string;teaching:string;
 duration:number;objects:SceneObject[];actions:SceneAction[];
};

export function flatten(objects:SceneObject[]):SceneObject[]{
 return objects.flatMap(object=>object.kind==='group'?[object,...flatten(object.children)]:[object]);
}
