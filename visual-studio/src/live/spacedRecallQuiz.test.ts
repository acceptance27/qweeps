import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitOptionHook,
  getCardKeyHook,
  createInitialQuizState,
  partitionQuizSets,
  getQuizSets,
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
    question: 'Test',
    duration: 60,
    sources: [],
    chapters: Array.from({ length: 6 }, (_, i) => ({
      id: `ch-${i}`,
      title: `Beat ${i + 1}`,
      cues: [],
    })) as any,
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

test('createInitialQuizState focuses on Set 1 of generic partitioned sets for large quizzes', () => {
  const dummy48: QuizQuestion[] = Array.from({ length: 48 }, (_, i) => ({
    id: `q-${i}`,
    chapterId: `ch-${i}`,
    chapterIndex: i,
    chapterTitle: `Generic Beat ${i + 1}`,
    kind: 'concept' as const,
    prompt: `Question ${i + 1}`,
    options: ['A', 'B', 'C', 'D'],
    correctIndex: 0,
    explanation: `Explanation ${i + 1}`,
  }));

  const lesson: LiveLesson = {
    id: 'generic_48',
    title: 'Generic Large Quiz',
    question: 'Generic',
    duration: 60,
    sources: [],
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

test('getQuizSets partitions 48-question Rizal Morga reviewer into 4 thematic units', () => {
  const chapterSpecs = [
    { chapterId: 'bakit-morga', title: 'Why Morga Was Chosen', count: 6 },
    { chapterId: 'sucesos-1609', title: 'Who Was Morga and What Was Sucesos?', count: 7 },
    { chapterId: 'london-loci', title: 'London: Three Reasons, Three Landmarks', count: 8 },
    { chapterId: 'tripartite', title: 'Bipartite vs. Tripartite View of History', count: 6 },
    { chapterId: 'apat-anotasyon', title: "Rizal's Four Core Annotations", count: 7 },
    { chapterId: 'paris-samahan', title: 'Kidlat Club, Indios Bravos, and R.D.L.M.', count: 7 },
    { chapterId: 'tugon-kritiko', title: 'How Rizal Answered His Critics', count: 7 },
  ];

  let qCount = 0;
  const questions: QuizQuestion[] = [];
  chapterSpecs.forEach((spec, cIdx) => {
    for (let i = 0; i < spec.count; i++) {
      qCount++;
      questions.push({
        id: `q-${spec.chapterId}-${i}`,
        chapterId: spec.chapterId,
        chapterIndex: cIdx,
        chapterTitle: spec.title,
        kind: 'concept',
        prompt: `Question ${qCount}`,
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 0,
        explanation: 'Exp',
      });
    }
  });

  assert.equal(questions.length, 48);

  const units = getQuizSets(questions);
  assert.equal(units.length, 4, 'Must create exactly 4 thematic units');

  // Unit 1: The Source & The Jurist (13 Qs: 6 bakit-morga + 7 sucesos-1609)
  assert.equal(units[0].title, 'Unit 1: The Source & The Jurist');
  assert.equal(units[0].shortTitle, '1. Source & Jurist');
  assert.equal(units[0].subtitle, 'Why Morga Was Chosen & Sucesos 1609');
  assert.equal(units[0].questions.length, 13);
  assert.equal(units[0].startNumber, 1);
  assert.equal(units[0].endNumber, 13);
  assert.equal(units[0].questions[0].id, 'q-bakit-morga-0');
  assert.equal(units[0].questions[12].id, 'q-sucesos-1609-6');

  // Unit 2: Historical Method & Tripartite Framework (14 Qs: 8 london-loci + 6 tripartite)
  assert.equal(units[1].title, 'Unit 2: Historical Method & Tripartite Framework');
  assert.equal(units[1].shortTitle, '2. Historical Method');
  assert.equal(units[1].subtitle, 'London Research, British Museum & Bipartite vs Tripartite History');
  assert.equal(units[1].questions.length, 14);
  assert.equal(units[1].startNumber, 14);
  assert.equal(units[1].endNumber, 27);
  assert.equal(units[1].questions[0].id, 'q-london-loci-0');
  assert.equal(units[1].questions[13].id, 'q-tripartite-5');

  // Unit 3: Pre-Colonial Culture & Annotations (7 Qs: 7 apat-anotasyon)
  assert.equal(units[2].title, 'Unit 3: Pre-Colonial Culture & Annotations');
  assert.equal(units[2].shortTitle, '3. Culture & Annotations');
  assert.equal(units[2].subtitle, "Rizal's Four Core Historical Corrections");
  assert.equal(units[2].questions.length, 7);
  assert.equal(units[2].startNumber, 28);
  assert.equal(units[2].endNumber, 34);
  assert.equal(units[2].questions[0].id, 'q-apat-anotasyon-0');
  assert.equal(units[2].questions[6].id, 'q-apat-anotasyon-6');

  // Unit 4: Propaganda Societies & Defense Against Critics (14 Qs: 7 paris-samahan + 7 tugon-kritiko)
  assert.equal(units[3].title, 'Unit 4: Propaganda Societies & Defense Against Critics');
  assert.equal(units[3].shortTitle, '4. Propaganda & Defense');
  assert.equal(units[3].subtitle, 'Paris Samahan (Kidlat, Indios Bravos, RDLM) & Rebutting Spanish Critics');
  assert.equal(units[3].questions.length, 14);
  assert.equal(units[3].startNumber, 35);
  assert.equal(units[3].endNumber, 48);
  assert.equal(units[3].questions[0].id, 'q-paris-samahan-0');
  assert.equal(units[3].questions[13].id, 'q-tugon-kritiko-6');

  // Total questions across units
  const totalInUnits = units.reduce((acc, u) => acc + u.questions.length, 0);
  assert.equal(totalInUnits, 48);
});

test('createInitialQuizState focuses on Unit 1 (13 cards) for the Rizal Morga reviewer', () => {
  const chapterSpecs = [
    { chapterId: 'bakit-morga', title: 'Why Morga Was Chosen', count: 6 },
    { chapterId: 'sucesos-1609', title: 'Who Was Morga and What Was Sucesos?', count: 7 },
    { chapterId: 'london-loci', title: 'London: Three Reasons, Three Landmarks', count: 8 },
    { chapterId: 'tripartite', title: 'Bipartite vs. Tripartite View of History', count: 6 },
    { chapterId: 'apat-anotasyon', title: "Rizal's Four Core Annotations", count: 7 },
    { chapterId: 'paris-samahan', title: 'Kidlat Club, Indios Bravos, and R.D.L.M.', count: 7 },
    { chapterId: 'tugon-kritiko', title: 'How Rizal Answered His Critics', count: 7 },
  ];

  let qCount = 0;
  const questions: QuizQuestion[] = [];
  chapterSpecs.forEach((spec, cIdx) => {
    for (let i = 0; i < spec.count; i++) {
      qCount++;
      questions.push({
        id: `q-${spec.chapterId}-${i}`,
        chapterId: spec.chapterId,
        chapterIndex: cIdx,
        chapterTitle: spec.title,
        kind: 'concept',
        prompt: `Question ${qCount}`,
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 0,
        explanation: 'Exp',
      });
    }
  });

  const lesson: LiveLesson = {
    id: 'rizal_morga_reviewer',
    title: "Who May Tell the Philippines' Past? Rizal Annotates Morga",
    question: 'Reviewer',
    duration: 60,
    sources: [],
    chapters: [],
    quiz: questions,
  };

  const state = createInitialQuizState(lesson);
  assert.equal(state.baseQuestions.length, 48);
  assert.equal(state.activeSetIndex, 0);
  assert.equal(state.queue.length, 13); // Unit 1 has 13 cards!
  assert.equal(state.queue[0].id, 'q-bakit-morga-0');
  assert.equal(state.queue[12].id, 'q-sucesos-1609-6');
  assert.equal(state.viewingQuestionId, null);
  assert.equal(state.setCompleted, false);
});
