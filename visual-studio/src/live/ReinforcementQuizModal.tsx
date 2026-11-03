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
} from 'lucide-react';
import { ensureLessonQuiz, type LiveLesson, type QuizQuestion } from './lessonTypes';

export interface ActiveCard extends QuizQuestion {
  roundNumber: number;
  attemptNumber: number;
  isReinforcement: boolean;
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
}

export function createInitialQuizState(lesson: LiveLesson, soundEnabled = true): QuizProgressState {
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
          <div className={`mastery-round-tag ${round > 1 ? 'reinforcing' : ''}`}>
            <Repeat size={13} />
            <span>
              {round === 1
                ? 'Round 1 · Initial Pass'
                : `Round ${round} · Reinforcing Missed (${queue.length})`}
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
  } = state;

  const masteredSet = useMemo(() => new Set(masteredIds), [masteredIds]);
  const everMissedSet = useMemo(() => new Set(everMissedIds), [everMissedIds]);

  const currentCard = queue[cursor] as ActiveCard | undefined;
  const isAnswered = selectedOption !== null;
  const isCorrect = isAnswered && currentCard && selectedOption === currentCard.correctIndex;

  const submitAnswer = (optionIdx: number) => {
    if (selectedOption !== null || !currentCard) return;
    const nextAttemptCount = (attemptsByQuestion[currentCard.id] || 0) + 1;
    const isHit = optionIdx === currentCard.correctIndex;

    if (isHit) {
      const nextStreak = streak + 1;
      playCorrectSound(nextStreak, currentCard.isReinforcement, soundEnabled);
      setState(prev => ({
        ...prev,
        selectedOption: optionIdx,
        totalSubmissions: prev.totalSubmissions + 1,
        attemptsByQuestion: { ...prev.attemptsByQuestion, [currentCard.id]: nextAttemptCount },
        masteredIds: prev.masteredIds.includes(currentCard.id)
          ? prev.masteredIds
          : [...prev.masteredIds, currentCard.id],
        streak: nextStreak,
        bestStreak: Math.max(prev.bestStreak, nextStreak),
      }));
    } else {
      playWrongSound(soundEnabled);
      const reshuffled = shuffleQuestionOptions(currentCard, totalSubmissions + round + cursor + 1);
      setState(prev => ({
        ...prev,
        selectedOption: optionIdx,
        totalSubmissions: prev.totalSubmissions + 1,
        attemptsByQuestion: { ...prev.attemptsByQuestion, [currentCard.id]: nextAttemptCount },
        streak: 0,
        everMissedIds: prev.everMissedIds.includes(currentCard.id)
          ? prev.everMissedIds
          : [...prev.everMissedIds, currentCard.id],
        reinforcementQueue: [
          ...prev.reinforcementQueue,
          {
            ...reshuffled,
            roundNumber: prev.round + 1,
            attemptNumber: nextAttemptCount + 1,
            isReinforcement: true,
          },
        ],
      }));
    }
  };

  const advanceNext = () => {
    if (!isAnswered) return;

    if (cursor + 1 < queue.length) {
      playStepSound(soundEnabled);
      setState(prev => ({
        ...prev,
        selectedOption: null,
        showHint: false,
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
        completed: true,
      }));
    }
  };

  const restartQuiz = (missedOnly = false) => {
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
      queue: freshQueue,
      reinforcementQueue: [],
      cursor: 0,
      round: 1,
      selectedOption: null,
      showHint: false,
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
      if (!isAnswered && ['1', '2', '3', '4'].includes(e.key)) {
        const idx = Number(e.key) - 1;
        if (idx >= 0 && idx < currentCard.options.length) {
          e.preventDefault();
          submitAnswer(idx);
        }
      } else if (isAnswered && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        advanceNext();
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
            <span className="mastery-kicker">100% MASTERY VERIFIED</span>
            <h3>Perfect Score Achieved!</h3>
            <p>
              {everMissedSet.size === 0
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
            <button type="button" className="mastery-secondary-btn" onClick={() => restartQuiz(false)}>
              <RotateCcw size={15} /> Restart Full Quiz (Reshuffle)
            </button>
            {everMissedSet.size > 0 && (
              <button type="button" className="mastery-secondary-btn" onClick={() => restartQuiz(true)}>
                <Repeat size={15} /> Drill {everMissedSet.size} Previously Missed Only
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
                  {currentCard.kind === 'safeguard' ? <ShieldAlert size={12} /> : <Layers size={12} />}
                  {kindLabel(currentCard.kind)}
                </span>
                <span className="mastery-beat-tag">
                  Beat {currentCard.chapterIndex + 1} of {lesson.chapters.length} · {currentCard.chapterTitle}
                </span>
                {currentCard.isReinforcement && (
                  <span className="mastery-reinforce-pill">
                    <Repeat size={11} /> Reinforcement Retry #{currentCard.attemptNumber}
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

            {/* Prompt */}
            <h3 className="mastery-prompt">{currentCard.prompt}</h3>

            {showHint && currentCard.hint && !isAnswered && (
              <div className="mastery-hint-box">
                <Sparkles size={14} />
                <span>{currentCard.hint}</span>
              </div>
            )}

            {/* Options Grid */}
            <div className="mastery-options-list">
              {currentCard.options.map((opt, idx) => {
                const isThisSelected = selectedOption === idx;
                const isThisCorrect = idx === currentCard.correctIndex;
                let state = 'idle';
                if (isAnswered) {
                  if (isThisCorrect) state = 'correct';
                  else if (isThisSelected) state = 'wrong';
                  else state = 'dimmed';
                }
                return (
                  <button
                    key={`${currentCard.id}-opt-${idx}`}
                    type="button"
                    disabled={isAnswered}
                    onClick={() => submitAnswer(idx)}
                    className={`mastery-option-btn ${state}`}
                  >
                    <span className="mastery-option-key">{idx + 1}</span>
                    <span className="mastery-option-text">{opt}</span>
                    {isAnswered && isThisCorrect && <CheckCircle2 size={18} className="mastery-opt-icon ok" />}
                    {isAnswered && isThisSelected && !isThisCorrect && (
                      <XCircle size={18} className="mastery-opt-icon bad" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Immediate Feedback */}
            {isAnswered && (
              <div className={`mastery-feedback-panel ${isCorrect ? 'correct' : 'missed'}`}>
                <div className="mastery-feedback-main">
                  <div className="mastery-feedback-title">
                    {isCorrect ? (
                      <>
                        <CheckCircle2 size={18} />
                        <strong>
                          {currentCard.isReinforcement
                            ? 'Reinforced & Mastered! Concept Locked In.'
                            : 'Correct — Concept Mastered!'}
                        </strong>
                      </>
                    ) : (
                      <>
                        <Repeat size={18} />
                        <strong>Missed — Queued for Reinforcement</strong>
                      </>
                    )}
                  </div>
                  <p className="mastery-feedback-explanation">{currentCard.explanation}</p>
                  {currentCard.safeguardNote && (
                    <p className="mastery-feedback-safeguard">
                      <strong>Key Takeaway / Safeguard:</strong> {currentCard.safeguardNote}
                    </p>
                  )}
                </div>

                <button type="button" className="mastery-continue-btn" onClick={advanceNext} autoFocus>
                  {cursor + 1 < queue.length
                    ? 'Next Question'
                    : reinforcementQueue.length > 0
                      ? `Start Reinforcement Round ${round + 1} (${reinforcementQueue.length})`
                      : 'Finish & View Mastery'}
                  <ArrowRight size={16} />
                </button>
              </div>
            )}

            {!isAnswered && (
              <div className="mastery-keyboard-tip">
                Press <kbd>1</kbd>–<kbd>4</kbd> to answer · Failed answers automatically repeat until 100% mastery
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
