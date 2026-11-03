import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  Sparkles,
  Flame,
  Trophy,
  ArrowRight,
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
} from 'lucide-react';
import { ensureLessonQuiz, type LiveLesson, type QuizQuestion } from './lessonTypes';

export interface ActiveCard extends QuizQuestion {
  roundNumber: number;
  attemptNumber: number;
  isReinforcement: boolean;
  isSpacedRecall?: boolean;
  memoryCue?: string;
  priorTrapOptionText?: string;
}

export interface QuizProgressState {
  lessonId: string;
  baseQuestions: QuizQuestion[];
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
  streak: number;
  bestStreak: number;
  totalSubmissions: number;
  completed: boolean;
  isHardMode: boolean;
  rapidScan: boolean;
  memoryLocked: boolean;
  typedInput: string;
  typedFeedback: {
    status: 'correct' | 'wrong' | 'revealed';
    userText: string;
    matchedText?: string;
  } | null;
  recalledItems: string[];
  multiItemRevealed: boolean;
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
  return {
    lessonId: lesson.id,
    baseQuestions,
    queue: baseQuestions.map(q => ({
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
    streak: 0,
    bestStreak: 0,
    totalSubmissions: 0,
    completed: false,
    isHardMode: hardMode,
    rapidScan,
    memoryLocked: false,
    typedInput: '',
    typedFeedback: null,
    recalledItems: [],
    multiItemRevealed: false,
  };
}

interface ReinforcementQuizNavbarProps {
  lesson: LiveLesson;
  quizState: QuizProgressState;
  setQuizState: React.Dispatch<React.SetStateAction<QuizProgressState>>;
  onClose?: () => void;
  showCloseButton?: boolean;
  className?: string;
}

export function ReinforcementQuizNavbar({
  lesson,
  quizState,
  setQuizState,
  onClose,
  showCloseButton = false,
  className = '',
}: ReinforcementQuizNavbarProps) {
  const { baseQuestions, queue, cursor, round, streak, masteredIds, everMissedIds, completed, soundEnabled } = quizState;
  const currentCard = queue[cursor] as ActiveCard | undefined;
  const totalCount = baseQuestions.length;
  const masteredSet = useMemo(() => new Set(masteredIds), [masteredIds]);
  const missedSet = useMemo(() => new Set(everMissedIds), [everMissedIds]);
  const masteredCount = masteredSet.size;
  const masteryPercent = Math.round((masteredCount / Math.max(1, totalCount)) * 100);

  return (
    <div className={`mastery-quiz-top-shell ${className}`.trim()}>
      <header className="mastery-quiz-header">
        <div className="mastery-quiz-brand">
          <span className="mastery-quiz-badge">
            <Brain size={14} /> REINFORCEMENT QUIZ
          </span>
          <h2>{lesson.title}</h2>
        </div>

        <div className="mastery-quiz-stats">
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
            className={`mastery-mode-toggle-btn ${quizState.isHardMode ? 'hard' : 'standard'}`}
            onClick={() => {
              const nextHard = !quizState.isHardMode;
              setQuizState(prev => ({
                ...prev,
                isHardMode: nextHard,
                typedInput: '',
                typedFeedback: null,
                recalledItems: [],
                multiItemRevealed: false,
              }));
              playStepSound(soundEnabled);
            }}
            title={quizState.isHardMode ? 'Switch to Multiple Choice Mode' : 'Switch to Hard Mode (Type Answers)'}
          >
            {quizState.isHardMode ? <Flame size={13} /> : <Sparkles size={13} />}
            <span>{quizState.isHardMode ? 'Hard Mode' : 'Standard'}</span>
          </button>
          <div className={`mastery-round-tag ${round > 1 ? 'reinforcing' : ''}`}>
            <Repeat size={13} />
            <span>
              {round === 1
                ? 'Round 1'
                : `Round ${round} (${queue.length})`}
            </span>
          </div>
          <div className={`mastery-streak-tag ${streak >= 2 ? 'hot' : ''}`} title="Current consecutive correct answers">
            <Flame size={14} />
            <span>{streak} Streak</span>
          </div>
          <div className="mastery-mastery-tag">
            <CheckCircle2 size={14} />
            <span>
              {masteredCount} / {totalCount} Mastered ({masteryPercent}%)
            </span>
          </div>
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

      <div className="mastery-progress-rail" aria-label="Question mastery progress">
        {baseQuestions.map((q, idx) => {
          const isMastered = masteredSet.has(q.id);
          const wasMissed = missedSet.has(q.id);
          const isCurrent = !completed && currentCard?.id === q.id;
          let stateClass = 'pending';
          if (isMastered && !wasMissed) stateClass = 'mastered-first';
          else if (isMastered && wasMissed) stateClass = 'mastered-reinforced';
          else if (wasMissed) stateClass = 'missed-queued';
          if (isCurrent) stateClass += ' current';
          return (
            <div
              key={q.id}
              className={`mastery-progress-segment ${stateClass}`}
              title={`Q${idx + 1}: ${q.chapterTitle} (${
                isMastered ? 'Mastered' : wasMissed ? 'Queued for Reinforcement' : 'Upcoming'
              })`}
            />
          );
        })}
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
  const [internalState, setInternalState] = useState<QuizProgressState>(() => createInitialQuizState(lesson));
  const state = externalState ?? internalState;
  const setState = externalSetState ?? setInternalState;

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
    streak,
    bestStreak,
    totalSubmissions,
    completed,
    isHardMode,
    rapidScan,
    memoryLocked,
    typedInput,
    typedFeedback,
    recalledItems,
    multiItemRevealed,
  } = state;

  const masteredSet = useMemo(() => new Set(masteredIds), [masteredIds]);
  const everMissedSet = useMemo(() => new Set(everMissedIds), [everMissedIds]);

  const currentCard = queue[cursor] as ActiveCard | undefined;
  const isAnswered = selectedOption !== null;
  const isCorrect = isAnswered && currentCard && selectedOption === currentCard.correctIndex;

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
    if (selectedOption !== null || !currentCard) return;
    const nextAttemptCount = (attemptsByQuestion[currentCard.id] || 0) + 1;
    const isHit = optionIdx === currentCard.correctIndex;

    if (isHit) {
      const nextStreak = streak + 1;
      playCorrectSound(nextStreak, currentCard.isReinforcement || Boolean(currentCard.isSpacedRecall), soundEnabled);
      setState(prev => ({
        ...prev,
        selectedOption: optionIdx,
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
      const keyHook = getCardKeyHook(currentCard);
      const priorTrap = currentCard.options[optionIdx] || '';

      const retryCard: ActiveCard = {
        ...reshuffled,
        roundNumber: currentCard.roundNumber,
        attemptNumber: nextAttemptCount + 1,
        isReinforcement: true,
        isSpacedRecall: true,
        memoryCue: keyHook,
        priorTrapOptionText: priorTrap,
      };

      // 3-Card Short-Horizon Spaced Recall: re-enters queue exactly 3 cards later
      setState(prev => {
        const insertPos = Math.min(prev.queue.length, prev.cursor + 3);
        const nextQueue = [
          ...prev.queue.slice(0, insertPos),
          retryCard,
          ...prev.queue.slice(insertPos),
        ];
        return {
          ...prev,
          queue: nextQueue,
          selectedOption: optionIdx,
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

  const submitTypedAnswer = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isAnswered || !currentCard) return;
    const rawInput = typedInput.trim();
    if (!rawInput) return;

    const result = matchesSingleAnswer(rawInput, currentCard);
    const nextAttemptCount = (attemptsByQuestion[currentCard.id] || 0) + 1;

    if (result.hit) {
      const nextStreak = streak + 1;
      playCorrectSound(nextStreak, currentCard.isReinforcement || Boolean(currentCard.isSpacedRecall), soundEnabled);
      setState(prev => ({
        ...prev,
        selectedOption: currentCard.correctIndex,
        typedFeedback: { status: 'correct', userText: rawInput, matchedText: result.matched },
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
      const expected = currentCard.acceptedAnswers?.[0] || currentCard.options[currentCard.correctIndex];
      const keyHook = getCardKeyHook(currentCard);

      const retryCard: ActiveCard = {
        ...reshuffled,
        roundNumber: currentCard.roundNumber,
        attemptNumber: nextAttemptCount + 1,
        isReinforcement: true,
        isSpacedRecall: true,
        memoryCue: keyHook,
        priorTrapOptionText: rawInput,
      };

      setState(prev => {
        const insertPos = Math.min(prev.queue.length, prev.cursor + 3);
        const nextQueue = [
          ...prev.queue.slice(0, insertPos),
          retryCard,
          ...prev.queue.slice(insertPos),
        ];
        return {
          ...prev,
          queue: nextQueue,
          selectedOption: -1,
          typedFeedback: { status: 'wrong', userText: rawInput, matchedText: expected },
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

  const submitMultiItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isAnswered || !currentCard || currentCard.kind !== 'multi_item') return;
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
        const nextAttemptCount = (attemptsByQuestion[currentCard.id] || 0) + 1;
        const nextStreak = streak + 1;
        playCorrectSound(nextStreak, currentCard.isReinforcement, soundEnabled);
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
    }
  };

  const giveUpMultiItem = () => {
    if (isAnswered || !currentCard) return;
    const nextAttemptCount = (attemptsByQuestion[currentCard.id] || 0) + 1;
    playWrongSound(soundEnabled);
    const reshuffled = shuffleQuestionOptions(currentCard, totalSubmissions + round + cursor + 1);
    const keyHook = getCardKeyHook(currentCard);

    const retryCard: ActiveCard = {
      ...reshuffled,
      roundNumber: currentCard.roundNumber,
      attemptNumber: nextAttemptCount + 1,
      isReinforcement: true,
      isSpacedRecall: true,
      memoryCue: keyHook,
      priorTrapOptionText: 'Incomplete recall',
    };

    setState(prev => {
      const insertPos = Math.min(prev.queue.length, prev.cursor + 3);
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
    if (!isAnswered) return;

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
      }));
    } else {
      playVictoryFanfare(soundEnabled);
      setState(prev => ({
        ...prev,
        selectedOption: null,
        showHint: false,
        memoryLocked: false,
        typedInput: '',
        typedFeedback: null,
        recalledItems: [],
        multiItemRevealed: false,
        completed: true,
      }));
    }
  };

  const restartQuiz = (missedOnly = false, hardMode?: boolean) => {
    const nextHardMode = hardMode !== undefined ? hardMode : isHardMode;
    playQuizStartSound(soundEnabled);
    const source =
      missedOnly && everMissedSet.size > 0
        ? baseQuestions.filter(q => everMissedSet.has(q.id))
        : baseQuestions;
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
      masteredIds: [],
      everMissedIds: missedOnly ? prev.everMissedIds : [],
      attemptsByQuestion: missedOnly ? prev.attemptsByQuestion : {},
      streak: 0,
      totalSubmissions: 0,
      completed: false,
    }));
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('textarea,select,[contenteditable="true"],input:not([type="range"])')) return;
      if (e.key === 'Escape' && !embedded) {
        e.preventDefault();
        onClose();
        return;
      }
      if (completed || !currentCard) return;
      if (!isAnswered) {
        const numIdx = ['1', '2', '3', '4'].indexOf(e.key);
        const letterIdx = ['a', 'b', 'c', 'd', 'A', 'B', 'C', 'D'].indexOf(e.key);
        const idx = numIdx !== -1 ? numIdx : letterIdx !== -1 ? letterIdx % 4 : -1;
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

  const kindLabel = (kind: QuizQuestion['kind']) => {
    if (kind === 'mechanism') return 'Visual Mechanism';
    if (kind === 'safeguard') return 'Misreading Safeguard';
    if (kind === 'multi_item') return 'Multi-Item Recall';
    return 'Core Inference';
  };

  const content = (
    <div className={`mastery-quiz-modal ${embedded ? 'embedded-stage' : ''}`}>
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
      {completed ? (
        <div className="mastery-completion-body">
          <div className="mastery-trophy-hero">
            <div className="mastery-trophy-ring">
              <Trophy size={36} />
            </div>
            <span className="mastery-kicker">
              {isHardMode ? 'HARD MODE 100% MASTERY VERIFIED' : '100% MASTERY VERIFIED'}
            </span>
            <h3>{isHardMode ? 'Hard Mode Conquered!' : 'Perfect Score Achieved!'}</h3>
            <p>
              {isHardMode
                ? 'Flawless active recall! You typed the answers and recalled multi-item rows with zero multiple-choice prompts.'
                : everMissedSet.size === 0
                  ? 'Flawless run! You answered every single concept and visual mechanism question correctly on the first pass.'
                  : `You reinforced and mastered all ${everMissedSet.size} missed concept${
                      everMissedSet.size > 1 ? 's' : ''
                    } across ${round} rounds until zero gaps remained.`}
            </p>
          </div>

          <div className="mastery-metrics-grid">
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
          </div>

          <div className="mastery-breakdown-list">
            <h4>CONCEPT MASTERY BREAKDOWN</h4>
            <div className="mastery-breakdown-scroll">
              {baseQuestions.map((q, idx) => {
                const tries = attemptsByQuestion[q.id] || 1;
                const reinforced = everMissedSet.has(q.id);
                return (
                  <div key={q.id} className="mastery-breakdown-row">
                    <div className="mastery-breakdown-left">
                      <span className="mastery-q-index">Q{idx + 1}</span>
                      <div>
                        <strong>{q.prompt}</strong>
                        <small>
                          {q.chapterTitle} · {kindLabel(q.kind)}
                        </small>
                      </div>
                    </div>
                    <div className="mastery-breakdown-right">
                      <span className={`mastery-status-pill ${reinforced ? 'reinforced' : 'first-try'}`}>
                        {reinforced ? `Reinforced (${tries} tries)` : '1st Try Mastered'}
                      </span>
                      {onJumpToChapter && (
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
            {everMissedSet.size > 0 && (
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
      ) : (
        currentCard && (
          <div className="mastery-question-body">
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
                <span className="mastery-beat-tag">
                  Beat {currentCard.chapterIndex + 1} of {lesson.chapters.length} · {currentCard.chapterTitle}
                </span>
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
                {currentCard.hint && !isAnswered && (
                  <button
                    type="button"
                    className="mastery-hint-btn"
                    onClick={() => {
                      const next = !showHint;
                      setState(prev => ({ ...prev, showHint: next }));
                      if (next) playHintSound(soundEnabled);
                    }}
                  >
                    <HelpCircle size={13} /> {showHint ? 'Hide Hint' : 'Hint'}
                  </button>
                )}
                {onJumpToChapter && (
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

            {/* 3-Card Short-Horizon Spaced Recall Banner */}
            {currentCard.isSpacedRecall && (
              <div className="mastery-spaced-banner">
                <div className="mastery-spaced-badge">
                  <RotateCcw size={13} className="spin-slow" />
                  <span>3-CARD SPACED RECALL</span>
                </div>
                <div className="mastery-spaced-cue">
                  Memory Cue Anchor: <strong className="gold-text">"{currentCard.memoryCue || getCardKeyHook(currentCard)}"</strong>
                </div>
              </div>
            )}

            {/* Prompt */}
            <h3 className="mastery-prompt">{currentCard.prompt}</h3>

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
                    Recalled {recalledItems.length} of {(currentCard.expectedItems || []).length}{' '}
                    {currentCard.itemLabel || 'items'}:
                  </span>
                  {recalledItems.length === (currentCard.expectedItems || []).length && (
                    <span className="mastery-all-recalled-badge">
                      <CheckCircle2 size={13} /> All Recalled!
                    </span>
                  )}
                </div>
                <div className="mastery-multi-slots-grid">
                  {(currentCard.expectedItems || []).map((item, idx) => {
                    const isRecalled = recalledItems.includes(item);
                    const isRevealed = multiItemRevealed && !isRecalled;
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

                {!isAnswered && (
                  <form onSubmit={submitMultiItem} className="mastery-hard-input-form">
                    <div className="mastery-hard-input-wrap">
                      <input
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
                    type="text"
                    value={typedInput}
                    disabled={isAnswered}
                    onChange={e => setState(prev => ({ ...prev, typedInput: e.target.value }))}
                    placeholder="Type the correct term, concept, or condition..."
                    className="mastery-hard-input"
                    autoFocus
                  />
                  {!isAnswered && (
                    <button
                      type="submit"
                      className="mastery-hard-submit-btn"
                      disabled={!typedInput.trim()}
                    >
                      <span>Submit</span> <ArrowRight size={14} />
                    </button>
                  )}
                </div>
                {typedFeedback && (
                  <div className={`mastery-typed-callout ${typedFeedback.status}`}>
                    {typedFeedback.status === 'correct' ? (
                      <div className="mastery-typed-line ok">
                        <CheckCircle2 size={16} />
                        <span>
                          Your answer: <strong>"{typedFeedback.userText}"</strong>{' '}
                          {typedFeedback.matchedText &&
                            typedFeedback.matchedText.toLowerCase() !== typedFeedback.userText.toLowerCase() && (
                              <small>(Matched: {typedFeedback.matchedText})</small>
                            )}
                        </span>
                      </div>
                    ) : (
                      <div className="mastery-typed-line bad">
                        <XCircle size={16} />
                        <span>
                          Your answer: <strong>"{typedFeedback.userText || '(empty)'}"</strong> · Expected:{' '}
                          <strong>"{typedFeedback.matchedText}"</strong>
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </form>
            )}

            {/* Standard Mode: Multiple-Choice Options Grid */}
            {!isHardMode && (
              <div className="mastery-options-list">
                {currentCard.options.map((opt, idx) => {
                  const isThisSelected = selectedOption === idx;
                  const isThisCorrect = idx === currentCard.correctIndex;
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
                  const { leadHook, supportingText } = splitOptionHook(opt);

                  return (
                    <button
                      key={`${currentCard.id}-opt-${idx}`}
                      type="button"
                      disabled={isAnswered}
                      onClick={() => submitAnswer(idx)}
                      className={`mastery-option-btn ${state} ${isPriorTrap ? 'prior-trap' : ''} ${isThisCorrect && memoryLocked ? 'memory-locked' : ''}`}
                    >
                      <span className="mastery-option-key">{letter}</span>
                      <div className="mastery-option-content">
                        <div className="mastery-option-lead-row">
                          <span className="mastery-option-lead-hook">{leadHook}</span>
                          {isPriorTrap && !isAnswered && (
                            <span className="mastery-prior-trap-tag" title="You selected this option on your previous attempt">
                              ⚠️ Prior Trap (Avoid)
                            </span>
                          )}
                        </div>
                        {!rapidScan && supportingText && (
                          <div className="mastery-option-supporting">{supportingText}</div>
                        )}
                        {isAnswered && !isCorrect && isThisCorrect && (
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
              <div className={`mastery-feedback-panel ${isCorrect ? 'correct' : 'missed'}`}>
                <div className="mastery-feedback-main">
                  <div className="mastery-feedback-title">
                    {isCorrect ? (
                      <>
                        <CheckCircle2 size={18} />
                        <strong>
                          {currentCard.isSpacedRecall
                            ? '🎯 Spaced Recall Mastered! Trap Avoided.'
                            : currentCard.isReinforcement
                            ? 'Reinforced & Mastered! Concept Locked In.'
                            : 'Correct — Concept Mastered!'}
                        </strong>
                      </>
                    ) : (
                      <>
                        <Repeat size={18} />
                        <strong>Missed — Queued for 3-Card Spaced Recall</strong>
                      </>
                    )}
                  </div>

                  {isHardMode && !isCorrect && (
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

                  <p className="mastery-feedback-explanation">{currentCard.explanation}</p>
                  {currentCard.safeguardNote && (
                    <p className="mastery-feedback-safeguard">
                      <strong>Key Takeaway / Safeguard:</strong> {currentCard.safeguardNote}
                    </p>
                  )}
                </div>

                {cursor + 1 < queue.length ? (
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

            {!isAnswered && !isHardMode && (
              <div className="mastery-keyboard-tip">
                Press <kbd>A</kbd>–<kbd>D</kbd> or <kbd>1</kbd>–<kbd>4</kbd> to answer · Missed questions return 3 cards later for spaced recall
              </div>
            )}
            {isAnswered && !isCorrect && (
              <div className="mastery-keyboard-tip">
                Press <kbd>L</kbd> to Lock in Memory · Press <kbd>Enter</kbd> or <kbd>Space</kbd> for next card
              </div>
            )}
            {!isAnswered && isHardMode && (
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
    return <div className="mastery-quiz-stage-container">{content}</div>;
  }

  return (
    <div className="mastery-quiz-backdrop" role="dialog" aria-modal="true" aria-label="Reinforcement Quiz">
      {content}
    </div>
  );
}
