import type {LiveSnapshot} from './geometry';
import type {SceneProgram} from './sceneProgram';
export type DiagramPrimitive={type:'path'|'circle'|'ellipse'|'rect'|'line'|'text';d?:string;text?:string;stroke:string;fill:string;strokeWidth:number;[key:string]:string|number|undefined};
export type DiagramMotion={cue:string;dx:number;dy:number;scale:number;opacity:number;duration:number;delay:number};
export type LiveNode={id:string;title:string;body:string;icon:string;color:string;at:number;tag:string;cells?:string[];position?:{x:number;y:number;width:number;height:number};artwork?:DiagramPrimitive[];motion?:DiagramMotion[]};
export type BeatPresentation={method:string;why:string;visualEvidence:string;textMode:'labels'|'descriptive'};
export type LiveVisual={layout:'comparison'|'process'|'matrix'|'concept'|'timeline'|'loci'|'diagram'|'fanin';presentation?:BeatPresentation;nodes:LiveNode[];connections:{from:string;to:string;label:string;at:number}[];columns:string[];takeaway:string;experiment?:{prompt:string;choices:{label:string;target:string;explanation:string}[]}|null};
export type SpeechCue={target:string;text:string;start:number;end:number;attention?:boolean;phrase?:string};
export type LiveClip={video:string;offset?:number;duration?:number};
export type LiveHotspot={id:string;label:string;x:number;y:number;w:number;h:number};
export type LiveChapter={clip?:LiveClip;hotspots?:LiveHotspot[];id:string;title:string;teaching?:string;years:string;question:string;insight?:string;scene?:SceneProgram;renderer?:'manimgl'|'svg';nativeScene?:string;nativeOffset?:number;roles:Record<string,string|undefined>;sources:string[];sourcePages?:number[];safeguard:string;narration:string;narrationAt:number;narrationCues?:SpeechCue[];audio:string;start:number;end:number;finishedAt:number;transitionOut?:number;transition?:{type:'fade'|'none';duration:number;shared?:string[]};nativeDuration?:number;nativeMap?:{at:number;scene:number}[];visualStart?:number;visualEnd?:number;continuity?:{from:string|null;bridge:string;spokenEnd?:number};cues:{at:number;text:string}[];visual?:LiveVisual};
export type NativeSceneManifest={sceneId:string;duration:number;cues?:{id:string;time:number}[];beats?:{id:string;title?:string;start:number;end:number}[]};

export interface QuizQuestion {
  id: string;
  chapterId: string;
  chapterIndex: number;
  chapterTitle: string;
  kind: 'concept' | 'mechanism' | 'safeguard';
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  safeguardNote?: string | null;
  hint?: string;
}

export type LiveLesson={id:string;kind?:string;title:string;question:string;duration:number;audioTrack?:{url:string;key:string;duration:number;clock:'audio'};representation?:string;documentId?:string|null;documentTitle?:string|null;example?:{title:string;description:string;icon:string};chapters:LiveChapter[];nativeMode?:'per_beat'|'continuous';nativeScenes?:Record<string,NativeSceneManifest>;sources:{id?:string;title:string;url:string}[];quiz?:QuizQuestion[]};
export type LiveJob={id:string;lessonId:string;status:'preparing'|'awaiting_review'|'reviewing'|'ready'|'failed';stage:string;revision:number;error?:string;candidate?:LiveLesson;speechSync?:boolean;canResume?:boolean;generateQuiz?:boolean};
export type StageProps={lesson:LiveLesson;snapshot:LiveSnapshot;focusRequest:number;update:(fn:(s:LiveSnapshot)=>LiveSnapshot)=>void;pause:()=>void;onReady:(v:boolean)=>void;interactive?:boolean};

function cleanTitle(raw: string): string {
  return (raw || 'Concept').replace(/^\s*\d+[\.\)]\s*/, '').trim();
}

function hashSort(items: string[], seed: string): string[] {
  return [...items]
    .map((item, idx) => {
      let h = 2166136261;
      const str = `${seed}:${idx}:${item}`;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return { key: (h >>> 0).toString(16).padStart(8, '0'), item };
    })
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(x => x.item);
}

