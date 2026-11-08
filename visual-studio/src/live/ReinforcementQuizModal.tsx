import {useCompactLayout} from './useCompactLayout';
import LearningWorld from './LearningWorld';
import {partitionOrderedQuestions,orderedSafeInsertion} from './orderedQuiz';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  Sparkles,
  Flame,
  Trophy,
  ArrowRight,
  ArrowLeft,
  HelpCircle,
  Eye,
  X,
  Repeat,
  ShieldAlert,
  Layers,
  Brain,
  Volume2,
  VolumeX,
  Zap,
  Download,
} from 'lucide-react';
import { ensureLessonQuiz, type LiveLesson, type QuizQuestion } from './lessonTypes';
import {advanceChallenge, answerChallenge, challengeHelp, challengeRequiresTyping, comboMultiplier, difficultyLabels, isChallenge,
  pauseChallenge, restoreChallenge, resumeChallenge, saveChallenge, startChallenge, type QuizChallenge} from './quizChallenge';

export interface ActiveCard extends QuizQuestion {
  roundNumber: number;
  attemptNumber: number;
  isReinforcement: boolean;
  isSpacedRecall?: boolean;
  priorTrapOptionText?: string;
  requiresTypedRecall?: boolean;
}

export interface QuizProgressState {
  challenge?: QuizChallenge;
  lessonId: string;
  baseQuestions: QuizQuestion[];
  activeSetIndex: number;
  queue: ActiveCard[];
  cursor: number;
  reinforcementQueue: ActiveCard[];
  round: number;
  selectedOption: number | null;
  showHint: boolean;
  soundEnabled: boolean;
  masteredIds: string[];
  everMissedIds: string[];
  attemptsByQuestion: Record<string, number>;
  historyByQuestion: Record<
    string,
    {
      selectedOption: number | null;
      typedFeedback: {
        status: 'correct' | 'wrong' | 'revealed';
        userText: string;
        matchedText?: string;
        semantic?: boolean;
        feedback?: string;
      } | null;
      recalledItems?: string[];
      multiItemRevealed?: boolean;
      isCorrect: boolean;
    }
  >;
  viewingQuestionId: string | null;
  streak: number;
  bestStreak: number;
  totalSubmissions: number;
  completed: boolean;
  setCompleted: boolean;
  isHardMode: boolean;
  rapidScan: boolean;
  memoryLocked: boolean;
  typedInput: string;
  isVerifyingSemantic?: boolean;
  typedFeedback: {
    status: 'correct' | 'wrong' | 'revealed';
    userText: string;
    matchedText?: string;
    semantic?: boolean;
    feedback?: string;
  } | null;
  recalledItems: string[];
  multiItemRevealed: boolean;
}

export function partitionQuizSets<T>(
  items: T[],
  baseSize = 10,
  minRemainder = 5
): T[][] {
  if (!items || items.length === 0) return [];
  if (items.length < baseSize + minRemainder) {
    return [items];
  }
  const result: T[][] = [];
  let offset = 0;
  while (offset < items.length) {
    const remaining = items.length - offset;
    if (remaining < baseSize + minRemainder) {
      result.push(items.slice(offset));
      break;
    } else {
      result.push(items.slice(offset, offset + baseSize));
      offset += baseSize;
    }
  }
  return result;
}

export interface QuizSet {
  id: string;
  index: number;
  title: string;
  shortTitle: string;
  subtitle?: string;
  questions: QuizQuestion[];
  startNumber: number;
  endNumber: number;
}

export interface ThematicUnitSpec {
  id: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  chapterIds: string[];
  titleKeywords?: string[];
}

export const RIZAL_THEMATIC_UNITS: ThematicUnitSpec[] = [
  {
    id: 'unit-1-source-jurist',
    title: 'Unit 1: The Source & The Jurist',
    shortTitle: '1. Source & Jurist',
    subtitle: 'Why Morga Was Chosen & Sucesos 1609',
    chapterIds: ['bakit-morga', 'sucesos-1609', 'why-morga', 'rizal-test'],
    titleKeywords: ['morga', 'sucesos', 'jurist', '1609'],
  },
  {
    id: 'unit-2-historical-method',
    title: 'Unit 2: Historical Method & Tripartite Framework',
    shortTitle: '2. Historical Method',
    subtitle: 'London Research, British Museum & Bipartite vs Tripartite History',
    chapterIds: ['london-loci', 'tripartite', 'two-histories'],
    titleKeywords: ['london', 'tripartite', 'bipartite', 'civilization'],
  },
  {
    id: 'unit-3-precolonial-culture',
    title: 'Unit 3: Pre-Colonial Culture & Annotations',
    shortTitle: '3. Culture & Annotations',
    subtitle: "Rizal's Four Core Historical Corrections",
    chapterIds: ['apat-anotasyon', 'four-corrections'],
    titleKeywords: ['apat', 'four annotations', 'core annotations', 'prove it'],
  },
  {
    id: 'unit-4-propaganda-defense',
    title: 'Unit 4: Propaganda Societies & Defense Against Critics',
    shortTitle: '4. Propaganda & Defense',
    subtitle: 'Paris Samahan (Kidlat, Indios Bravos, RDLM) & Rebutting Spanish Critics',
    chapterIds: ['paris-samahan', 'tugon-kritiko', 'paris-organize', 'answering-critics', 'who-narrates'],
    titleKeywords: ['paris', 'kidlat', 'indios bravos', 'r.d.l.m.', 'rdlm', 'critics', 'tugon'],
  },
];

export function getQuizSets(questions: QuizQuestion[]): QuizSet[] {
  if (!questions || questions.length === 0) return [];

  // Check if questions match the Rizal Morga reviewer thematic curriculum
  const isRizalThematic = questions.some(q => {
    if (q.formatVersion === 2) return false;
    const cid = (q.chapterId || '').toLowerCase();
    const ctitle = (q.chapterTitle || '').toLowerCase();
    return (
      ['bakit-morga', 'sucesos-1609', 'london-loci', 'tripartite', 'apat-anotasyon', 'paris-samahan', 'tugon-kritiko'].includes(cid) ||
      ctitle.includes('morga') ||
      ctitle.includes('sucesos') ||
      ctitle.includes('tripartite') ||
      ctitle.includes('indios bravos')
    );
  });

  if (isRizalThematic) {
    let currentOffset = 1;
    const units: QuizSet[] = [];
    const usedIds = new Set<string>();

    for (const spec of RIZAL_THEMATIC_UNITS) {
      const unitQuestions = questions.filter(q => {
        if (usedIds.has(q.id)) return false;
        const cid = (q.chapterId || '').toLowerCase();
        const ctitle = (q.chapterTitle || '').toLowerCase();
        if (spec.chapterIds.includes(cid)) return true;
        if (spec.titleKeywords && spec.titleKeywords.some(k => ctitle.includes(k) || cid.includes(k))) {
          return true;
        }
        return false;
      });

      if (unitQuestions.length > 0) {
        unitQuestions.forEach(q => usedIds.add(q.id));
        const startNumber = currentOffset;
        const endNumber = currentOffset + unitQuestions.length - 1;
        currentOffset = endNumber + 1;
        units.push({
          id: spec.id,
          index: units.length,
          title: spec.title,
          shortTitle: spec.shortTitle,
          subtitle: spec.subtitle,
          questions: unitQuestions,
          startNumber,
          endNumber,
        });
      }
    }

    if (units.length > 0 && usedIds.size === questions.length) {
      return units;
    }

    if (units.length > 0 && usedIds.size < questions.length) {
      const remainingQuestions = questions.filter(q => !usedIds.has(q.id));
      const lastUnit = units[units.length - 1];
      lastUnit.questions = [...lastUnit.questions, ...remainingQuestions];
      lastUnit.endNumber = lastUnit.startNumber + lastUnit.questions.length - 1;
      return units;
    }
  }

  // Fallback: Partition generically into 10-question focus sets (incrementing up to 5)
  const partitioned = questions.some(q => q.orderedSlot) ? partitionOrderedQuestions(questions) : partitionQuizSets(questions, 10, 5);
  let runningCount = 1;
  return partitioned.map((chunk, idx) => {
    const startNumber = runningCount;
    const endNumber = runningCount + chunk.length - 1;
    runningCount = endNumber + 1;
    return {
      id: `set-${idx + 1}`,
      index: idx,
      title: `Set ${idx + 1}`,
      shortTitle: `Set ${idx + 1}`,
      questions: chunk,
      startNumber,
      endNumber,
    };
  });
}

export interface OptionHookSplit {
  leadHook: string;
  supportingText: string;
}

export function splitOptionHook(text: string): OptionHookSplit {
  if (!text) return { leadHook: '', supportingText: '' };
  const trimmed = text.trim();

  // 1. Colon separator within first 45 chars (e.g. "Decided: decision and decider", "Harm + Belief: ...")
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx > 0 && colonIdx <= 45) {
    const lead = trimmed.slice(0, colonIdx).trim();
    const rest = trimmed.slice(colonIdx + 1).trim();
    if (lead.split(/\s+/).length <= 7 && rest.length > 0) {
      return { leadHook: lead, supportingText: rest };
    }
  }

  // 2. Semicolon or em-dash within first 45 chars
  const sepIdx = trimmed.search(/[;—]/);
  if (sepIdx > 0 && sepIdx <= 45) {
    const lead = trimmed.slice(0, sepIdx).trim();
    const rest = trimmed.slice(sepIdx + 1).trim();
    if (lead.split(/\s+/).length <= 7 && rest.length > 0) {
      return { leadHook: lead, supportingText: rest };
    }
  }

  // 3. Comma separator within first 2 to 6 words (e.g. "Responsibility asks who could act, ...")
  const commaIdx = trimmed.indexOf(',');
  if (commaIdx > 0 && commaIdx <= 45) {
    const lead = trimmed.slice(0, commaIdx).trim();
    const words = lead.split(/\s+/);
    if (words.length >= 2 && words.length <= 6) {
      const rest = trimmed.slice(commaIdx + 1).trim();
      if (rest.length > 0) {
        return { leadHook: lead, supportingText: rest };
      }
    }
  }

  // 4. Period separator within first 3 to 6 words
  const dotIdx = trimmed.indexOf('.');
  if (dotIdx > 0 && dotIdx <= 45) {
    const lead = trimmed.slice(0, dotIdx).trim();
    const words = lead.split(/\s+/);
    if (words.length >= 2 && words.length <= 6) {
      const rest = trimmed.slice(dotIdx + 1).trim();
      if (rest.length > 0) {
        return { leadHook: lead, supportingText: rest };
      }
    }
  }

  // 5. Short options (<= 5 words total)
  const allWords = trimmed.split(/\s+/);
  if (allWords.length <= 5) {
    return { leadHook: trimmed, supportingText: '' };
  }

  // 6. Natural 3-5 word lead hook cutoff for longer prose
  const targetWords = allWords.length >= 8 ? 4 : 3;
  const lead = allWords.slice(0, targetWords).join(' ');
  const rest = allWords.slice(targetWords).join(' ');
  return { leadHook: lead, supportingText: rest };
}

export function getCardKeyHook(card: QuizQuestion): string {
  const correctOpt = card.options[card.correctIndex] || '';
  if (!correctOpt) return card.chapterTitle || 'Key Concept';

  if (card.acceptedAnswers && card.acceptedAnswers.length > 0) {
    const sorted = [...card.acceptedAnswers]
      .filter(a => a && a.length >= 3 && a.length <= 36)
      .sort((a, b) => a.length - b.length);
    if (sorted.length > 0) {
      return sorted[0];
    }
  }

  const { leadHook } = splitOptionHook(correctOpt);
  return leadHook || correctOpt.slice(0, 35);
}

