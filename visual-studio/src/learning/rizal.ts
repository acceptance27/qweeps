import manifest from '../../public/lessons/jose_rizal.json';
export const rizalLesson=manifest;
export const rizalChapter=(time:number)=>manifest.chapters.findIndex(c=>time>=c.start&&time<c.end);
export function rizalContext(time:number,selection:string[]){const i=Math.max(0,rizalChapter(time));const chapter=manifest.chapters[i];return {title:manifest.title,question:manifest.question,chapter:i,chapterTitle:chapter.title,selectedEvidence:selection.map(id=>({id,description:manifest.chapters.flatMap(c=>Object.entries(c.roles)).find(([key])=>key===id)?.[1]})),sources:manifest.sources,visualSafeguard:chapter.safeguard,scope:manifest.notes};}

export function rizalCaption(time:number){const chapter=manifest.chapters[Math.max(0,rizalChapter(time))];const local=time-chapter.start;return [...chapter.cues].reverse().find(c=>local>=c.at)?.text||chapter.question;}