export function ensureLessonQuiz(lesson: LiveLesson): QuizQuestion[] {
  if (Array.isArray(lesson.quiz) && lesson.quiz.length >= 3) {
    return lesson.quiz;
  }
  const chapters = lesson.chapters || [];
  if (!chapters.length) return [];

  const allInsights = chapters
    .map(c => (c.insight || c.visual?.takeaway || c.cues?.[c.cues.length - 1]?.text || '').trim())
    .filter(Boolean);
  const allSafeguards = chapters
    .map(c => (c.safeguard || '').trim())
    .filter(s => s.length >= 16);
  const allNodeBodies: string[] = [];
  for (const ch of chapters) {
    for (const n of ch.visual?.nodes || []) {
      if (n.body && n.body.trim().length >= 16) allNodeBodies.push(n.body.trim());
    }
    for (const val of Object.values(ch.roles || {})) {
      if (!val) continue;
      const idx = val.indexOf(':');
      const body = idx >= 0 ? val.slice(idx + 1).trim() : val.trim();
      if (body.length >= 16) allNodeBodies.push(body);
    }
  }

  const fallbackDistractors = [
    'It relies on unconstrained brute-force enumeration without structural bounds or conservation laws.',
    'It bypasses intermediate verification steps by assuming every local transition is automatically reversible.',
    'It treats the representation as a static label rather than an active transformation with measurable invariants.',
  ];

  const pickDistractors = (correct: string, pool: string[], seed: string): string[] => {
    const seen = new Set([correct.toLowerCase().trim()]);
    const unique: string[] = [];
    for (const item of [...pool, ...fallbackDistractors]) {
      const norm = item.toLowerCase().trim();
      if (item.trim().length >= 12 && !seen.has(norm)) {
        seen.add(norm);
        unique.push(item.trim());
      }
    }
    return hashSort(unique, seed).slice(0, 3);
  };

  const total = chapters.length;
  const indices: number[] =
    total <= 8
      ? chapters.map((_, i) => i)
      : Array.from(new Set(Array.from({ length: 8 }, (_, i) => Math.min(total - 1, Math.round((i * (total - 1)) / 7)))));

  const questions: QuizQuestion[] = [];
  for (const cIdx of indices) {
    const ch = chapters[cIdx];
    const cTitle = cleanTitle(ch.title);
    const insight = (ch.insight || ch.visual?.takeaway || ch.cues?.[ch.cues.length - 1]?.text || '').trim();
    const takeaway = (ch.visual?.takeaway || insight).trim();
    const safeguard = (ch.safeguard || '').trim();

    if (insight) {
      const qid = `q-${ch.id}-concept`;
      const distractors = pickDistractors(insight, [...allInsights, ...allSafeguards], qid);
      const options = hashSort([insight, ...distractors], `${qid}-opts`);
      questions.push({
        id: qid,
        chapterId: ch.id,
        chapterIndex: cIdx,
        chapterTitle: ch.title,
        kind: 'concept',
        prompt: ch.question || `What is the core conclusion established in "${cTitle}"?`,
        options,
        correctIndex: options.indexOf(insight),
        explanation: insight + (takeaway && takeaway !== insight ? ` — Visual takeaway: ${takeaway}` : ''),
        safeguardNote: safeguard || null,
        hint: `Recall the visual evidence in Beat ${cIdx + 1} (${cTitle}).`,
      });
    }

    const roleEntries = Object.entries(ch.roles || {})
      .map(([id, text]) => {
        if (!text) return null;
        const sep = text.indexOf(':');
        return sep > 0
          ? { id, title: text.slice(0, sep).trim(), body: text.slice(sep + 1).trim() }
          : null;
      })
      .filter((x): x is { id: string; title: string; body: string } => Boolean(x && x.body.length >= 16));

    const nodes = (ch.visual?.nodes || []).filter(n => n.title && n.body && n.body.trim().length >= 16);
    const candidates = nodes.length ? nodes : roleEntries;
    if (candidates.length && questions.length < 12) {
      const target = candidates[cIdx % candidates.length];
      const qidM = `q-${ch.id}-mech`;
      const distractorsM = pickDistractors(target.body, [...allNodeBodies, ...allInsights], qidM);
      const optionsM = hashSort([target.body, ...distractorsM], `${qidM}-opts`);
      questions.push({
        id: qidM,
        chapterId: ch.id,
        chapterIndex: cIdx,
        chapterTitle: ch.title,
        kind: 'mechanism',
        prompt: `In "${cTitle}", how does "${target.title}" function within the lesson's visual mechanism?`,
        options: optionsM,
        correctIndex: optionsM.indexOf(target.body),
        explanation: `In Beat ${cIdx + 1} (${cTitle}), ${target.title}: ${target.body}`,
        safeguardNote: takeaway || null,
        hint: `Inspect "${target.title}" in Beat ${cIdx + 1}.`,
      });
    }
  }
  return questions;
}

