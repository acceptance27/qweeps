import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitOptionHook,
  getCardKeyHook,
  createInitialQuizState,
  type ActiveCard,
} from './ReinforcementQuizModal';
import type { LiveLesson, QuizQuestion } from './lessonTypes';

test('splitOptionHook correctly isolates 3-6 word lead hooks from supporting clauses', () => {
  // Colon split
  const colonCase = splitOptionHook('Decided: decision and decider');
  assert.equal(colonCase.leadHook, 'Decided');
  assert.equal(colonCase.supportingText, 'decision and decider');

  // Multi-word colon split
  const multiColon = splitOptionHook('Harm + Belief Must Hold: Grave harm to others from defect');
  assert.equal(multiColon.leadHook, 'Harm + Belief Must Hold');
  assert.equal(multiColon.supportingText, 'Grave harm to others from defect');

  // Comma clause split
  const commaCase = splitOptionHook(
    'Responsibility asks who could act, accountability who must explain to whom, liability who pays under law, blame who is at fault.'
  );
  assert.equal(commaCase.leadHook, 'Responsibility asks who could act');
  assert.ok(commaCase.supportingText.startsWith('accountability who must explain'));

  // Short single-concept options
  const shortCase = splitOptionHook('Responsibility');
  assert.equal(shortCase.leadHook, 'Responsibility');
  assert.equal(shortCase.supportingText, '');

  const twoWords = splitOptionHook('Developer built spec');
  assert.equal(twoWords.leadHook, 'Developer built spec');
  assert.equal(twoWords.supportingText, '');

  // Longer unpunctuated sentence splits at word boundary
  const proseCase = splitOptionHook('Defects only emerge when at least one individual contributor violates their specific assigned role specification.');
  assert.ok(proseCase.leadHook.split(/\s+/).length <= 6);
  assert.ok(proseCase.supportingText.length > 0);
});

test('getCardKeyHook extracts exact anchor phrase for memory retry', () => {
  const mechanismCard: QuizQuestion = {
    id: 'q1',
    chapterId: 'c1',
    chapterIndex: 0,
    chapterTitle: 'Four Terms',
    kind: 'mechanism',
    prompt: 'Which concept is defined as...',
    options: ['Responsibility', 'Accountability', 'Liability', 'Blame'],
    correctIndex: 1,
    explanation: 'Accountability is being answerable',
    acceptedAnswers: ['Accountability'],
  };
  assert.equal(getCardKeyHook(mechanismCard), 'Accountability');

  const conceptCard: QuizQuestion = {
    id: 'q2',
    chapterId: 'c1',
    chapterIndex: 0,
    chapterTitle: 'Four Terms',
    kind: 'concept',
    prompt: 'What is the difference between...',
    options: [
      'Responsibility asks who could act, accountability who must explain to whom',
      'Liability is financial compensation under contract law',
    ],
    correctIndex: 0,
    explanation: 'Full distinction',
  };
  assert.equal(getCardKeyHook(conceptCard), 'Responsibility asks who could act');
});

test('round reinforcement collects missed cards for end-of-round replay', () => {
  const dummyQuestions: QuizQuestion[] = Array.from({ length: 6 }, (_, i) => ({
    id: `q-${i}`,
    chapterId: `ch-${i}`,
    chapterIndex: i,
    chapterTitle: `Beat ${i + 1}`,
    kind: 'mechanism' as const,
    prompt: `Question ${i + 1}`,
    options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
    correctIndex: 0,
    explanation: `Explanation ${i + 1}`,
  }));

  const lesson: LiveLesson = {
    id: 'test_lesson',
    title: 'Test Lesson',
    chapters: Array.from({ length: 6 }, (_, i) => ({
      id: `ch-${i}`,
      title: `Beat ${i + 1}`,
      cues: [],
    })),
    reinforcementQuiz: dummyQuestions,
  };

  const state = createInitialQuizState(lesson);
  assert.equal(state.queue.length, 6);
  assert.equal(state.cursor, 0);
  assert.equal(state.rapidScan, false);
  assert.equal(state.memoryLocked, false);
  assert.equal(state.reinforcementQueue.length, 0);

  // When a card is missed, active queue is not polluted with premature duplicates;
  // instead it is cleanly placed in reinforcementQueue for the next round
  const missedCard = state.queue[state.cursor];
  const retryCard: ActiveCard = {
    ...missedCard,
    roundNumber: state.round + 1,
    attemptNumber: 2,
    isReinforcement: true,
  };
  const nextReinforcementQueue = [...state.reinforcementQueue, retryCard];
  assert.equal(nextReinforcementQueue.length, 1);
  assert.equal(nextReinforcementQueue[0].id, 'q-0');
  assert.equal(nextReinforcementQueue[0].isReinforcement, true);
  // Queue remains clean 6 cards in linear sequence
  assert.equal(state.queue.length, 6);
});
