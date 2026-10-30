import manifest from '../../public/lessons/alu.json';
export const aluLesson = manifest;
export const aluChapter = (time: number) => {
  const idx = manifest.chapters.findIndex((c: { start: number; end: number }) => time >= c.start && time < c.end);
  return idx >= 0 ? idx : Math.min(manifest.chapters.length - 1, Math.max(0, manifest.chapters.findIndex((c: { start: number }) => time < c.start) - 1));
};

export function aluContext(time: number, selection: string[]) {
  const i = Math.max(0, aluChapter(time));
  const chapter = manifest.chapters[i] || manifest.chapters[0];
  return {
    title: manifest.title,
    question: manifest.question,
    chapter: i,
    chapterTitle: chapter.title,
    selectedEvidence: selection.map((id: string) => ({
      id,
      description: manifest.chapters.flatMap(c => Object.entries(c.roles || {})).find(([key]) => key === id)?.[1] || id
    })),
    sources: manifest.sources,
    visualSafeguard: manifest.visual_design.safeguard
  };
}

export function aluCaption(time: number) {
  const chapter = manifest.chapters[Math.max(0, aluChapter(time))] || manifest.chapters[0];
  const local = time - chapter.start;
  return [...chapter.cues].reverse().find((c: { at: number; text: string }) => local >= c.at)?.text || chapter.question;
}