export function createInitialQuizState(
  lesson: LiveLesson,
  soundEnabled = true,
  hardMode = false,
  rapidScan = false
): QuizProgressState {
  const baseQuestions = ensureLessonQuiz(lesson);
  const sets = getQuizSets(baseQuestions);
  const initialSetIndex = sets.length > 0 ? 0 : -1;
  const initialQuestions = initialSetIndex >= 0 ? sets[initialSetIndex].questions : baseQuestions;

  return restoreChallenge({
    lessonId: lesson.id,
    baseQuestions,
    activeSetIndex: initialSetIndex,
    queue: initialQuestions.map(q => ({
      ...q,
      roundNumber: 1,
      attemptNumber: 1,
      isReinforcement: false,
    })),
    cursor: 0,
    reinforcementQueue: [],
    round: 1,
    selectedOption: null,
    showHint: false,
    soundEnabled,
    masteredIds: [],
    everMissedIds: [],
    attemptsByQuestion: {},
    historyByQuestion: {},
    viewingQuestionId: null,
    streak: 0,
    bestStreak: 0,
    totalSubmissions: 0,
    completed: false,
    setCompleted: false,
    isHardMode: hardMode,
    rapidScan,
    memoryLocked: false,
    typedInput: '',
    isVerifyingSemantic: false,
    typedFeedback: null,
    recalledItems: [],
    multiItemRevealed: false,
  });
}

/** Shared by both navigation surfaces so entering/leaving a run cannot lose it. */
export function selectQuizSet(previous: QuizProgressState, targetSetIdx: number, seed = Date.now()): QuizProgressState {
  if (targetSetIdx === -1) return resumeChallenge(previous, seed);
  const prev = pauseChallenge(previous);
  if (prev.activeSetIndex === targetSetIdx && !isChallenge(previous)) return prev;
  const targetQuestions = getQuizSets(prev.baseQuestions)[targetSetIdx]?.questions || prev.baseQuestions;
  const mastered = new Set(prev.masteredIds);
  const pending = targetQuestions.filter(q => !mastered.has(q.id));
  return {...prev, activeSetIndex: targetSetIdx,
    queue: (pending.length ? pending : targetQuestions).map((q, idx) => ({...shuffleQuestionOptions(q, seed + idx),
      roundNumber: 1, attemptNumber: (prev.attemptsByQuestion[q.id] || 0) + 1, isReinforcement: false})),
    reinforcementQueue: [], cursor: 0, round: 1, selectedOption: null, showHint: false,
    memoryLocked: false, typedInput: '', typedFeedback: null, recalledItems: [], multiItemRevealed: false,
    viewingQuestionId: null, completed: getQuizSets(prev.baseQuestions).length === 1 && pending.length === 0, isVerifyingSemantic: false,
    setCompleted: targetQuestions.length > 0 && targetQuestions.every(q => mastered.has(q.id))};
}

interface ReinforcementQuizNavbarProps {
  lesson: LiveLesson;
  quizState: QuizProgressState;
  setQuizState: React.Dispatch<React.SetStateAction<QuizProgressState>>;
  onClose?: () => void;
  showCloseButton?: boolean;
  hideTitle?: boolean;
  className?: string;
}

function ChallengeHearts({hearts}: {hearts: number}) {
  return <span className="challenge-hearts" role="img" aria-label={`${hearts} hearts remaining`} title="A miss costs one heart. Every five correct answers restore half a heart, up to five.">
    {[0,1,2,3,4].map(i => <span className="challenge-heart" key={i} aria-hidden="true">
      <svg viewBox="0 0 16 14"><path d="M2 0H6V2H10V0H14V2H16V8H14V10H12V12H10V14H6V12H4V10H2V8H0V2H2Z"/></svg>
      <span className="challenge-heart-fill" style={{width: `${Math.max(0, Math.min(1,hearts-i))*100}%`}}><svg viewBox="0 0 16 14"><path d="M2 0H6V2H10V0H14V2H16V8H14V10H12V12H10V14H6V12H4V10H2V8H0V2H2Z"/></svg></span>
    </span>)}
  </span>;
}

function OrderedPrompt({card, history, answered}: {card: QuizQuestion; history: QuizProgressState['historyByQuestion']; answered: boolean}) {
  const group = card.orderedSlot!;
  const parts = group.prompt.split(/_{3,}/);
  return <>{parts.map((part,i) => <span key={i}>{part}{i < group.answers.length &&
    <span className={`ordered-blank ${i === group.index ? 'active' : ''} ${i < group.index && history[group.slotIds[i]] || i === group.index && answered ? 'filled' : ''}`} aria-current={i === group.index ? 'step' : undefined}>
      <small>{i+1}.</small> {i < group.index && history[group.slotIds[i]] || i === group.index && answered ? group.answers[i] : '____'}
    </span>}</span>)}</>;
}

