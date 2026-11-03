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

test('3-Card Short-Horizon Spaced Recall inserts missed card 3 steps later with prior trap tracking', () => {
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

  // Suppose user misses card at cursor 0 by selecting option 2 ('Gamma')
  const missedCard = state.queue[state.cursor];
  const priorTrap = missedCard.options[2];

  const retryCard: ActiveCard = {
    ...missedCard,
    isReinforcement: true,
    isSpacedRecall: true,
    priorTrapOptionText: priorTrap,
  };

  const insertPos = Math.min(state.queue.length, state.cursor + 3);
  assert.equal(insertPos, 3);

  const nextQueue = [
    ...state.queue.slice(0, insertPos),
    retryCard,
    ...state.queue.slice(insertPos),
  ];

  // Sequence:
  // Step 0: q-0 (missed)
  // Step 1: q-1
  // Step 2: q-2
  // Step 3: retryCard for q-0 (returns exactly 3 steps later!)
  assert.equal(nextQueue.length, 7);
  assert.equal(nextQueue[3].id, 'q-0');
  assert.equal(nextQueue[3].isSpacedRecall, true);
  assert.equal(nextQueue[3].priorTrapOptionText, 'Gamma');
});
