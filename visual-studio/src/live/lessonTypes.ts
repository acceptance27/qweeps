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
  kind: 'concept' | 'mechanism' | 'safeguard' | 'multi_item';
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  safeguardNote?: string | null;
  hint?: string;
  acceptedAnswers?: string[];
  expectedItems?: string[];
  itemAliases?: Record<string, string[]>;
  itemLabel?: string;
}

export type LiveLesson={id:string;kind?:string;title:string;question:string;duration:number;audioTrack?:{url:string;key:string;duration:number;clock:'audio'};representation?:string;documentId?:string|null;documentTitle?:string|null;example?:{title:string;description:string;icon:string};chapters:LiveChapter[];nativeMode?:'per_beat'|'continuous';nativeScenes?:Record<string,NativeSceneManifest>;sources:{id?:string;title:string;url:string}[];quiz?:QuizQuestion[]};
export type LiveJob={id:string;lessonId:string;status:'preparing'|'awaiting_review'|'reviewing'|'ready'|'failed';stage:string;revision:number;error?:string;candidate?:LiveLesson;speechSync?:boolean;canResume?:boolean;generateQuiz?:boolean};
export type StageProps={lesson:LiveLesson;snapshot:LiveSnapshot;focusRequest:number;update:(fn:(s:LiveSnapshot)=>LiveSnapshot)=>void;pause:()=>void;onReady:(v:boolean)=>void;interactive?:boolean};

function cleanTitle(raw: string): string {
  return (raw || 'Concept').replace(/^\s*\d+[\.\)]\s*/, '').trim();
}