export function ReinforcementQuizNavbar({
  lesson,
  quizState,
  setQuizState,
  onClose,
  showCloseButton = false,
  className = '',
  hideTitle = false,
 } : ReinforcementQuizNavbarProps) {
  const {compact,landscape} = useCompactLayout();
  const challenge = isChallenge(quizState) ? quizState.challenge : undefined;
  const requiredTyping = challengeRequiresTyping(quizState);
  const [controlsOpen,setControlsOpen] = useState(false);
  useEffect(()=>setControlsOpen(false),[compact,landscape]);
  const {baseQuestions, round, streak, soundEnabled, activeSetIndex} = quizState;
  const sets = useMemo(() => getQuizSets(baseQuestions), [baseQuestions]);
  const currentSetIdx = activeSetIndex ?? 0;
  const onSelectSet = (targetSetIdx: number) => {
    const seed = Date.now();
    playStepSound(soundEnabled);
    setQuizState(prev => selectQuizSet(prev, targetSetIdx, seed));
  };

  return (
    <div className={`mastery-quiz-top-shell ${className}`.trim()}>
      {compact&&<button type="button" className="mastery-mobile-toggle" aria-expanded={controlsOpen} onClick={()=>setControlsOpen(v=>!v)}>{challenge ? <ChallengeHearts hearts={challenge.hearts}/> : <Layers size={15}/>}<span>{challenge ? `${challenge.score.toLocaleString()} pts · ${comboMultiplier(streak)}× combo` : 'Quiz controls'}</span><span>{controlsOpen?'Close':'Open'}</span></button>}
      <div className="mastery-controls-body" hidden={compact&&!controlsOpen}>
      <header className="mastery-quiz-header">
        {!hideTitle && <div className="mastery-quiz-brand">
          <span className="mastery-quiz-badge">
            <Brain size={14} /> REINFORCEMENT QUIZ
          </span>
          <h2>{lesson.title}</h2>
        </div>}

        <div className="mastery-quiz-stats">
          {!compact && challenge && <ChallengeHearts hearts={challenge.hearts}/>}
          <button
            type="button"
            className={`mastery-rapid-scan-btn ${quizState.rapidScan ? 'active' : ''}`}
            onClick={() => {
              const nextRapid = !quizState.rapidScan;
              setQuizState(prev => ({ ...prev, rapidScan: nextRapid }));
              playStepSound(soundEnabled);
            }}
            title={quizState.rapidScan ? '⚡ Rapid Scan Active: Key hooks only (click to show full supporting text)' : '⚡ Rapid Scan: Hide supporting prose and answer purely by key-phrase hooks'}
          >
            <Zap size={13} />
            <span>Rapid Scan</span>
          </button>
          <button
            type="button"
            className={`mastery-mode-toggle-btn ${quizState.isHardMode || requiredTyping ? 'hard' : 'standard'} ${requiredTyping ? 'required-recall' : ''}`}
            disabled={requiredTyping}
            onClick={() => {
              const nextHard = !quizState.isHardMode;
              setQuizState(prev => ({
                ...prev,
                isHardMode: nextHard,
                isVerifyingSemantic: false,
                typedInput: '',
                typedFeedback: null,
                recalledItems: [],
                multiItemRevealed: false,
              }));
              playStepSound(soundEnabled);
            }}
            title={requiredTyping ? 'Previously recalled cards require typed recall on later returns.' : quizState.isHardMode ? 'Switch to Multiple Choice Mode' : 'Switch to Hard Mode (Type Answers)'}
          >
            {quizState.isHardMode || requiredTyping ? <Flame size={13} /> : <Sparkles size={13} />}
            <span>{requiredTyping ? 'Typed Recall' : quizState.isHardMode ? 'Hard Mode' : 'Standard'}</span>
          </button>
          <div className={`mastery-round-tag ${challenge ? 'challenge-score' : round > 1 ? 'reinforcing' : ''}`}>
            {challenge ? <Trophy size={14}/> : <Repeat size={13} />}
            <span>
              {challenge ? `${challenge.score.toLocaleString()} pts` : round === 1
                ? 'Round 1'
                : `Round ${round}`}
            </span>
          </div>
          <div className={`mastery-streak-tag ${streak >= 2 ? 'hot' : ''}`} title={challenge ? 'Clean-answer combos: 3 = 1.25×, 5 = 1.5×, 10 = 2×' : 'Current consecutive correct answers'}>
            <Flame size={14} />
            <span>{challenge ? `${comboMultiplier(streak)}× combo · ${streak} streak` : `${streak} Streak`}</span>
          </div>
          <button
            type="button"
            className="mastery-mode-toggle-btn standard"
            onClick={() => {
              const exportData = {
                id: lesson.id,
                title: lesson.title,
                question: lesson.question,
                quiz: baseQuestions,
                chapters: lesson.chapters || [],
              };
              const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${(lesson.title || 'qweeps-quiz').replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            title="Export this quiz/lesson as a JSON file to transfer to your phone"
          >
            <Download size={13} />
            <span>Export</span>
          </button>
          <button
            type="button"
            className="mastery-close-btn"
            onClick={() => {
              const next = !soundEnabled;
              setQuizState(prev => ({ ...prev, soundEnabled: next }));
              if (next) playStepSound(true);
            }}
            title={soundEnabled ? 'Mute quiz sound effects' : 'Enable quiz sound effects'}
            aria-label={soundEnabled ? 'Mute quiz sound effects' : 'Enable quiz sound effects'}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          {showCloseButton && onClose && (
            <button type="button" className="mastery-close-btn" onClick={onClose} title="Close Quiz (Esc)">
              <X size={18} />
            </button>
          )}
        </div>
      </header>

      {sets.length > 0 && (
        <div className="mastery-set-selector-bar" role="tablist" aria-label="Quiz question sets">
          {sets.map((setGroup, sIdx) => {
            const isActive = currentSetIdx === sIdx;

            return (
              <button
                key={setGroup.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`mastery-set-pill ${isActive ? 'active' : ''}`}
                onClick={() => onSelectSet(sIdx)}
                title={setGroup.subtitle || setGroup.title}
              >
                <span className="mastery-set-title">
                  {setGroup.shortTitle}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            role="tab"
            aria-selected={currentSetIdx === -1}
            className={`mastery-set-pill all-pill ${currentSetIdx === -1 ? 'active' : ''}`}
            onClick={() => onSelectSet(-1)}
            title={`Scored challenge across all ${baseQuestions.length} questions, with adaptive recall and streak combos`}
          >
            <span className="mastery-set-title">All Questions <small className="mastery-set-range">· Challenge</small></span>
            <span className="mastery-set-status">{challenge ? 'Playing' : quizState.challenge?.paused ? 'Resume' : 'Play'}</span>
          </button>
        </div>
      )}

      </div>

    </div>
  );
}

interface ReinforcementQuizModalProps {
  lesson: LiveLesson;
  onClose: () => void;
  onJumpToChapter?: (chapterIndex: number) => void;
  embedded?: boolean;
  hideHeader?: boolean;
  quizState?: QuizProgressState;
  setQuizState?: React.Dispatch<React.SetStateAction<QuizProgressState>>;
}

// Synthesized Web Audio API sound engine for tactile quiz feedback
let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

function playTone(
  freq: number,
  startOffset: number,
  duration: number,
  type: OscillatorType = 'triangle',
  peakGain = 0.14,
  endFreq?: number
) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (endFreq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + duration);
  }
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(peakGain, now + Math.min(0.018, duration * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export function playQuizStartSound(enabled = true) {
  if (!enabled) return;
  // Uplifting rising shimmer triad (C5 -> E5 -> G5 -> C6)
  playTone(523.25, 0.0, 0.14, 'triangle', 0.11);
  playTone(659.25, 0.06, 0.16, 'triangle', 0.12);
  playTone(783.99, 0.12, 0.22, 'sine', 0.14);
  playTone(1046.5, 0.18, 0.32, 'sine', 0.12);
}

export function playCorrectSound(streakCount = 1, isReinforcement = false, enabled = true) {
  if (!enabled) return;
  // Scale pitch subtly upward with consecutive streak for extra reward
  const semitoneBoost = Math.min(streakCount - 1, 7);
  const mult = Math.pow(2, semitoneBoost / 12);
  if (isReinforcement) {
    // Sparkling 4-note resolution for locking in a reinforced concept
    playTone(587.33 * mult, 0.0, 0.12, 'triangle', 0.13);
    playTone(739.99 * mult, 0.055, 0.14, 'triangle', 0.13);
    playTone(880.0 * mult, 0.11, 0.18, 'sine', 0.15);
    playTone(1174.66 * mult, 0.17, 0.34, 'sine', 0.16);
  } else {
    // Bright rewarding two-plus-overtone chime
    playTone(523.25 * mult, 0.0, 0.13, 'triangle', 0.14);
    playTone(659.25 * mult, 0.06, 0.16, 'triangle', 0.14);
    playTone(783.99 * mult, 0.12, 0.28, 'sine', 0.16);
    if (streakCount >= 3) {
      playTone(1046.5 * mult, 0.17, 0.32, 'sine', 0.13);
    }
  }
}

export function playWrongSound(enabled = true) {
  if (!enabled) return;
  // Warm, non-harsh descending two-note cue
  playTone(311.13, 0.0, 0.16, 'triangle', 0.12, 293.66);
  playTone(233.08, 0.11, 0.26, 'triangle', 0.11, 207.65);
}

export function playStepSound(enabled = true) {
  if (!enabled) return;
  playTone(440, 0.0, 0.07, 'sine', 0.07, 587.33);
}

export function playHintSound(enabled = true) {
  if (!enabled) return;
  playTone(659.25, 0.0, 0.09, 'sine', 0.08);
  playTone(880.0, 0.05, 0.15, 'sine', 0.09);
}

export function playVictoryFanfare(enabled = true) {
  if (!enabled) return;
  // Celebratory arpeggio + sustained major chord
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
  notes.forEach((n, idx) => {
    playTone(n, idx * 0.07, idx === notes.length - 1 ? 0.55 : 0.22, 'triangle', 0.14);
  });
  playTone(523.25, 0.35, 0.6, 'sine', 0.09);
  playTone(783.99, 0.35, 0.6, 'sine', 0.09);
}

export function playMemoryLockChime(enabled = true) {
  if (!enabled) return;
  // Resonant 3-note harmonic lock (F#5 -> A#5 -> C#6)
  playTone(739.99, 0.0, 0.12, 'triangle', 0.14);
  playTone(932.33, 0.06, 0.16, 'triangle', 0.14);
  playTone(1108.73, 0.12, 0.35, 'sine', 0.16);
}

function shuffleQuestionOptions(q: QuizQuestion, salt: number): QuizQuestion {
  if (q.orderedSlot) return q; // Keep the shared bank stable while filling a sentence.
  const correctText = q.options[q.correctIndex];
  const indexed = q.options.map((opt, idx) => ({
    opt,
    sortKey: Math.sin((idx + 1) * 9999 + salt * 7919 + q.id.length * 131),
  }));
  indexed.sort((a, b) => a.sortKey - b.sortKey);
  const newOptions = indexed.map(x => x.opt);
  return {
    ...q,
    options: newOptions,
    correctIndex: Math.max(0, newOptions.indexOf(correctText)),
  };
}

export function ReinforcementQuizModal({
  lesson,
  onClose,
  onJumpToChapter,
  embedded = false,
  hideHeader = false,
  quizState: externalState,
  setQuizState: externalSetState,
}: ReinforcementQuizModalProps) {
  const {compact,landscape} = useCompactLayout();
  const [feedbackDetail,setFeedbackDetail] = useState<'explanation'|'takeaway'>('explanation');
  const [completionView,setCompletionView] = useState<'summary'|'review'>('summary');
  const [breakdownPage,setBreakdownPage] = useState(0);
  const [internalState, setInternalState] = useState<QuizProgressState>(() => createInitialQuizState(lesson));
  const state = externalState ?? internalState;
  const setState = externalSetState ?? setInternalState;
  const challengeActive = isChallenge(state);
  const challenge = challengeActive ? state.challenge : undefined;
  const [challengeSaveFailed, setChallengeSaveFailed] = useState(false);
  useEffect(() => {
    if (state.challenge) setChallengeSaveFailed(!saveChallenge(state));
  }, [state.challenge, state.queue, state.cursor, state.selectedOption, state.completed, state.recalledItems, state.isHardMode, state.rapidScan]);

  // Reset internal state only if lesson.id changes and we're using internal state
  useEffect(() => {
    if (!externalState && internalState.lessonId !== lesson.id) {
      setInternalState(createInitialQuizState(lesson, internalState.soundEnabled));
    }
  }, [lesson, externalState, internalState.lessonId, internalState.soundEnabled]);

  const {
    baseQuestions,
    queue,
    cursor,
    reinforcementQueue,
    round,
    selectedOption,
    showHint,
    soundEnabled,
    masteredIds,
    everMissedIds,
    attemptsByQuestion,
    historyByQuestion = {},
    viewingQuestionId = null,
    activeSetIndex,
    streak,
    bestStreak,
    totalSubmissions,
    completed,
    setCompleted,
    isHardMode: chosenHardMode,
    rapidScan,
    memoryLocked,
    typedInput,
    isVerifyingSemantic,
    typedFeedback,
    recalledItems,
    multiItemRevealed,
  } = state;
  const requiredTyping = challengeRequiresTyping(state);
  const isHardMode = chosenHardMode || requiredTyping;

  const sets = useMemo(() => getQuizSets(baseQuestions), [baseQuestions]);
  const currentSetIdx = activeSetIndex !== undefined ? activeSetIndex : (sets.length > 1 ? 0 : -1);
  const activeSet = currentSetIdx >= 0 && currentSetIdx < sets.length ? sets[currentSetIdx] : undefined;

  const displayQuestions = useMemo(() => {
    if (activeSet) {
      return activeSet.questions;
    }
    return baseQuestions;
  }, [activeSet, baseQuestions]);

  const liveCard = queue[cursor] as ActiveCard | undefined;
  const isReviewing = Boolean(
    viewingQuestionId && (!liveCard || viewingQuestionId !== liveCard.id)
  );

  const reviewingQuestion = isReviewing
    ? baseQuestions.find(q => q.id === viewingQuestionId)
    : undefined;

  const currentCard: ActiveCard | undefined = isReviewing && reviewingQuestion
    ? {
        ...reviewingQuestion,
        roundNumber: 1,
        attemptNumber: attemptsByQuestion[reviewingQuestion.id] || 1,
        isReinforcement: everMissedIds.includes(reviewingQuestion.id),
      }
    : liveCard;

  const challengeCard = currentCard ? challenge?.cards[currentCard.id] : undefined;
  const challengeAward = !isReviewing && currentCard && challenge?.lastAward?.questionId === currentCard.id ? challenge.lastAward : undefined;
  const verification = useRef({key: '', epoch: 0});
  const verificationKey = `${activeSetIndex}:${challenge?.id || ''}:${currentCard?.id}:${currentCard?.attemptNumber}:${isHardMode}:${viewingQuestionId}`;
  if (verification.current.key !== verificationKey) {verification.current = {key: verificationKey, epoch: verification.current.epoch + 1};}
  useEffect(() => {
    // An answer check belongs to one card/mode only. Leaving it also releases
    // the busy state; the epoch guard discards its eventual network response.
    setState(prev => prev.isVerifyingSemantic ? {...prev, isVerifyingSemantic: false} : prev);
  }, [verificationKey, setState]);
  useEffect(() => () => {verification.current.epoch++;}, []);

  const commitChallengeAnswer = (correct: boolean, details: {
    selectedOption: number; typedFeedback?: QuizProgressState['typedFeedback']; recalledItems?: string[]; revealed?: boolean; trap?: string;
  }) => {
    if (!challengeActive || !currentCard || isReviewing) return false;
    const runId = challenge!.id;
    if (correct) playCorrectSound(challenge!.helpUsed ? 1 : streak + 1, currentCard.isReinforcement, soundEnabled);
    else playWrongSound(soundEnabled);
    setState(prev => answerChallenge(prev, {runId, questionId: currentCard.id, attemptNumber: currentCard.attemptNumber, correct, ...details}));
    return true;
  };

  const masteredSet = useMemo(() => new Set(masteredIds), [masteredIds]);
  const everMissedSet = useMemo(() => new Set(everMissedIds), [everMissedIds]);

  const cardHistory = currentCard ? historyByQuestion[currentCard.id] : null;
  const isCardMastered = currentCard ? masteredSet.has(currentCard.id) : false;
  const isCardAnswered = Boolean(cardHistory || isCardMastered);

  const effectiveSelectedOption = isReviewing
    ? (cardHistory?.selectedOption ?? (isCardMastered ? currentCard?.correctIndex ?? null : null))
    : selectedOption;

  const isAnswered = isReviewing ? isCardAnswered : selectedOption !== null;
  const isCorrect = isAnswered && currentCard && effectiveSelectedOption === currentCard.correctIndex;
  const orderedUsedAnswers = new Set(currentCard?.orderedSlot?.answers.filter((_,i) => i < currentCard.orderedSlot!.index && historyByQuestion[currentCard.orderedSlot!.slotIds[i]]) || []);


  const effectiveTypedFeedback = isReviewing
    ? (cardHistory?.typedFeedback ?? (isCardMastered && currentCard ? { status: 'correct' as const, userText: currentCard.options[currentCard.correctIndex] } : null))
    : typedFeedback;

  const effectiveRecalledItems = isReviewing
    ? (cardHistory?.recalledItems ?? (isCardMastered && currentCard ? (currentCard.expectedItems || []) : []))
    : recalledItems;

  const effectiveMultiItemRevealed = isReviewing
    ? Boolean(cardHistory?.multiItemRevealed)
    : multiItemRevealed;

  const currentReviewIdx = currentCard ? displayQuestions.findIndex(q => q.id === currentCard.id) : -1;
  const hasPrevReviewQ = currentReviewIdx > 0;
  const hasNextReviewQ = currentReviewIdx >= 0 && currentReviewIdx + 1 < displayQuestions.length;
  const prevReviewQ = hasPrevReviewQ ? displayQuestions[currentReviewIdx - 1] : null;
  const nextReviewQ = hasNextReviewQ ? displayQuestions[currentReviewIdx + 1] : null;

  const typedInputRef = useRef<HTMLInputElement>(null);

  // Automatically focus the text box in Hard Mode on question start and whenever advancing with Enter
  useEffect(() => {
    if (isHardMode && !isAnswered && !isReviewing && !completed && !setCompleted && currentCard) {
      const timer = setTimeout(() => {
        typedInputRef.current?.focus();
        typedInputRef.current?.select();
      }, 35);
      return () => clearTimeout(timer);
    }
  }, [isHardMode, isAnswered, isReviewing, cursor, completed, setCompleted, currentCard?.id]);

  const currentQGlobalIndex = currentCard
    ? baseQuestions.findIndex(q => q.id === currentCard.id) + 1
    : 1;
  const liveQGlobalIndex = liveCard
    ? baseQuestions.findIndex(q => q.id === liveCard.id) + 1
    : 1;

  const resumeLive = () => {
    setState(prev => ({
      ...prev,
      viewingQuestionId: null,
    }));
    playStepSound(soundEnabled);
  };

  const jumpToQuestion = (qId: string) => {
    setState(prev => {
      const isLive = prev.queue[prev.cursor]?.id === qId;
      return {
        ...prev,
        viewingQuestionId: isLive ? null : qId,
      };
    });
    playStepSound(soundEnabled);
  };

  const goToAdjacentQuestion = (delta: number) => {
    if (!currentCard) return;
    const currentIdx = displayQuestions.findIndex(q => q.id === currentCard.id);
    const targetIdx = currentIdx + delta;
    if (targetIdx >= 0 && targetIdx < displayQuestions.length) {
      const targetQ = displayQuestions[targetIdx];
      if (targetQ.id === liveCard?.id && !completed && !setCompleted) {
        setState(prev => ({ ...prev, viewingQuestionId: null }));
      } else {
        setState(prev => ({ ...prev, viewingQuestionId: targetQ.id }));
      }
      playStepSound(soundEnabled);
    }
  };

  const onSelectSet = (targetSetIdx: number) => {
    const seed = Date.now();
    playStepSound(soundEnabled);
    setState(prev => selectQuizSet(prev, targetSetIdx, seed));
  };

  const replaySet = (setIdx: number) => {
    playQuizStartSound(soundEnabled);
    const setQuestions =
      setIdx >= 0 && setIdx < sets.length ? sets[setIdx].questions : baseQuestions;
    const freshQueue: ActiveCard[] = setQuestions.map((q, idx) => ({
      ...shuffleQuestionOptions(q, Date.now() + idx),
      roundNumber: 1,
      attemptNumber: 1,
      isReinforcement: false,
    }));
    setState(prev => ({
      ...prev,
      activeSetIndex: setIdx,
      queue: freshQueue,
      reinforcementQueue: [],
      cursor: 0,
      round: 1,
      selectedOption: null,
      showHint: false,
      memoryLocked: false,
      typedInput: '',
      typedFeedback: null,
      recalledItems: [],
      multiItemRevealed: false,
      viewingQuestionId: null,
      setCompleted: false,
      completed: false,
      masteredIds: prev.masteredIds.filter(id => !setQuestions.some(sq => sq.id === id)),
    }));
  };

  const handleLockInMemory = () => {
    if (memoryLocked) return;
    playMemoryLockChime(soundEnabled);
    setState(prev => ({
      ...prev,
      memoryLocked: true,
    }));
  };

  const normalizeAnswer = (text: string): string => {
    return (text || '')
      .toLowerCase()
      .replace(/^(the|a|an)\s+/i, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const matchesSingleAnswer = (userText: string, card: ActiveCard): { hit: boolean; matched?: string } => {
    const normUser = normalizeAnswer(userText);
    if (!normUser) return { hit: false };

    if (card.acceptedAnswers && card.acceptedAnswers.length > 0) {
      for (const ans of card.acceptedAnswers) {
        const normAns = normalizeAnswer(ans);
        if (!normAns) continue;
        if (normUser === normAns) return { hit: true, matched: ans };
        if (normUser.length >= 3 && normAns.includes(normUser)) return { hit: true, matched: ans };
        if (normAns.length >= 3 && normUser.includes(normAns)) return { hit: true, matched: ans };
      }
    }

    const correctOpt = card.options[card.correctIndex] || '';
    const normOpt = normalizeAnswer(correctOpt);
    if (normUser === normOpt) return { hit: true, matched: correctOpt };
    if (normOpt.length <= 40 && (normOpt.includes(normUser) || normUser.includes(normOpt))) {
      return { hit: true, matched: correctOpt };
    }

    return { hit: false };
  };

  const submitAnswer = (optionIdx: number) => {
    if (selectedOption !== null || !currentCard || isReviewing) return;
    if (orderedUsedAnswers.has(currentCard.options[optionIdx])) return;
    const nextAttemptCount = (attemptsByQuestion[currentCard.id] || 0) + 1;
    const isHit = optionIdx === currentCard.correctIndex;
    if (commitChallengeAnswer(isHit, {selectedOption: optionIdx, trap: currentCard.options[optionIdx]})) return;
    const historyEntry = {
      selectedOption: optionIdx,
      typedFeedback: null,
      recalledItems: [],
      multiItemRevealed: false,
      isCorrect: isHit,
    };

    if (isHit) {
      const nextStreak = streak + 1;
      playCorrectSound(nextStreak, currentCard.isReinforcement || Boolean(currentCard.isSpacedRecall), soundEnabled);
      setState(prev => ({
        ...prev,
        selectedOption: optionIdx,
        historyByQuestion: {
          ...prev.historyByQuestion,
          [currentCard.id]: historyEntry,
        },
        totalSubmissions: prev.totalSubmissions + 1,
        attemptsByQuestion: { ...prev.attemptsByQuestion, [currentCard.id]: nextAttemptCount },
        masteredIds: prev.masteredIds.includes(currentCard.id)
          ? prev.masteredIds
          : [...prev.masteredIds, currentCard.id],
        reinforcementQueue: prev.reinforcementQueue.filter(rc => rc.id !== currentCard.id),
        streak: nextStreak,
        bestStreak: Math.max(prev.bestStreak, nextStreak),
      }));
    } else {
      playWrongSound(soundEnabled);
      const reshuffled = shuffleQuestionOptions(currentCard, totalSubmissions + round + cursor + 1);
      const priorTrap = currentCard.options[optionIdx] || '';

      const retryCard: ActiveCard = {
        ...reshuffled,
        roundNumber: currentCard.roundNumber,
        attemptNumber: nextAttemptCount + 1,
        isReinforcement: true,
        isSpacedRecall: true,
        priorTrapOptionText: priorTrap,
      };

      // 3-Card Short-Horizon Spaced Recall: re-enters queue exactly 3 cards later
      setState(prev => {
        const insertPos = orderedSafeInsertion(prev.queue, prev.cursor + 3);
        const nextQueue = [
          ...prev.queue.slice(0, insertPos),
          retryCard,
          ...prev.queue.slice(insertPos),
        ];
        return {
          ...prev,
          queue: nextQueue,
          selectedOption: optionIdx,
          historyByQuestion: {
            ...prev.historyByQuestion,
            [currentCard.id]: historyEntry,
          },
          totalSubmissions: prev.totalSubmissions + 1,
          attemptsByQuestion: { ...prev.attemptsByQuestion, [currentCard.id]: nextAttemptCount },
          streak: 0,
          everMissedIds: prev.everMissedIds.includes(currentCard.id)
            ? prev.everMissedIds
            : [...prev.everMissedIds, currentCard.id],
          reinforcementQueue: [
            ...prev.reinforcementQueue,
            retryCard,
          ],
        };
      });
    }
  };

  const applyTypedResult = (
    isHit: boolean,
    rawInput: string,
    matchedText: string | undefined,
    nextAttemptCount: number,
    expected: string,
    semantic = false,
    feedback?: string
  ) => {
    if (!currentCard) return;
    if (commitChallengeAnswer(isHit, {selectedOption: isHit ? currentCard.correctIndex : -1,
      typedFeedback: isHit ? {status: 'correct', userText: rawInput, matchedText: matchedText || expected, semantic, feedback}
        : {status: 'wrong', userText: rawInput, matchedText: expected, semantic: false, feedback}, trap: rawInput})) return;
    const historyEntry = {
      selectedOption: isHit ? currentCard.correctIndex : -1,
      typedFeedback: isHit
        ? { status: 'correct' as const, userText: rawInput, matchedText: matchedText || expected, semantic, feedback }
        : { status: 'wrong' as const, userText: rawInput, matchedText: expected, semantic: false, feedback },
      recalledItems: [],
      multiItemRevealed: false,
      isCorrect: isHit,
    };

    if (isHit) {
      const nextStreak = streak + 1;
      playCorrectSound(nextStreak, currentCard.isReinforcement || Boolean(currentCard.isSpacedRecall), soundEnabled);
      setState(prev => ({
        ...prev,
        isVerifyingSemantic: false,
        selectedOption: currentCard.correctIndex,
        typedFeedback: { status: 'correct', userText: rawInput, matchedText: matchedText || expected, semantic, feedback },
        historyByQuestion: {
          ...prev.historyByQuestion,
          [currentCard.id]: historyEntry,
        },
        totalSubmissions: prev.totalSubmissions + 1,
        attemptsByQuestion: { ...prev.attemptsByQuestion, [currentCard.id]: nextAttemptCount },
        masteredIds: prev.masteredIds.includes(currentCard.id)
          ? prev.masteredIds
          : [...prev.masteredIds, currentCard.id],
        reinforcementQueue: prev.reinforcementQueue.filter(rc => rc.id !== currentCard.id),
        streak: nextStreak,
        bestStreak: Math.max(prev.bestStreak, nextStreak),
      }));
    } else {
      playWrongSound(soundEnabled);
      const reshuffled = shuffleQuestionOptions(currentCard, totalSubmissions + round + cursor + 1);

      const retryCard: ActiveCard = {
        ...reshuffled,
        roundNumber: currentCard.roundNumber,
        attemptNumber: nextAttemptCount + 1,
        isReinforcement: true,
        isSpacedRecall: true,
        priorTrapOptionText: rawInput,
      };

      setState(prev => {
        const insertPos = orderedSafeInsertion(prev.queue, prev.cursor + 3);
        const nextQueue = [
          ...prev.queue.slice(0, insertPos),
          retryCard,
          ...prev.queue.slice(insertPos),
        ];
        return {
          ...prev,
          isVerifyingSemantic: false,
          queue: nextQueue,
          selectedOption: -1,
          typedFeedback: { status: 'wrong', userText: rawInput, matchedText: expected, semantic: false, feedback },
          historyByQuestion: {
            ...prev.historyByQuestion,
            [currentCard.id]: historyEntry,
          },
          totalSubmissions: prev.totalSubmissions + 1,
          attemptsByQuestion: { ...prev.attemptsByQuestion, [currentCard.id]: nextAttemptCount },
          streak: 0,
          everMissedIds: prev.everMissedIds.includes(currentCard.id)
            ? prev.everMissedIds
            : [...prev.everMissedIds, currentCard.id],
          reinforcementQueue: [
            ...prev.reinforcementQueue,
            retryCard,
          ],
        };
      });
    }
  };

  const submitTypedAnswer = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isAnswered || !currentCard || isReviewing || state.isVerifyingSemantic) return;
    const rawInput = typedInput.trim();
    if (!rawInput) return;

    // 1. Tier 0: Fast Instant Local Heuristic
    const result = matchesSingleAnswer(rawInput, currentCard);
    const nextAttemptCount = (attemptsByQuestion[currentCard.id] || 0) + 1;
    const expected = currentCard.acceptedAnswers?.[0] || currentCard.options[currentCard.correctIndex];

    if (result.hit) {
      applyTypedResult(true, rawInput, result.matched, nextAttemptCount, expected, false);
      return;
    }

    // 2. Tier 1: Sub-second Server LLM Semantic Verification (OpenRouter Free / OpenCode Go)
    const requestEpoch = ++verification.current.epoch;
    setState(prev => ({ ...prev, isVerifyingSemantic: true }));
    try {
      const resp = await fetch('/api/visual/live/verify-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: currentCard.prompt,
          expected,
          userAnswer: rawInput,
          acceptedAnswers: currentCard.acceptedAnswers || [],
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (verification.current.epoch !== requestEpoch) return;
        if (data && data.correct) {
          applyTypedResult(true, rawInput, expected, nextAttemptCount, expected, true, data.feedback);
          return;
        } else if (data && data.correct === false) {
          applyTypedResult(false, rawInput, undefined, nextAttemptCount, expected, false, data.feedback);
          return;
        }
      }
    } catch {
      // Ignore network errors and fall back to local result
    } finally {
      if (verification.current.epoch === requestEpoch) setState(prev => ({ ...prev, isVerifyingSemantic: false }));
    }

    // Fallback if network failed or server unreachable: mark as incorrect
    if (verification.current.epoch === requestEpoch) applyTypedResult(false, rawInput, undefined, nextAttemptCount, expected, false);
  };

  const submitMultiItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isAnswered || !currentCard || currentCard.kind !== 'multi_item' || isReviewing) return;
    const rawInput = typedInput.trim();
    if (!rawInput) return;
    const normInput = normalizeAnswer(rawInput);
    const expectedList = currentCard.expectedItems || [];

    let matchedItem: string | null = null;
    for (const item of expectedList) {
      if (recalledItems.includes(item)) continue;
      const aliases = currentCard.itemAliases?.[item] || [item];
      for (const a of aliases) {
        const normA = normalizeAnswer(a);
        if (
          normInput === normA ||
          (normInput.length >= 4 && normA.includes(normInput)) ||
          (normA.length >= 4 && normInput.includes(normA))
        ) {
          matchedItem = item;
          break;
        }
      }
      if (matchedItem) break;
    }

    if (matchedItem) {
      const nextRecalled = [...recalledItems, matchedItem];
      playStepSound(soundEnabled);
      if (nextRecalled.length === expectedList.length) {
        if (commitChallengeAnswer(true, {selectedOption: currentCard.correctIndex, recalledItems: nextRecalled,
          typedFeedback: {status: 'correct', userText: `All ${expectedList.length} items recalled!`, matchedText: matchedItem!}})) return;
        const nextAttemptCount = (attemptsByQuestion[currentCard.id] || 0) + 1;
        const nextStreak = streak + 1;
        playCorrectSound(nextStreak, currentCard.isReinforcement, soundEnabled);
        const historyEntry = {
          selectedOption: currentCard.correctIndex,
          typedFeedback: {
            status: 'correct' as const,
            userText: `All ${expectedList.length} items recalled!`,
            matchedText: matchedItem!,
          },
          recalledItems: nextRecalled,
          multiItemRevealed: false,
          isCorrect: true,
        };
        setState(prev => ({
          ...prev,
          typedInput: '',
          recalledItems: nextRecalled,
          selectedOption: currentCard.correctIndex,
          typedFeedback: {
            status: 'correct',
            userText: `All ${expectedList.length} items recalled!`,
            matchedText: matchedItem!,
          },
          historyByQuestion: {
            ...prev.historyByQuestion,
            [currentCard.id]: historyEntry,
          },
          totalSubmissions: prev.totalSubmissions + 1,
          attemptsByQuestion: { ...prev.attemptsByQuestion, [currentCard.id]: nextAttemptCount },
          masteredIds: prev.masteredIds.includes(currentCard.id)
            ? prev.masteredIds
            : [...prev.masteredIds, currentCard.id],
          streak: nextStreak,
          bestStreak: Math.max(prev.bestStreak, nextStreak),
        }));
      } else {
        setState(prev => ({
          ...prev,
          typedInput: '',
          recalledItems: nextRecalled,
        }));
      }
    } else {
      playWrongSound(soundEnabled);
      if (challengeActive) setState(prev => challengeHelp(prev, true));
    }
  };

  const giveUpMultiItem = () => {
    if (isAnswered || !currentCard || isReviewing) return;
    if (commitChallengeAnswer(false, {selectedOption: -1, recalledItems, revealed: true, trap: 'Incomplete recall'})) return;
    const nextAttemptCount = (attemptsByQuestion[currentCard.id] || 0) + 1;
    playWrongSound(soundEnabled);
    const reshuffled = shuffleQuestionOptions(currentCard, totalSubmissions + round + cursor + 1);

    const retryCard: ActiveCard = {
      ...reshuffled,
      roundNumber: currentCard.roundNumber,
      attemptNumber: nextAttemptCount + 1,
      isReinforcement: true,
      isSpacedRecall: true,
      priorTrapOptionText: 'Incomplete recall',
    };

    const historyEntry = {
      selectedOption: -1,
      typedFeedback: null,
      recalledItems,
      multiItemRevealed: true,
      isCorrect: false,
    };

    setState(prev => {
      const insertPos = orderedSafeInsertion(prev.queue, prev.cursor + 3);
      const nextQueue = [
        ...prev.queue.slice(0, insertPos),
        retryCard,
        ...prev.queue.slice(insertPos),
      ];
      return {
        ...prev,
        queue: nextQueue,
        selectedOption: -1,
        multiItemRevealed: true,
        historyByQuestion: {
          ...prev.historyByQuestion,
          [currentCard.id]: historyEntry,
        },
        totalSubmissions: prev.totalSubmissions + 1,
        attemptsByQuestion: { ...prev.attemptsByQuestion, [currentCard.id]: nextAttemptCount },
        streak: 0,
        everMissedIds: prev.everMissedIds.includes(currentCard.id)
          ? prev.everMissedIds
          : [...prev.everMissedIds, currentCard.id],
        reinforcementQueue: [
          ...prev.reinforcementQueue,
          retryCard,
        ],
      };
    });
  };

  const advanceNext = () => {
    if (isReviewing) {
      if (hasNextReviewQ) {
        goToAdjacentQuestion(1);
      } else if (liveCard && !completed && !setCompleted) {
        resumeLive();
      } else {
        setState(prev => ({ ...prev, viewingQuestionId: null }));
      }
      return;
    }

    if (!isAnswered) return;
    if (challengeActive) {
      if (queue.length <= 1 && !challenge!.outOfHearts) playVictoryFanfare(soundEnabled); else playStepSound(soundEnabled);
      setState(advanceChallenge);
      return;
    }

    if (cursor + 1 < queue.length) {
      playStepSound(soundEnabled);
      setState(prev => ({
        ...prev,
        selectedOption: null,
        showHint: false,
        memoryLocked: false,
        typedInput: '',
        typedFeedback: null,
        recalledItems: [],
        multiItemRevealed: false,
        cursor: prev.cursor + 1,
        viewingQuestionId: null,
      }));
      return;
    }

    // End of current round queue — check if any missed questions need reinforcement
    if (reinforcementQueue.length > 0) {
      playQuizStartSound(soundEnabled);
      setState(prev => ({
        ...prev,
        selectedOption: null,
        showHint: false,
        memoryLocked: false,
        typedInput: '',
        typedFeedback: null,
        recalledItems: [],
        multiItemRevealed: false,
        queue: prev.reinforcementQueue,
        reinforcementQueue: [],
        cursor: 0,
        round: prev.round + 1,
        viewingQuestionId: null,
      }));
    } else {
      const nextMastered = new Set(masteredIds);
      const allLessonMastered = baseQuestions.every(q => nextMastered.has(q.id));

      playVictoryFanfare(soundEnabled);
      if (allLessonMastered) {
        setState(prev => ({
          ...prev,
          selectedOption: null,
          showHint: false,
          memoryLocked: false,
          typedInput: '',
          typedFeedback: null,
          recalledItems: [],
          multiItemRevealed: false,
          viewingQuestionId: null,
          setCompleted: true,
          completed: true,
        }));
      } else {
        setState(prev => ({
          ...prev,
          selectedOption: null,
          showHint: false,
          memoryLocked: false,
          typedInput: '',
          typedFeedback: null,
          recalledItems: [],
          multiItemRevealed: false,
          viewingQuestionId: null,
          setCompleted: true,
        }));
      }
    }
  };

  const restartQuiz = (missedOnly = false, hardMode?: boolean) => {
    const nextHardMode = hardMode !== undefined ? hardMode : isHardMode;
    playQuizStartSound(soundEnabled);
    if (challengeActive) {
      const seed = Date.now();
      setState(prev => startChallenge({...prev, isHardMode: nextHardMode}, seed));
      return;
    }
    const source =
      missedOnly && everMissedSet.size > 0
        ? displayQuestions.filter(q => everMissedSet.has(q.id))
        : displayQuestions;
    const freshQueue = source.map((q, idx) => ({
      ...shuffleQuestionOptions(q, Date.now() + idx),
      roundNumber: 1,
      attemptNumber: 1,
      isReinforcement: missedOnly,
    }));
    setState(prev => ({
      ...prev,
      isHardMode: nextHardMode,
      queue: freshQueue,
      reinforcementQueue: [],
      cursor: 0,
      round: 1,
      selectedOption: null,
      showHint: false,
      memoryLocked: false,
      typedInput: '',
      typedFeedback: null,
      recalledItems: [],
      multiItemRevealed: false,
      masteredIds: missedOnly ? prev.masteredIds : prev.masteredIds.filter(id => !displayQuestions.some(dq => dq.id === id)),
      everMissedIds: missedOnly ? prev.everMissedIds : [],
      attemptsByQuestion: missedOnly ? prev.attemptsByQuestion : {},
      streak: 0,
      totalSubmissions: 0,
      completed: false,
      setCompleted: false,
      viewingQuestionId: null,
    }));
  };

  useEffect(() => {
    const next = queue[cursor + 1];
    if (!isReviewing && isAnswered && isCorrect && !challenge?.outOfHearts && currentCard?.orderedSlot &&
      next?.orderedSlot?.groupId === currentCard.orderedSlot.groupId && next.orderedSlot.index === currentCard.orderedSlot.index + 1) {
      const timer = setTimeout(advanceNext, 850);
      return () => clearTimeout(timer);
    }
  }, [currentCard?.id, selectedOption, isReviewing, isCorrect, challenge?.outOfHearts]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('textarea,select,[contenteditable="true"],input:not([type="range"])')) return;
      if (e.key === 'Escape') {
        if (isReviewing) {
          e.preventDefault();
          resumeLive();
          return;
        }
        if (!embedded) {
          e.preventDefault();
          onClose();
          return;
        }
      }
      if (isReviewing) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          goToAdjacentQuestion(-1);
        } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
          e.preventDefault();
          goToAdjacentQuestion(1);
        }
        return;
      }
      if (completed || setCompleted || !currentCard) return;
      if (!isAnswered && !isHardMode) {
        const numIdx = '1234567890'.indexOf(e.key.length === 1 ? e.key : '!');
        const letterIdx = 'abcdefghij'.indexOf(e.key.length === 1 ? e.key.toLowerCase() : '!');
        const idx = numIdx !== -1 ? numIdx : letterIdx;
        if (idx >= 0 && idx < currentCard.options.length) {
          e.preventDefault();
          submitAnswer(idx);
        }
      } else if (isAnswered) {
        if (!isCorrect && (e.key === 'l' || e.key === 'L')) {
          e.preventDefault();
          handleLockInMemory();
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          advanceNext();
          if (isHardMode) {
            setTimeout(() => {
              typedInputRef.current?.focus();
            }, 40);
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!baseQuestions.length) {
    return null;
  }

  const totalCount = baseQuestions.length;
  const firstTryPerfectCount = baseQuestions.filter(q => !everMissedSet.has(q.id) && masteredSet.has(q.id)).length;
  const firstTryAccuracy = Math.round((firstTryPerfectCount / Math.max(1, totalCount)) * 100);

  const setFirstTryCount = displayQuestions.filter(q => !everMissedSet.has(q.id) && masteredSet.has(q.id)).length;
  const setFirstTryAccuracy = Math.round((setFirstTryCount / Math.max(1, displayQuestions.length)) * 100);
  const setReinforcedCount = displayQuestions.filter(q => everMissedSet.has(q.id) && masteredSet.has(q.id)).length;

  const kindLabel = (kind: QuizQuestion['kind']) => {
    if (kind === 'ordered_cloze') return 'Ordered recall';
    if (kind === 'mechanism') return 'Visual Mechanism';
    if (kind === 'safeguard') return 'Misreading Safeguard';
    if (kind === 'multi_item') return 'Multi-Item Recall';
    return 'Core Inference';
  };

  const breakdownQuestions = completed ? baseQuestions : displayQuestions;
  const challengeFirstTries = challenge ? Object.values(challenge.cards).filter(c => c.firstTryClean).length : 0;
  const challengeRecovered = challenge ? Object.values(challenge.cards).filter(c => c.needsRecovery && c.secured).length : 0;
  const breakdownSize = landscape ? 1 : 2;
  const breakdownCount = Math.max(1,Math.ceil(breakdownQuestions.length/breakdownSize));
  const safeBreakdownPage = Math.min(breakdownPage,breakdownCount-1);
  const visibleBreakdown = compact ? breakdownQuestions.slice(safeBreakdownPage*breakdownSize,(safeBreakdownPage+1)*breakdownSize) : breakdownQuestions;
  const completionNavigation = compact&&<nav className="mobile-completion-tabs" aria-label="Quiz results"><button type="button" aria-pressed={completionView==='summary'} onClick={()=>setCompletionView('summary')}>Summary</button><button type="button" aria-pressed={completionView==='review'} onClick={()=>setCompletionView('review')}>Concept review</button></nav>;
  const breakdownNavigation = compact&&<nav className="mobile-breakdown-pages" aria-label="Concept review pages"><button type="button" disabled={safeBreakdownPage===0} onClick={()=>setBreakdownPage(safeBreakdownPage-1)}>← Previous</button><span>{safeBreakdownPage+1}/{breakdownCount}</span><button type="button" disabled={safeBreakdownPage+1>=breakdownCount} onClick={()=>setBreakdownPage(safeBreakdownPage+1)}>Next →</button></nav>;

  const content = (
    <div className={`mastery-quiz-modal ${embedded ? 'embedded-stage' : ''} ${currentCard?.orderedSlot ? 'ordered-recall-card' : ''}`} data-mobile-answered={compact&&isAnswered}>
      {!hideHeader && (
        <ReinforcementQuizNavbar
          lesson={lesson}
          quizState={state}
          setQuizState={setState}
          onClose={onClose}
          showCloseButton={!embedded}
        />
      )}

      {/* Main Body */}
      {completed && !isReviewing ? (
        <div className="mastery-completion-body" data-mobile-view={completionView}>{completionNavigation}
          <div className="mastery-trophy-hero">
            <div className="mastery-trophy-ring">
              <Trophy size={36} />
            </div>
            <span className="mastery-kicker">
              {challenge ? challenge.outOfHearts ? 'ALL QUESTIONS · OUT OF HEARTS' : 'ALL QUESTIONS · CHALLENGE COMPLETE' : isHardMode ? 'HARD MODE 100% MASTERY VERIFIED' : '100% MASTERY VERIFIED'}
            </span>
            <h3>{challenge ? `${challenge.score.toLocaleString()} points!` : isHardMode ? 'Hard Mode Conquered!' : 'Perfect Score Achieved!'}</h3>
            <p>
              {challenge ? challenge.outOfHearts ? 'Your score is saved. Start a fresh challenge with five hearts, or switch to a practice set to work on the difficult cards.' : `All cards secured. ${challengeRecovered} weak spot${challengeRecovered === 1 ? '' : 's'} recovered through repeated clean recall.` : isHardMode
                ? 'Flawless active recall! You typed the answers and recalled multi-item rows with zero multiple-choice prompts.'
                : everMissedSet.size === 0
                  ? 'Flawless run! You answered every single concept and visual mechanism question correctly on the first pass.'
                  : `You reinforced and mastered all ${everMissedSet.size} missed concept${
                      everMissedSet.size > 1 ? 's' : ''
                    } across ${round} rounds until zero gaps remained.`}
            </p>
          </div>

          <div className="mastery-metrics-grid">
            {challenge ? <>
              <div className="mastery-metric-card"><span>RUN SCORE</span><strong>{challenge.score.toLocaleString()}</strong><small>Personal best: {challenge.personalBest.toLocaleString()}</small></div>
              <div className="mastery-metric-card"><span>BEST COMBO</span><strong>{challenge.bestMultiplier}×</strong><small>{bestStreak} clean answers in a row</small></div>
              <div className="mastery-metric-card"><span>CLEAN FIRST TRIES</span><strong>{Math.round(challengeFirstTries / Math.max(1, totalCount) * 100)}%</strong><small>{challengeFirstTries} of {totalCount} cards</small></div>
              <div className="mastery-metric-card"><span>WEAK SPOTS RECOVERED</span><strong>{challengeRecovered}</strong><small>{totalSubmissions} answers this run</small></div>
            </> : <>
            <div className="mastery-metric-card">
              <span>FIRST-TRY ACCURACY</span>
              <strong>{firstTryAccuracy}%</strong>
              <small>
                {firstTryPerfectCount} of {totalCount} on 1st attempt
              </small>
            </div>
            <div className="mastery-metric-card">
              <span>REINFORCED ITEMS</span>
              <strong>{everMissedSet.size}</strong>
              <small>Repeated until 100% correct</small>
            </div>
            <div className="mastery-metric-card">
              <span>ROUNDS TO MASTERY</span>
              <strong>{round}</strong>
              <small>{totalSubmissions} total answers submitted</small>
            </div>
            <div className="mastery-metric-card">
              <span>BEST STREAK</span>
              <strong>{bestStreak}</strong>
              <small>Consecutive right answers</small>
            </div>
            </>}
          </div>

          <div className="mastery-breakdown-list">
            <h4>CONCEPT MASTERY BREAKDOWN</h4>{breakdownNavigation}
            <div className="mastery-breakdown-scroll">
              {visibleBreakdown.map((q, idx) => {
                const tries = attemptsByQuestion[q.id] || 1;
                const reinforced = everMissedSet.has(q.id);
                return (
                  <div key={q.id} className="mastery-breakdown-row">
                    <div className="mastery-breakdown-left">
                      <span className="mastery-q-index">Q{idx + 1}</span>
                      <div>
                        <strong>{q.prompt}</strong>
                        <small>{q.chapterTitle} · {kindLabel(q.kind)}{challenge ? ` · ${challenge.cards[q.id].earned} pts` : ''}</small>
                      </div>
                    </div>
                    <div className="mastery-breakdown-right">
                      <span className={`mastery-status-pill ${reinforced ? 'reinforced' : 'first-try'}`}>
                        {challenge ? challenge.cards[q.id].secured ? challenge.cards[q.id].needsRecovery ? 'Recovered · secured' : 'Clean first try' : challenge.cards[q.id].firstTryClean === null ? 'Not played' : 'Needs practice' : reinforced ? `Reinforced (${tries} tries)` : '1st Try Mastered'}
                      </span>
                      <button
                        type="button"
                        className="mastery-inspect-link"
                        onClick={() => jumpToQuestion(q.id)}
                        title="View this question in review mode"
                      >
                        <Eye size={12} /> View
                      </button>
                      {onJumpToChapter && !currentCard?.source && (
                        <button
                          type="button"
                          className="mastery-inspect-link"
                          onClick={() => {
                            onJumpToChapter(q.chapterIndex);
                            onClose();
                          }}
                        >
                          <Eye size={12} /> Beat {q.chapterIndex + 1}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <footer className="mastery-completion-footer">
            {!challenge && <button type="button" className="mastery-primary-btn" onClick={() => onSelectSet(-1)}><Trophy size={15}/>Play All Questions Challenge</button>}
            <button
              type="button"
              className="mastery-secondary-btn"
              onClick={() => restartQuiz(false, false)}
              title="Play again in multiple-choice mode"
            >
              <RotateCcw size={15} /> Replay Standard Quiz
            </button>
            <button
              type="button"
              className={`mastery-hard-cta-btn ${isHardMode ? 'active' : ''}`}
              onClick={() => restartQuiz(false, true)}
              title="Test true recall by typing your answers"
            >
              <Sparkles size={15} /> {isHardMode ? 'Replay Hard Mode' : 'Hard Mode (Type Answers)'}
            </button>
            {!challenge && everMissedSet.size > 0 && (
              <button
                type="button"
                className="mastery-secondary-btn"
                onClick={() => restartQuiz(true, isHardMode)}
              >
                <Repeat size={15} /> Drill {everMissedSet.size} Missed Only
              </button>
            )}
            <button type="button" className="mastery-primary-btn" onClick={onClose}>
              Return to Visual Lesson <ArrowRight size={15} />
            </button>
          </footer>
        </div>
      ) : setCompleted && !isReviewing && sets.length > 1 && activeSet ? (
        <div className="mastery-completion-body set-completion" data-mobile-view={completionView}>{completionNavigation}
          <div className="mastery-trophy-hero">
            <div className="mastery-trophy-ring">
              <Sparkles size={36} />
            </div>
            <span className="mastery-kicker">
              UNIT {currentSetIdx + 1} OF {sets.length} COMPLETE
            </span>
            <h3>{activeSet.title} Mastered!</h3>
            {activeSet.subtitle && (
              <p className="mastery-set-subtitle" style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: -4, marginBottom: 8 }}>
                {activeSet.subtitle}
              </p>
            )}
            <p>
              You have mastered all {displayQuestions.length} concepts in {activeSet.title}.{' '}
              {currentSetIdx + 1 < sets.length
                ? `Ready to advance to ${sets[currentSetIdx + 1].shortTitle}?`
                : 'All units in this reviewer have been mastered!'}
            </p>
          </div>

          <div className="mastery-metrics-grid">
            <div className="mastery-metric-card">
              <span>UNIT ACCURACY</span>
              <strong>{setFirstTryAccuracy}%</strong>
              <small>{setFirstTryCount} of {displayQuestions.length} on 1st attempt</small>
            </div>
            <div className="mastery-metric-card">
              <span>UNIT REINFORCED</span>
              <strong>{setReinforcedCount}</strong>
              <small>Retried until 100% correct</small>
            </div>
            <div className="mastery-metric-card">
              <span>OVERALL MASTERY</span>
              <strong>{masteredSet.size} / {totalCount}</strong>
              <small>{Math.round((masteredSet.size / Math.max(1, totalCount)) * 100)}% overall</small>
            </div>
            <div className="mastery-metric-card">
              <span>BEST STREAK</span>
              <strong>{bestStreak}</strong>
              <small>Consecutive right answers</small>
            </div>
          </div>

          <div className="mastery-breakdown-list">
            <h4>{activeSet.shortTitle.toUpperCase()} CONCEPT BREAKDOWN</h4>{breakdownNavigation}
            <div className="mastery-breakdown-scroll">
              {visibleBreakdown.map((q, idx) => {
                const tries = attemptsByQuestion[q.id] || 1;
                const reinforced = everMissedSet.has(q.id);
                const globalIdx = baseQuestions.findIndex(bq => bq.id === q.id);
                return (
                  <div key={q.id} className="mastery-breakdown-row">
                    <div className="mastery-breakdown-left">
                      <span className="mastery-q-index">Q{globalIdx !== -1 ? globalIdx + 1 : idx + 1}</span>
                      <div>
                        <strong>{q.prompt}</strong>
                        <small>{q.chapterTitle} · {kindLabel(q.kind)}</small>
                      </div>
                    </div>
                    <div className="mastery-breakdown-right">
                      <span className={`mastery-status-pill ${reinforced ? 'reinforced' : 'first-try'}`}>
                        {reinforced ? `Reinforced (${tries} tries)` : '1st Try Mastered'}
                      </span>
                      <button
                        type="button"
                        className="mastery-inspect-link"
                        onClick={() => jumpToQuestion(q.id)}
                        title="View this question in review mode"
                      >
                        <Eye size={12} /> View
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <footer className="mastery-completion-footer">
            {currentSetIdx + 1 < sets.length ? (
              <button
                type="button"
                className="mastery-primary-btn"
                onClick={() => onSelectSet(currentSetIdx + 1)}
              >
                Continue to {sets[currentSetIdx + 1].shortTitle} ({sets[currentSetIdx + 1].questions.length} Qs) <ArrowRight size={15} />
              </button>
            ) : (
              <button
                type="button"
                className="mastery-primary-btn"
                onClick={() => setState(prev => ({ ...prev, completed: true }))}
              >
                Full Lesson Scorecard <Trophy size={15} />
              </button>
            )}
            {currentSetIdx + 1 === sets.length && <button type="button" className="mastery-secondary-btn" onClick={() => onSelectSet(-1)}><Trophy size={15}/>All Questions Challenge</button>}
            <button
              type="button"
              className="mastery-secondary-btn"
              onClick={() => jumpToQuestion(displayQuestions[0].id)}
            >
              <Eye size={15} /> Review Unit Questions
            </button>
            <button
              type="button"
              className="mastery-secondary-btn"
              onClick={() => replaySet(currentSetIdx)}
            >
              <RotateCcw size={15} /> Replay {activeSet.shortTitle}
            </button>
          </footer>
        </div>
      ) : (
        currentCard && (
          <div className="mastery-question-body">
            {/* Review Mode Banner */}
            {isReviewing && (
              <div className="mastery-review-banner">
                <div className="mastery-review-badge">
                  <Eye size={13} />
                  <span>
                    Viewing Q{currentQGlobalIndex} of {baseQuestions.length} · {isCorrect ? 'Mastered' : 'Reinforced'}
                  </span>
                </div>
                <div className="mastery-review-actions">
                  {hasPrevReviewQ && prevReviewQ && (
                    <button
                      type="button"
                      className="mastery-review-nav-btn"
                      onClick={() => goToAdjacentQuestion(-1)}
                      title="View previous question"
                    >
                      <ArrowLeft size={13} /> Prev
                    </button>
                  )}
                  {hasNextReviewQ && nextReviewQ && (
                    <button
                      type="button"
                      className="mastery-review-nav-btn"
                      onClick={() => goToAdjacentQuestion(1)}
                      title="View next question"
                    >
                      Next <ArrowRight size={13} />
                    </button>
                  )}
                  {liveCard && !completed && !setCompleted && (
                    <button
                      type="button"
                      className="mastery-review-resume-btn"
                      onClick={resumeLive}
                      title="Return to the active question"
                    >
                      Resume Quiz (Q{liveQGlobalIndex}) <ArrowRight size={13} />
                    </button>
                  )}
                  {(completed || setCompleted) && (
                    <button
                      type="button"
                      className="mastery-review-resume-btn"
                      onClick={() => setState(prev => ({ ...prev, viewingQuestionId: null }))}
                      title="Return to score summary"
                    >
                      Scorecard <Trophy size={13} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {challengeCard && <div className="challenge-card-line">
              <span className={`challenge-difficulty level-${challengeCard.difficulty}`} title="Point value is fixed for this run using the question type, declared difficulty and your practice history.">{difficultyLabels[challengeCard.difficulty - 1]} · {challengeCard.value} base pts</span>
              <span className="challenge-recall-status">{challengeCard.secured ? 'Card secured' : challengeCard.needsRecovery ? 'Rebuilding recall' : 'Clean answer → card secured'}</span>
              <details className="challenge-rules"><summary>Scoring & recall</summary><p>Core / Challenging / Advanced cards start at 100 / 150 / 200 points. Clean-answer streaks reach 1.25× at 3, 1.5× at 5 and 2× at 10. A miss breaks the combo and brings the card back after up to 3, then 2, then 1 other cards. Weak spots need three clean recalls: the first returns after 3 other cards, the second after 10, and the third secures it. After a recurring question is answered correctly, its later returns require a typed answer without choices. Short queues finish sooner. Hints give reduced credit and require an unaided retry. Reviewing answers earns no points. Start with five hearts. A wrong answer costs one heart; every five correct answers restore half a heart, up to five. Correct answers need not be consecutive. At zero hearts the run ends; retry or return to practice. Your run saves on this device.</p></details>
              {challengeSaveFailed && <span className="challenge-save-error" role="status">Device storage unavailable · keep this tab open to retain this run.</span>}
            </div>}

            {/* Question Context Row */}
            <div className="mastery-question-meta">
              <div className="mastery-meta-tags">
                <span className={`mastery-kind-tag ${currentCard.kind}`}>
                  {currentCard.kind === 'safeguard' ? (
                    <ShieldAlert size={12} />
                  ) : currentCard.kind === 'multi_item' ? (
                    <Sparkles size={12} />
                  ) : (
                    <Layers size={12} />
                  )}
                  {kindLabel(currentCard.kind)}
                </span>
                {!currentCard.source && <span className="mastery-beat-tag">{currentCard.chapterTitle}</span>}
                {sets.length > 1 && activeSet && (
                  <span className="mastery-beat-tag" style={{ color: '#edca82' }}>
                    {activeSet.shortTitle}
                  </span>
                )}
                {currentCard.isReinforcement && !currentCard.isSpacedRecall && (
                  <span className="mastery-reinforce-pill">
                    <Repeat size={11} /> Reinforcement Retry #{currentCard.attemptNumber}
                  </span>
                )}
                {isHardMode && (
                  <span className="mastery-hard-pill">
                    <Flame size={11} /> Hard Mode (Type Answer)
                  </span>
                )}
                {rapidScan && !isHardMode && (
                  <span className="mastery-rapid-badge" title="Rapid Scan Active: Showing key hooks only">
                    <Zap size={11} /> Rapid Scan
                  </span>
                )}
              </div>

              <div className="mastery-meta-actions">
                {currentCard.isSpacedRecall && <div className="mastery-spaced-banner"><div className="mastery-spaced-badge"><RotateCcw size={13} /><span>{challenge ? 'ADAPTIVE RECALL' : '3-CARD SPACED RECALL'}</span></div></div>}
                {currentCard.hint && !isAnswered && (
                  <button
                    type="button"
                    className="mastery-hint-btn"
                    onClick={() => {
                      const next = !showHint;
                      setState(prev => ({ ...(next ? challengeHelp(prev) : prev), showHint: next }));
                      if (next) playHintSound(soundEnabled);
                    }}
                  >
                    <HelpCircle size={13} /> {showHint ? 'Hide Hint' : 'Hint'}
                  </button>
                )}
                {onJumpToChapter && !currentCard?.source && (
                  <button
                    type="button"
                    className="mastery-hint-btn"
                    onClick={() => {
                      onJumpToChapter(currentCard.chapterIndex);
                      onClose();
                    }}
                    title="Jump the visual player to this beat"
                  >
                    <Eye size={13} /> View Beat on Stage
                  </button>
                )}
              </div>
            </div>

            {/* Prompt */}
            <h3 className="mastery-prompt">{currentCard.orderedSlot ? <OrderedPrompt card={currentCard} history={historyByQuestion} answered={isAnswered}/> : currentCard.prompt}</h3>
            {currentCard.orderedSlot && !isAnswered && <p className="ordered-recall-instruction">{isHardMode ? `Type the answer for blank ${currentCard.orderedSlot.index + 1}.` : `Choose the answer for blank ${currentCard.orderedSlot.index + 1}. Fill the sentence from left to right.`}</p>}
            {currentCard.source && <p className="mastery-source-ref">Source: {currentCard.source.title} · {currentCard.source.locator || `Page ${currentCard.source.page}`}</p>}

            {showHint && currentCard.hint && !isAnswered && (
              <div className="mastery-hint-box">
                <Sparkles size={14} />
                <span>{currentCard.hint}</span>
              </div>
            )}

            {/* Hard Mode: Multi-Item Interactive Recall */}
            {isHardMode && currentCard.kind === 'multi_item' && (
              <div className="mastery-multi-slots-container">
                <div className="mastery-multi-slots-header">
                  <span className="mastery-multi-slots-title">
                    Recalled {effectiveRecalledItems.length} of {(currentCard.expectedItems || []).length}{' '}
                    {currentCard.itemLabel || 'items'}:
                  </span>
                  {effectiveRecalledItems.length === (currentCard.expectedItems || []).length && (
                    <span className="mastery-all-recalled-badge">
                      <CheckCircle2 size={13} /> All Recalled!
                    </span>
                  )}
                </div>
                <div className="mastery-multi-slots-grid">
                  {(currentCard.expectedItems || []).map((item, idx) => {
                    const isRecalled = effectiveRecalledItems.includes(item);
                    const isRevealed = effectiveMultiItemRevealed && !isRecalled;
                    return (
                      <div
                        key={`${currentCard.id}-slot-${idx}`}
                        className={`mastery-slot-chip ${
                          isRecalled ? 'recalled' : isRevealed ? 'revealed' : 'empty'
                        }`}
                      >
                        <span className="mastery-slot-index">{idx + 1}</span>
                        <span className="mastery-slot-text">
                          {isRecalled ? item : isRevealed ? item : '· · · · · · · ·'}
                        </span>
                        {isRecalled && <CheckCircle2 size={14} className="mastery-slot-icon ok" />}
                        {isRevealed && <XCircle size={14} className="mastery-slot-icon miss" />}
                      </div>
                    );
                  })}
                </div>

                {!isAnswered && !isReviewing && (
                  <form onSubmit={submitMultiItem} className="mastery-hard-input-form">
                    <div className="mastery-hard-input-wrap">
                      <input
                        ref={typedInputRef}
                        type="text"
                        value={typedInput}
                        onChange={e => setState(prev => ({ ...prev, typedInput: e.target.value }))}
                        placeholder={`Type one condition/item and press Enter...`}
                        className="mastery-hard-input"
                        autoFocus
                      />
                      <button
                        type="submit"
                        className="mastery-hard-submit-btn"
                        disabled={!typedInput.trim()}
                      >
                        <span>Add</span> <ArrowRight size={14} />
                      </button>
                    </div>
                    <div className="mastery-hard-subactions">
                      <button
                        type="button"
                        className="mastery-giveup-btn"
                        onClick={giveUpMultiItem}
                      >
                        I'm Stuck — Reveal Remaining & Retry Later
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Hard Mode: Single-Answer Typed Input */}
            {isHardMode && currentCard.kind !== 'multi_item' && (
              <form onSubmit={submitTypedAnswer} className="mastery-hard-input-form">
                <div className="mastery-hard-input-wrap">
                  <input
                    ref={typedInputRef}
                    type="text"
                    value={isReviewing ? (effectiveTypedFeedback?.userText || '') : typedInput}
                    disabled={isAnswered || isReviewing || Boolean(isVerifyingSemantic)}
                    onChange={e => setState(prev => ({ ...prev, typedInput: e.target.value }))}
                    placeholder="Type the correct term, concept, or condition..."
                    className="mastery-hard-input"
                    autoFocus
                  />
                  {!isAnswered && !isReviewing && (
                    <button
                      type="submit"
                      className="mastery-hard-submit-btn"
                      disabled={!typedInput.trim() || Boolean(isVerifyingSemantic)}
                    >
                      {isVerifyingSemantic ? (
                        <span className="mastery-verifying-text">Checking concept...</span>
                      ) : (
                        <><span>Submit</span> <ArrowRight size={14} /></>
                      )}
                    </button>
                  )}
                </div>
                {effectiveTypedFeedback && (
                  <div className={`mastery-typed-callout ${effectiveTypedFeedback.status}`}>
                    {effectiveTypedFeedback.status === 'correct' ? (
                      <div className="mastery-typed-line ok">
                        <CheckCircle2 size={16} />
                        <span>
                          Your answer: <strong>"{effectiveTypedFeedback.userText}"</strong>{' '}
                          {effectiveTypedFeedback.semantic ? (
                            <span className="mastery-semantic-pill" title="Concept verified with model">
                              ✨ Concept Matched{effectiveTypedFeedback.feedback ? `: ${effectiveTypedFeedback.feedback}` : ''}
                            </span>
                          ) : (
                            effectiveTypedFeedback.matchedText &&
                            effectiveTypedFeedback.matchedText.toLowerCase() !== effectiveTypedFeedback.userText.toLowerCase() && (
                              <small>(Matched: {effectiveTypedFeedback.matchedText})</small>
                            )
                          )}
                        </span>
                      </div>
                    ) : (
                      <div className="mastery-typed-line bad">
                        <XCircle size={16} />
                        <span>
                          Your answer: <strong>"{effectiveTypedFeedback.userText || '(empty)'}"</strong> · Expected:{' '}
                          <strong>"{effectiveTypedFeedback.matchedText}"</strong>
                          {effectiveTypedFeedback.feedback && (
                            <div className="mastery-semantic-feedback-note">
                              <small>{effectiveTypedFeedback.feedback}</small>
                            </div>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </form>
            )}

            {/* Standard Mode: Multiple-Choice Options Grid */}
            {!isHardMode && (
              <div className={`mastery-options-list ${currentCard.orderedSlot ? 'ordered-answer-bank' : ''}`} aria-label={currentCard.orderedSlot ? 'Shared answer bank' : 'Answer choices'}>

                {currentCard.options.map((opt, idx) => {
                  const isThisSelected = effectiveSelectedOption === idx;
                  const isThisCorrect = idx === currentCard.correctIndex;
                  const isPlaced = Boolean(currentCard.orderedSlot && (orderedUsedAnswers.has(opt) || (isAnswered && isThisCorrect)));
                  const isPriorTrap = Boolean(
                    currentCard.isSpacedRecall &&
                    currentCard.priorTrapOptionText &&
                    (opt === currentCard.priorTrapOptionText ||
                     normalizeAnswer(opt) === normalizeAnswer(currentCard.priorTrapOptionText))
                  );
                  let state = 'idle';
                  if (isAnswered) {
                    if (isThisCorrect) state = 'correct';
                    else if (isThisSelected) state = 'wrong';
                    else state = 'dimmed';
                  }
                  const letter = String.fromCharCode(65 + idx);
                  const { leadHook } = splitOptionHook(opt);

                  return (
                    <button
                      key={`${currentCard.id}-opt-${idx}`}
                      type="button"
                      disabled={isAnswered || isReviewing || orderedUsedAnswers.has(opt)}
                      onClick={() => submitAnswer(idx)}
                      className={`mastery-option-btn ${state} ${isPlaced ? 'ordered-answer-placed' : ''} ${isPriorTrap ? 'prior-trap' : ''} ${isThisCorrect && memoryLocked ? 'memory-locked' : ''}`}
                    >
                      <span className="mastery-option-key">{letter}</span>
                      <div className="mastery-option-content">
                        <div className="mastery-option-lead-row">
                          <span className="mastery-option-lead-hook">{rapidScan && !currentCard.orderedSlot ? leadHook : opt}</span>
                          {isPlaced && <span className="ordered-placed-label"><CheckCircle2 size={11} aria-hidden="true"/> Placed</span>}
                          {isPriorTrap && !isAnswered && (
                            <span className="mastery-prior-trap-tag" title="You selected this option on your previous attempt">
                              ⚠️ Prior Trap (Avoid)
                            </span>
                          )}
                        </div>
                        {isAnswered && !isCorrect && isThisCorrect && !isReviewing && (
                          <button
                            type="button"
                            className={`mastery-lock-memory-btn ${memoryLocked ? 'locked' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLockInMemory();
                            }}
                            title="Lock this key phrase into working memory before retry"
                          >
                            <Sparkles size={12} />
                            <span>{memoryLocked ? 'Memory Locked 🔒' : 'Tap to Lock In Memory'}</span>
                          </button>
                        )}
                      </div>
                      {isAnswered && isThisCorrect && <CheckCircle2 size={18} className="mastery-opt-icon ok" />}
                      {isAnswered && isThisSelected && !isThisCorrect && (
                        <XCircle size={18} className="mastery-opt-icon bad" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Immediate Feedback */}
            {isAnswered && (
              <div className={`mastery-feedback-panel ${isCorrect ? 'correct' : 'missed'}`} data-mobile-detail={feedbackDetail}>
                <div className="mastery-feedback-main">
                  <div className="mastery-feedback-title">
                    {isReviewing ? (
                      <>
                        {isCorrect ? <CheckCircle2 size={18} /> : <Repeat size={18} />}
                        <strong>{isCorrect ? 'Mastered Concept' : 'Reinforced Concept'}</strong>
                      </>
                    ) : isCorrect ? (
                      <>
                        <CheckCircle2 size={18} />
                        <strong>
                          {challengeAward ? challengeAward.status === 'secured' ? 'Card secured!' : challengeAward.status === 'assisted' ? 'Good practice — try it unaided next time' : 'Correct — recall streak building!' : currentCard.isSpacedRecall
                            ? '🎯 Spaced Recall Mastered! Trap Avoided.'
                            : currentCard.isReinforcement
                            ? 'Reinforced & Mastered! Concept Locked In.'
                            : 'Correct — Concept Mastered!'}
                        </strong>
                      </>
                    ) : (
                      <>
                        <Repeat size={18} />
                        <strong>{challenge ? 'Missed — added to adaptive recall' : currentCard.orderedSlot ? 'Missed — this blank will return for recall' : 'Missed — Queued for 3-Card Spaced Recall'}</strong>
                      </>
                    )}
                  </div>

                  {challengeAward && <div className={`challenge-answer-reward ${challengeAward.status}`} role="status">
                    <strong>{challengeAward.points > 0 ? `+${challengeAward.points} pts` : challengeAward.status === 'missed' ? 'Combo reset · your score is safe' : 'Recall progress saved'}</strong>
                    {isCorrect && <span>{challengeAward.multiplier}× combo</span>}
                    <span>{challenge?.outOfHearts ? 'Out of hearts · run finished' : challengeAward.nextAfter === null ? 'Secured for this run' : challengeAward.nextAfter === 0 ? 'Returns next · no other cards remain' : `Returns after ${challengeAward.nextAfter} other card${challengeAward.nextAfter === 1 ? '' : 's'}`}</span>
                    {challengeAward.heartsRestored > 0 && <span className="challenge-heart-restored">♥ +½ heart restored</span>}
                  </div>}

                  {isHardMode && !isCorrect && !isReviewing && (
                    <div style={{ marginTop: 4 }}>
                      <button
                        type="button"
                        className={`mastery-lock-memory-btn ${memoryLocked ? 'locked' : ''}`}
                        onClick={handleLockInMemory}
                      >
                        <Sparkles size={12} />
                        <span>{memoryLocked ? 'Memory Locked 🔒' : 'Tap to Lock In Memory'}</span>
                      </button>
                    </div>
                  )}

                  {compact&&currentCard.safeguardNote&&<nav className="mobile-feedback-tabs" aria-label="Answer explanation"><button type="button" aria-pressed={feedbackDetail==='explanation'} onClick={()=>setFeedbackDetail('explanation')}>Explanation</button><button type="button" aria-pressed={feedbackDetail==='takeaway'} onClick={()=>setFeedbackDetail('takeaway')}>Key takeaway</button></nav>}
                  <p className="mastery-feedback-explanation">{currentCard.explanation}</p>
                  {currentCard.safeguardNote && (
                    <p className="mastery-feedback-safeguard">
                      <strong>Key Takeaway / Safeguard:</strong> {currentCard.safeguardNote}
                    </p>
                  )}
                </div>

                {isReviewing ? (
                  <div className="mastery-round-complete-actions">
                    {hasNextReviewQ && nextReviewQ ? (
                      <button
                        type="button"
                        className="mastery-continue-btn"
                        onClick={() => goToAdjacentQuestion(1)}
                        autoFocus
                      >
                        Next Question <ArrowRight size={16} />
                      </button>
                    ) : liveCard && !completed && !setCompleted ? (
                      <button
                        type="button"
                        className="mastery-continue-btn"
                        onClick={resumeLive}
                        autoFocus
                      >
                        Resume Quiz <ArrowRight size={16} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="mastery-continue-btn"
                        onClick={() => setState(prev => ({ ...prev, viewingQuestionId: null }))}
                        autoFocus
                      >
                        Scorecard <ArrowRight size={16} />
                      </button>
                    )}
                  </div>
                ) : challenge?.outOfHearts ? (
                  <button type="button" className="mastery-continue-btn" onClick={advanceNext} autoFocus>
                    View run score <Trophy size={16}/>
                  </button>
                ) : cursor + 1 < queue.length ? (
                  <button type="button" className="mastery-continue-btn" onClick={advanceNext} autoFocus>
                    Next Question <ArrowRight size={16} />
                  </button>
                ) : reinforcementQueue.length > 0 ? (
                  <button type="button" className="mastery-continue-btn" onClick={advanceNext} autoFocus>
                    Start Reinforcement Round {round + 1} ({reinforcementQueue.length})
                    <ArrowRight size={16} />
                  </button>
                ) : (
                  <div className="mastery-round-complete-actions">
                    <button
                      type="button"
                      className="mastery-replay-action-btn"
                      onClick={() => restartQuiz(false, false)}
                      title="Replay in standard multiple-choice mode"
                    >
                      <RotateCcw size={14} /> Replay
                    </button>
                    <button
                      type="button"
                      className="mastery-hard-action-btn"
                      onClick={() => restartQuiz(false, true)}
                      title="Challenge yourself in Hard Mode: type the answers"
                    >
                      <Sparkles size={14} /> Hard Mode
                    </button>
                    <button
                      type="button"
                      className="mastery-scorecard-action-btn"
                      onClick={advanceNext}
                      title="View full lesson mastery metrics"
                    >
                      Scorecard <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {!isAnswered && !isHardMode && !isReviewing && (
              <div className="mastery-keyboard-tip">
                Press <kbd>A</kbd>–<kbd>{String.fromCharCode(64+currentCard.options.length)}</kbd> or <kbd>1</kbd>–<kbd>{Math.min(9,currentCard.options.length)}</kbd>{currentCard.options.length===10 && <> or <kbd>0</kbd></>} to answer · {challenge ? 'Build a clean-answer combo · weak spots return more often' : currentCard.orderedSlot ? 'Each blank counts as one answer · missed blanks return for recall' : 'Missed questions return 3 cards later for spaced recall'}
              </div>
            )}
            {isReviewing && (
              <div className="mastery-keyboard-tip">
                Press <kbd>←</kbd> / <kbd>→</kbd> to review questions · Press <kbd>Esc</kbd> to return to active quiz
              </div>
            )}
            {isAnswered && !isCorrect && !isReviewing && (
              <div className="mastery-keyboard-tip">
                Press <kbd>L</kbd> to Lock in Memory · Press <kbd>Enter</kbd> or <kbd>Space</kbd> for next card
              </div>
            )}
            {!isAnswered && isHardMode && !isReviewing && (
              <div className="mastery-keyboard-tip">
                Type your answer and press <kbd>Enter</kbd> · Active recall reinforces memory retention
              </div>
            )}
          </div>
        )
      )}
    </div>
  );

  if (embedded) {
    return <div className="mastery-quiz-stage-container"><LearningWorld />{content}</div>;
  }

  return (
    <div className="mastery-quiz-backdrop" role="dialog" aria-modal="true" aria-label="Reinforcement Quiz">
      <LearningWorld />
      {content}
    </div>
  );
}
