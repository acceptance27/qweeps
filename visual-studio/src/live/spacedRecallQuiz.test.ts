import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitOptionHook,
  getCardKeyHook,
  createInitialQuizState,
  partitionQuizSets,
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

test('partitionQuizSets divides by 10 and increments up to 5 when the next quiz is less than 5', () => {
  // Empty
  assert.deepEqual(partitionQuizSets([]), []);

  // Small counts (< 10)
  assert.equal(partitionQuizSets(Array.from({ length: 4 }, (_, i) => i)).length, 1);
  assert.equal(partitionQuizSets(Array.from({ length: 9 }, (_, i) => i)).length, 1);
  assert.equal(partitionQuizSets(Array.from({ length: 10 }, (_, i) => i)).length, 1);

  // 11 to 14: next would have 1 to 4 (< 5), so increment set up to 14
  const set11 = partitionQuizSets(Array.from({ length: 11 }, (_, i) => i));
  assert.equal(set11.length, 1);
  assert.equal(set11[0].length, 11);

  const set14 = partitionQuizSets(Array.from({ length: 14 }, (_, i) => i));
  assert.equal(set14.length, 1);
  assert.equal(set14[0].length, 14);

  // 15: splits into 10 and 5 because 5 is not less than 5
  const set15 = partitionQuizSets(Array.from({ length: 15 }, (_, i) => i));
  assert.equal(set15.length, 2);
  assert.deepEqual(set15.map(s => s.length), [10, 5]);

  // 20: 10 and 10
  const set20 = partitionQuizSets(Array.from({ length: 20 }, (_, i) => i));
  assert.deepEqual(set20.map(s => s.length), [10, 10]);

  // 23: next would have 3 (< 5), so set 2 absorbs to 13
  const set23 = partitionQuizSets(Array.from({ length: 23 }, (_, i) => i));
  assert.deepEqual(set23.map(s => s.length), [10, 13]);

  // 24: set 2 absorbs to 14
  const set24 = partitionQuizSets(Array.from({ length: 24 }, (_, i) => i));
  assert.deepEqual(set24.map(s => s.length), [10, 14]);

  // 25: 10, 10, 5
  const set25 = partitionQuizSets(Array.from({ length: 25 }, (_, i) => i));
  assert.deepEqual(set25.map(s => s.length), [10, 10, 5]);

  // 44: 10, 10, 10, 14 (last set incremented by 4 so no trailing set < 5)
  const set44 = partitionQuizSets(Array.from({ length: 44 }, (_, i) => i));
  assert.deepEqual(set44.map(s => s.length), [10, 10, 10, 14]);

  // 48 (Rizal Morga PDF reviewer): 10, 10, 10, 10, 8 (8 >= 5)
  const set48 = partitionQuizSets(Array.from({ length: 48 }, (_, i) => i));
  assert.deepEqual(set48.map(s => s.length), [10, 10, 10, 10, 8]);

  // Verify that for all counts between 5 and 60, no set has fewer than 5 items
  for (let n = 5; n <= 60; n++) {
    const partitioned = partitionQuizSets(Array.from({ length: n }, (_, i) => i));
    const total = partitioned.reduce((acc, s) => acc + s.length, 0);
    assert.equal(total, n, `Total items must equal ${n}`);
    for (const s of partitioned) {
      assert.ok(s.length >= 5, `Every set must have at least 5 items for n=${n}, got ${s.length}`);
    }
  }
});

test('createInitialQuizState focuses on Set 1 of partitioned sets for large quizzes', () => {
  const dummy48: QuizQuestion[] = Array.from({ length: 48 }, (_, i) => ({
    id: `q-${i}`,
    chapterId: `ch-${i}`,
    chapterIndex: i,
    chapterTitle: `Beat ${i + 1}`,
    kind: 'concept' as const,
    prompt: `Question ${i + 1}`,
    options: ['A', 'B', 'C', 'D'],
    correctIndex: 0,
    explanation: `Explanation ${i + 1}`,
  }));

  const lesson: LiveLesson = {
    id: 'reviewer_48',
    title: 'Rizal Morga Reviewer',
    chapters: [],
    quiz: dummy48,
  };

  const state = createInitialQuizState(lesson);
  assert.equal(state.baseQuestions.length, 48);
  assert.equal(state.activeSetIndex, 0);
  assert.equal(state.queue.length, 10); // First set has 10 cards
  assert.equal(state.queue[0].id, 'q-0');
  assert.equal(state.queue[9].id, 'q-9');
  assert.equal(state.viewingQuestionId, null);
  assert.equal(state.setCompleted, false);
});