function cleanSafeguardForStudent(raw: string): string {
  const t = (raw || '').trim();
  if (!t) return '';
  const replacements: Record<string, string> = {
    'learner may treat liability as automatic fault; prevent by stressing legally obliged versus answerable and may-require qualifiers.':
      'Do not treat liability as automatic moral fault: liability is legal obligation to compensate, distinct from personal answerability or blame.',
    'learner may blame individuals; prevent by stating each account is true and failure is missing whole-system ownership.':
      'Do not blame individuals in isolation: each role account may be correct while missing whole-system ownership.',
    'learner may seek single broken component; prevent by holding final control question and illustrating systemic cause.':
      'Avoid seeking a single broken component: systemic defects emerge from uncoordinated interactions across multiple components.',
    'learner may treat conditions as misconduct; prevent by stating they are normal habits requiring diagnosis, marked illustrative.':
      'Do not treat organizational defect conditions as intentional misconduct: they are ordinary habits requiring diagnostic safeguards.',
    'learner may think effectiveness is boldness; prevent by stating second version is better written and gives manager something to approve.':
      'Effective dissent is not emotional boldness: it is disciplined written documentation that gives leadership an actionable decision.',
    'learner may rely on verbal memory; prevent by showing no one recalls conversation and requiring written summary.':
      'Never rely on unrecorded verbal memory: contemporaneous written summaries protect everyone by recording what was known and decided.',
    'learner may see course as urging whistleblowing; prevent by stating it teaches conditions, sequence, and cost for deliberate action.':
      'External disclosure is a grave last resort with severe personal cost: ethical frameworks teach rigorous gate conditions rather than urging whistleblowing.',
  };
  for (const [k, v] of Object.entries(replacements)) {
    if (t.toLowerCase().includes(k) || k.includes(t.toLowerCase())) return v;
  }
  return t
    .replace(/^Learner may\s+/i, 'Be careful not to ')
    .replace(/;\s*prevent by\s+/i, '. Key safeguard: ')
    .replace(/\blearner\b/gi, 'team member');
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
    .map(c => cleanSafeguardForStudent(c.safeguard || ''))
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
    'It treats isolated component successes as a substitute for verifying total end-to-end system reliability.',
    'It assumes local procedural adherence automatically resolves structural accountability across boundaries.',
  ];

  const pickDistractors = (correct: string, pool: string[], seed: string): string[] => {
    const seen = new Set([correct.toLowerCase().trim()]);
    const unique: string[] = [];
    for (const item of [...pool, ...fallbackDistractors]) {
      const norm = item.toLowerCase().trim();
      if (item.trim().length >= 10 && !seen.has(norm)) {
        seen.add(norm);
        unique.push(item.trim());
      }
    }
    // Balance option lengths: prioritize distractors close in character length to correct answer
    // so that the correct answer is not identifiable merely by being the longest text.
    const targetLen = correct.length;
    const lengthMatched = [...unique].sort((a, b) => {
      const diffA = Math.abs(a.length - targetLen);
      const diffB = Math.abs(b.length - targetLen);
      if (Math.abs(diffA - diffB) > 20) return diffA - diffB;
      return 0;
    });
    return hashSort(lengthMatched.slice(0, 10), seed).slice(0, 3);
  };

  const total = chapters.length;
  const indices: number[] = chapters.map((_, i) => i);

  const questions: QuizQuestion[] = [];
  for (const cIdx of indices) {
    const ch = chapters[cIdx];
    const cTitle = cleanTitle(ch.title);
    const insight = (ch.insight || ch.visual?.takeaway || ch.cues?.[ch.cues.length - 1]?.text || '').trim();
    const takeaway = (ch.visual?.takeaway || insight).trim();
    const safeguard = cleanSafeguardForStudent(ch.safeguard || '');

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

    if (insight) {
      const qid = `q-${ch.id}-concept`;
      let conceptDistractors: string[] = (ch as unknown as { conceptDistractors?: string[] }).conceptDistractors || [];
      if (!conceptDistractors.length || conceptDistractors.length < 3) {
        if (candidates.length >= 2) {
          const t0 = candidates[0].title;
          const t1 = candidates[1].title;
          const tLast = candidates[candidates.length - 1].title;
          conceptDistractors = [
            `${t0} and ${t1} are functionally identical in this framework, requiring no operational distinction between them.`,
            `${tLast} is the sole required condition, guaranteeing system success without addressing ${t0}.`,
            `Following ${t0} in isolation guarantees complete protection without establishing whole-system accountability.`,
          ];
        } else {
          conceptDistractors = [
            `Treats "${cTitle}" as an unverified informal assumption rather than an active verifiable constraint.`,
            `Assumes individual local adherence to "${cTitle}" automatically guarantees end-to-end reliability.`,
            `Confines "${cTitle}" to post-hoc reporting while treating forward prevention as an optional feature.`,
          ];
        }
      }
      const options = hashSort([insight, ...conceptDistractors.slice(0, 3)], `${qid}-opts`);
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
        acceptedAnswers: [cTitle, insight.split(/[,.;]/)[0].trim()],
      });
    }
    
    // Generate questions for candidate rows/nodes in this beat
    for (let nIdx = 0; nIdx < candidates.length; nIdx++) {
      const target = candidates[nIdx];
      const qidTerm = `q-${ch.id}-node-${nIdx}`;
      const otherTitles = candidates.filter((_, i) => i !== nIdx).map(c => c.title);
      // Collect alternative titles from other beats if fewer than 3
      for (const otherCh of chapters) {
        if (otherTitles.length >= 3) break;
        if (otherCh.id === ch.id) continue;
        for (const on of otherCh.visual?.nodes || []) {
          if (on.title && !otherTitles.includes(on.title) && on.title !== target.title) {
            otherTitles.push(on.title);
          }
        }
      }
      const titleOptions = hashSort([target.title, ...otherTitles.slice(0, 3)], `${qidTerm}-opts`);
      questions.push({
        id: qidTerm,
        chapterId: ch.id,
        chapterIndex: cIdx,
        chapterTitle: ch.title,
        kind: 'mechanism',
        prompt: `In "${cTitle}", which concept or component is defined as: "${target.body}"?`,
        options: titleOptions,
        correctIndex: titleOptions.indexOf(target.title),
        explanation: `In Beat ${cIdx + 1} (${cTitle}), ${target.title}: ${target.body}`,
        safeguardNote: takeaway || null,
        hint: `Inspect "${target.title}" in Beat ${cIdx + 1}.`,
        acceptedAnswers: [target.title, cleanTitle(target.title), target.title.toLowerCase()],
      });
    }

    // Add multi-item recall question if beat has 3 or more rows/nodes
    if (candidates.length >= 3) {
      const qidMulti = `q-${ch.id}-multi`;
      const expectedItems = candidates.map(c => c.title);
      const correctJoined = expectedItems.join(', ');
      
      // Build length-balanced multi-item distractors
      const distractorLists: string[] = [];
      for (let d = 1; d <= 3; d++) {
        const alt = [...expectedItems];
        // Perturb 1-2 items with plausible replacements
        alt[(d - 1) % alt.length] = d === 1 ? 'Unverified heuristic' : d === 2 ? 'Single point of failure' : 'Isolated procedural sign-off';
        distractorLists.push(alt.join(', '));
      }
      const multiOptions = hashSort([correctJoined, ...distractorLists], `${qidMulti}-opts`);

      const aliases: Record<string, string[]> = {};
      for (const item of expectedItems) {
        const raw = item.trim();
        const base = raw.replace(/\s*\(.*?\)/, '').split(':')[0].trim();
        const set = new Set([raw, raw.toLowerCase(), base, base.toLowerCase()].filter(Boolean));
        const words = raw.match(/[a-zA-Z]{4,}/g) || [];
        for (const w of words) set.add(w.toLowerCase());
        aliases[item] = Array.from(set);
      }

      questions.push({
        id: qidMulti,
        chapterId: ch.id,
        chapterIndex: cIdx,
        chapterTitle: ch.title,
        kind: 'multi_item',
        prompt: `Name all ${candidates.length} key components analyzed in "${cTitle}".`,
        options: multiOptions,
        correctIndex: multiOptions.indexOf(correctJoined),
        explanation: `The complete set of ${candidates.length} components in "${cTitle}": ${correctJoined}.`,
        safeguardNote: takeaway || null,
        hint: `Think of all the rows/cards shown in Beat ${cIdx + 1} (${cTitle}).`,
        expectedItems,
        itemAliases: aliases,
        itemLabel: 'components',
      });
    }

    // Misconception safeguard question with strictly on-topic distractors
    if (safeguard && safeguard.length >= 24 && !safeguard.startsWith('Focused mini-lesson')) {
      const qidSafeguard = `q-${ch.id}-safeguard`;
      let safeguardDistractors: string[] = (ch as unknown as { safeguardDistractors?: string[] }).safeguardDistractors || [];
      if (!safeguardDistractors.length || safeguardDistractors.length < 3) {
        if (candidates.length >= 2) {
          const t0 = candidates[0].title;
          const t1 = candidates[1].title;
          safeguardDistractors = [
            `Assume that achieving ${t0} automatically fulfills ${t1} without independent verification.`,
            `Treat failures in ${t0} as intentional misconduct rather than systemic organizational gaps.`,
            `Rely on informal verbal consensus rather than documenting explicit ${t1} agreements.`,
          ];
        } else {
          safeguardDistractors = [
            `Assume that local procedural compliance in "${cTitle}" guarantees systemic reliability.`,
            `Treat diagnostic warning signals in "${cTitle}" as harmless noise if immediate tests pass.`,
            `Rely on retrospective memory after incidents occur rather than recording choices at the time.`,
          ];
        }
      }
      const safeguardOptions = hashSort([safeguard, ...safeguardDistractors.slice(0, 3)], `${qidSafeguard}-opts`);
      questions.push({
        id: qidSafeguard,
        chapterId: ch.id,
        chapterIndex: cIdx,
        chapterTitle: ch.title,
        kind: 'safeguard',
        prompt: `Which critical safeguard or boundary condition applies when interpreting "${cTitle}"?`,
        options: safeguardOptions,
        correctIndex: safeguardOptions.indexOf(safeguard),
        explanation: `Safeguard for ${cTitle}: ${safeguard}`,
        safeguardNote: insight || null,
        hint: `Think about the common misreading warned against in Beat ${cIdx + 1}.`,
        acceptedAnswers: [cTitle, safeguard.split('.')[0].trim()],
      });
    }
  }
  return questions;
}

