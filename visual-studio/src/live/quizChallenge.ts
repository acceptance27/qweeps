import type {ActiveCard, QuizProgressState} from './ReinforcementQuizModal';
import {groupQuizQuestions,orderedSafeInsertion} from './orderedQuiz';

type Session = Omit<QuizProgressState, 'lessonId'|'baseQuestions'|'soundEnabled'|'challenge'>;
export type ChallengeCard = {
  difficulty: 1|2|3; value: number; misses: number; correctStreak: number;
  creditedStage: number; earned: number; needsRecovery: boolean; secured: boolean;
  hintCreditUsed: boolean; scoreCap: number|null; firstTryClean: boolean|null;
  typedRecallUnlocked: boolean;
};
export type ChallengeAward = {
  questionId: string; points: number; multiplier: number;
  status: 'missed'|'assisted'|'building'|'secured'; nextAfter: number|null;
  heartsRestored: number;
};
export type QuizChallenge = {
  version: 1; id: string; score: number; personalBest: number; bestMultiplier: number;
  cards: Record<string, ChallengeCard>; lastAward: ChallengeAward|null;
  helpUsed: boolean; slip: boolean; practice: Session; paused?: Session;
  hearts: number; correctTowardHeart: number; outOfHearts: boolean;
};

export const difficultyLabels = ['Core', 'Challenging', 'Advanced'] as const;
export function comboMultiplier(streak: number) {
  return streak >= 10 ? 2 : streak >= 5 ? 1.5 : streak >= 3 ? 1.25 : 1;
}
export function isChallenge(state: QuizProgressState) {
  return state.activeSetIndex === -1 && Boolean(state.challenge);
}
export function challengeRequiresTyping(state: QuizProgressState) {
  return isChallenge(state) && !state.viewingQuestionId && Boolean(state.queue[state.cursor]?.requiresTypedRecall);
}
function session(state: QuizProgressState): Session {
  const {lessonId: _id, baseQuestions: _questions, soundEnabled: _sound, challenge: _challenge, ...rest} = state;
  return {...rest, isVerifyingSemantic: false};
}
function shuffled<T>(items: T[], seed: number) {
  const result = [...items]; let x = (seed | 0) || 1;
  for (let i = result.length - 1; i > 0; i--) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    const j = (x >>> 0) % (i + 1); [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function retry(card: ActiveCard, turn: number, trap: string): ActiveCard {
  const order = shuffled(card.options.map((_, i) => i), turn * 7919 + card.id.length);
  return {...card, options: order.map(i => card.options[i]), correctIndex: order.indexOf(card.correctIndex),
    attemptNumber: card.attemptNumber + 1, isReinforcement: true, isSpacedRecall: true, priorTrapOptionText: trap};
}

/** An All Questions run includes practiced cards too; set progress is saved separately. */
export function startChallenge(state: QuizProgressState, seed = Date.now()): QuizProgressState {
  const practiceState = isChallenge(state) ? {...state, ...state.challenge!.practice} : state;
  const cards: QuizChallenge['cards'] = {};
  for (const q of state.baseQuestions) {
    const prior = state.challenge?.cards[q.id];
    const struggled = practiceState.everMissedIds.includes(q.id) || (practiceState.attemptsByQuestion[q.id] || 0) > 1 || Boolean(prior && (prior.misses || (prior.needsRecovery && !prior.secured)));
    const declared = q.difficulty === 'hard' ? 3 : q.difficulty === 'medium' ? 2 : q.difficulty === 'easy' ? 1 : null;
    const kind = q.kind === 'safeguard' || (q.kind === 'multi_item' && (q.expectedItems?.length || 0) >= 4) ? 3 : q.kind === 'concept' ? 1 : 2;
    const difficulty = Math.min(3, (declared ?? kind) + (struggled ? 1 : 0)) as 1|2|3;
    cards[q.id] = {difficulty, value: [100,150,200][difficulty - 1], misses: 0, correctStreak: 0,
      creditedStage: 0, earned: 0, needsRecovery: struggled, secured: false, hintCreditUsed: false, scoreCap: null, firstTryClean: null, typedRecallUnlocked: false};
  }
  return {...state, activeSetIndex: -1,
    queue: shuffled(groupQuizQuestions(state.baseQuestions), seed).flat().map(q => ({...q, roundNumber: 1, attemptNumber: 1, isReinforcement: false})),
    cursor: 0, reinforcementQueue: [], round: 1, selectedOption: null, showHint: false,
    masteredIds: [], everMissedIds: [], attemptsByQuestion: {}, historyByQuestion: {}, viewingQuestionId: null,
    streak: 0, bestStreak: 0, totalSubmissions: 0, completed: state.baseQuestions.length === 0, setCompleted: state.baseQuestions.length === 0,
    memoryLocked: false, typedInput: '', typedFeedback: null, recalledItems: [], multiItemRevealed: false, isVerifyingSemantic: false,
    challenge: {version: 1, id: `${seed}-${state.lessonId}`, score: 0,
      personalBest: Math.max(state.challenge?.personalBest || 0, state.challenge?.score || 0), bestMultiplier: 1,
      cards, lastAward: null, helpUsed: false, slip: false, hearts: 5, correctTowardHeart: 0, outOfHearts: false, practice: session(practiceState)}};
}
export function resumeChallenge(state: QuizProgressState, seed = Date.now()): QuizProgressState {
  if (isChallenge(state)) return state;
  if (!state.challenge?.paused) return startChallenge(state, seed);
  return {...state, ...state.challenge.paused,
    challenge: {...state.challenge, practice: session(state), paused: undefined}};
}
export function pauseChallenge(state: QuizProgressState): QuizProgressState {
  if (!isChallenge(state)) return state;
  const masteredIds = [...new Set([...state.challenge!.practice.masteredIds, ...state.masteredIds])];
  return {...state, ...state.challenge!.practice, masteredIds,
    challenge: {...state.challenge!, paused: session(state)}};
}
export function challengeHelp(state: QuizProgressState, slip = false): QuizProgressState {
  if (!isChallenge(state) || state.selectedOption !== null || state.viewingQuestionId) return state;
  return {...state, streak: slip ? 0 : state.streak,
    challenge: {...state.challenge!, helpUsed: true, slip: state.challenge!.slip || slip}};
}

export type ChallengeAnswer = {
  runId: string; questionId: string; attemptNumber: number; correct: boolean;
  selectedOption: number; typedFeedback?: QuizProgressState['typedFeedback'];
  recalledItems?: string[]; revealed?: boolean; trap?: string;
};
/** Grade once, credit each recall milestone once, and keep only one future copy. */
export function answerChallenge(state: QuizProgressState, answer: ChallengeAnswer): QuizProgressState {
  const run = state.challenge, card = state.queue[state.cursor];
  if (!isChallenge(state) || !run || run.outOfHearts || run.id !== answer.runId || state.completed || state.viewingQuestionId ||
    state.selectedOption !== null || !card || card.id !== answer.questionId || card.attemptNumber !== answer.attemptNumber) return state;
  const old = run.cards[card.id]; if (!old || old.secured) return state;
  if (challengeRequiresTyping(state) && !answer.typedFeedback && !answer.revealed) return state;
  const stats = {...old}; const assisted = run.helpUsed || Boolean(answer.revealed);
  if (answer.correct) stats.typedRecallUnlocked = true;
  const hardMode = state.isHardMode || challengeRequiresTyping(state);
  stats.firstTryClean ??= answer.correct && !assisted;
  let streak = 0, stage = 0, credit = 0, status: ChallengeAward['status']; let gap: number|null;
  if (!answer.correct) {
    stats.misses++; stats.correctStreak = 0; stats.needsRecovery = true;
    gap = Math.max(1, 4 - stats.misses); status = 'missed';
  } else if (assisted) {
    stats.needsRecovery = true; stats.correctStreak = 0;
    if (run.slip) stats.misses++;
    credit = stats.hintCreditUsed ? 0 : .25; stats.hintCreditUsed = true;
    gap = 3; status = 'assisted';
  } else {
    streak = state.streak + 1;
    stats.correctStreak++;
    if (!stats.needsRecovery) {stage = 3; credit = 1; stats.secured = true;}
    else {
      stage = Math.min(3, stats.correctStreak);
      credit = stage > stats.creditedStage ? [.5,.3,.2][stage - 1] : 0;
      stats.secured = stage === 3;
    }
    stats.creditedStage = Math.max(stats.creditedStage, stage);
    gap = stats.secured ? null : stats.correctStreak === 1 ? 3 : 10;
    status = stats.secured ? 'secured' : 'building';
  }
  const multiplier = comboMultiplier(streak);
  // Freeze the budget on the first attempt: deliberately missing or using hints
  // must never unlock more points than a clean first answer could earn.
  stats.scoreCap ??= Math.round(stats.value * comboMultiplier(state.streak + 1) *
    (hardMode ? 1.2 : 1) * (assisted ? .75 : 1));
  const points = Math.max(0, Math.min(stats.scoreCap - stats.earned,
    Math.round(stats.value * credit * multiplier * (hardMode && !assisted ? 1.2 : 1))));
  stats.earned += points;
  const future = state.queue.slice(state.cursor + 1).filter(q => q.id !== card.id);
  const nextAfter = gap === null ? null : orderedSafeInsertion(future, gap);
  if (nextAfter !== null) future.splice(nextAfter, 0, {...retry(card, state.totalSubmissions + 1, answer.trap || card.priorTrapOptionText || ''), requiresTypedRecall: stats.typedRecallUnlocked});
  const cards = {...run.cards, [card.id]: stats};
  const score = run.score + points;
  let hearts = run.hearts, correctTowardHeart = run.correctTowardHeart, heartsRestored = 0;
  if (!answer.correct) hearts = Math.max(0, hearts - 1);
  else if (++correctTowardHeart === 5) {
    heartsRestored = Math.min(.5, 5 - hearts);
    hearts += heartsRestored; correctTowardHeart = 0;
  }
  return {...state, queue: [card, ...future], cursor: 0, selectedOption: answer.selectedOption,
    typedInput: '', typedFeedback: answer.typedFeedback ?? null, recalledItems: answer.recalledItems ?? [],
    multiItemRevealed: Boolean(answer.revealed), isVerifyingSemantic: false,
    totalSubmissions: state.totalSubmissions + 1, streak, bestStreak: Math.max(state.bestStreak, streak),
    attemptsByQuestion: {...state.attemptsByQuestion, [card.id]: (state.attemptsByQuestion[card.id] || 0) + 1},
    historyByQuestion: {...state.historyByQuestion, [card.id]: {selectedOption: answer.selectedOption,
      typedFeedback: answer.typedFeedback ?? null, recalledItems: answer.recalledItems ?? [], multiItemRevealed: Boolean(answer.revealed), isCorrect: answer.correct}},
    everMissedIds: stats.misses > 0 && !state.everMissedIds.includes(card.id) ? [...state.everMissedIds, card.id] : state.everMissedIds,
    masteredIds: Object.keys(cards).filter(id => cards[id].secured), reinforcementQueue: [],
    challenge: {...run, cards, score, hearts, correctTowardHeart, outOfHearts: hearts === 0, personalBest: Math.max(run.personalBest, score),
      bestMultiplier: Math.max(run.bestMultiplier, multiplier),
      lastAward: {questionId: card.id, points, multiplier, status, nextAfter, heartsRestored}}};
}
export function advanceChallenge(state: QuizProgressState): QuizProgressState {
  if (!isChallenge(state) || state.selectedOption === null || state.viewingQuestionId || state.completed) return state;
  const queue = state.challenge!.outOfHearts ? [] : state.queue.slice(state.cursor + 1);
  const completed = state.challenge!.outOfHearts || (queue.length === 0 && Object.values(state.challenge!.cards).every(q => q.secured));
  return {...state, queue, cursor: 0, selectedOption: null, showHint: false, memoryLocked: false,
    typedInput: '', typedFeedback: null, recalledItems: [], multiItemRevealed: false, viewingQuestionId: null,
    completed, setCompleted: completed, challenge: {...state.challenge!, helpUsed: false, slip: false, lastAward: null}};
}

type Storage = Pick<globalThis.Storage,'getItem'|'setItem'>;
function storageKey(state: QuizProgressState) {
  const text = JSON.stringify(state.baseQuestions);
  let hash = 2166136261; for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `qweeps.quiz.challenge.v1:${state.lessonId}:${hash >>> 0}`;
}
export function saveChallenge(state: QuizProgressState, storage?: Storage): boolean {
  if (!state.challenge) return true;
  try {
    const target = storage ?? window.localStorage;
    target.setItem(storageKey(state), JSON.stringify({version: 1, run: {...state.challenge,
      practice: isChallenge(state) ? state.challenge.practice : session(state)},
      active: isChallenge(state), session: isChallenge(state) ? session(state) : state.challenge.paused}));
    return true;
  } catch {return false;}
}
export function restoreChallenge(state: QuizProgressState, storage?: Storage): QuizProgressState {
  try {
    const raw = (storage ?? window.localStorage).getItem(storageKey(state)); if (!raw) return state;
    const saved = JSON.parse(raw), run = saved.run as QuizChallenge, s = saved.session as Session;
    // Runs saved before hearts were introduced retain their earned score.
    if (run) {
      run.hearts ??= 5; run.correctTowardHeart ??= 0; run.outOfHearts ??= false;
      for (const c of Object.values(run.cards || {})) c.typedRecallUnlocked ??= c.correctStreak > 0;
      if (Array.isArray(s?.queue)) s.queue = s.queue.map((q,i) => q.requiresTypedRecall === undefined &&
        q.isReinforcement && run.cards?.[q.id]?.typedRecallUnlocked && (i !== s.cursor || s.selectedOption === null)
        ? {...q, requiresTypedRecall: true} : q);
    }
    const integer = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
    const ids = new Set(state.baseQuestions.map(q => q.id));
    const knownIds = (v: unknown): v is string[] => Array.isArray(v) && v.every(id => typeof id === 'string' && ids.has(id));
    const feedback = (v: Session['typedFeedback']) => v === null || (v && ['correct','wrong','revealed'].includes(v.status) && typeof v.userText === 'string');
    const validSession = (v: Session) => v && Array.isArray(v.queue) && Array.isArray(v.reinforcementQueue) &&
      integer(v.cursor) && (v.queue.length === 0 ? v.cursor === 0 : v.cursor < v.queue.length) &&
      Number.isInteger(v.activeSetIndex) && v.activeSetIndex >= -1 && v.activeSetIndex < state.baseQuestions.length &&
      [v.round,v.streak,v.bestStreak,v.totalSubmissions].every(integer) &&
      [v.showHint,v.completed,v.setCompleted,v.isHardMode,v.rapidScan,v.memoryLocked,v.multiItemRevealed].every(x => typeof x === 'boolean') &&
      (v.selectedOption === null || Number.isInteger(v.selectedOption)) && typeof v.typedInput === 'string' && feedback(v.typedFeedback) &&
      knownIds(v.masteredIds) && knownIds(v.everMissedIds) &&
      (v.viewingQuestionId === null || ids.has(v.viewingQuestionId)) &&
      Array.isArray(v.recalledItems) && v.recalledItems.every(x => typeof x === 'string') &&
      v.attemptsByQuestion && Object.entries(v.attemptsByQuestion).every(([id,n]) => ids.has(id) && integer(n)) &&
      v.historyByQuestion && Object.entries(v.historyByQuestion).every(([id,h]) => ids.has(id) && h &&
        typeof h.isCorrect === 'boolean' && feedback(h.typedFeedback) &&
        (h.selectedOption === null || Number.isInteger(h.selectedOption))) &&
      [...v.queue,...v.reinforcementQueue].every(q => q && Array.isArray(q.options) && q.options.every(o => typeof o === 'string') &&
        (q.requiresTypedRecall === undefined || typeof q.requiresTypedRecall === 'boolean') &&
        integer(q.attemptNumber) && q.attemptNumber > 0 && integer(q.roundNumber) &&
        state.baseQuestions.some(base => base.id === q.id && base.options.length === q.options.length &&
          base.options.every(o => q.options.includes(o)) && base.options[base.correctIndex] === q.options[q.correctIndex]));
    if (saved.version !== 1 || typeof saved.active !== 'boolean' || !run || run.version !== 1 || typeof run.id !== 'string' ||
      !integer(run.score) || !integer(run.personalBest) || run.personalBest < run.score || ![1,1.25,1.5,2].includes(run.bestMultiplier) ||
      typeof run.helpUsed !== 'boolean' || typeof run.slip !== 'boolean' ||
      !integer(run.hearts * 2) || run.hearts > 5 || !integer(run.correctTowardHeart) || run.correctTowardHeart >= 5 ||
      typeof run.outOfHearts !== 'boolean' || run.outOfHearts !== (run.hearts === 0) ||
      !validSession(s) || s.activeSetIndex !== -1 || (!s.queue.length && !s.completed) ||
      !validSession(run.practice) || run.practice.activeSetIndex < 0 || !run.cards || Object.keys(run.cards).length !== ids.size ||
      state.baseQuestions.some(q => {
        const c = run.cards[q.id];
        return !c || ![1,2,3].includes(c.difficulty) || c.value !== [100,150,200][c.difficulty - 1] ||
          ![c.misses,c.correctStreak,c.creditedStage,c.earned].every(integer) || c.creditedStage > 3 ||
          (c.scoreCap !== null && (!integer(c.scoreCap) || c.scoreCap > c.value * 2.4 || c.earned > c.scoreCap)) ||
          (c.scoreCap === null && c.earned !== 0) ||
          [c.needsRecovery,c.secured,c.hintCreditUsed,c.typedRecallUnlocked].some(x => typeof x !== 'boolean') ||
          (c.firstTryClean !== null && typeof c.firstTryClean !== 'boolean');
      }) || Object.values(run.cards).reduce((sum,c) => sum + c.earned,0) !== run.score ||
      s.masteredIds.length !== Object.values(run.cards).filter(c => c.secured).length ||
      s.masteredIds.some(id => !run.cards[id].secured) ||
      (s.completed && !run.outOfHearts && Object.values(run.cards).some(c => !c.secured)) ||
      (run.lastAward !== null && (!ids.has(run.lastAward.questionId) || !integer(run.lastAward.points) ||
        ![1,1.25,1.5,2].includes(run.lastAward.multiplier) || !['missed','assisted','building','secured'].includes(run.lastAward.status) ||
        (run.lastAward.nextAfter !== null && !integer(run.lastAward.nextAfter))))) return state;
    const game = session({...state, ...s});
    const practice = session({...state, ...run.practice});
    const restored = {...run, practice, paused: undefined};
    if (saved.active) return {...state, ...game, challenge: restored};
    return {...state, ...practice, challenge: {...restored, paused: game}};
  } catch {return state;}
}
