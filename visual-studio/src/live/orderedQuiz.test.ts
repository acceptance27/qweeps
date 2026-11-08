import test from 'node:test';
import assert from 'node:assert/strict';
import type {LiveLesson, QuizQuestion} from './lessonTypes';
import {ensureLessonQuiz} from './lessonTypes';
import {expandOrderedQuestions,partitionOrderedQuestions} from './orderedQuiz';
import {createInitialQuizState,getQuizSets,type QuizProgressState} from './ReinforcementQuizModal';
import {startChallenge,answerChallenge,advanceChallenge,challengeRequiresTyping,saveChallenge,restoreChallenge} from './quizChallenge';

const ordered:QuizQuestion={id:'london',kind:'ordered_cloze',chapterId:'london',chapterTitle:'London',chapterIndex:0,
  prompt:'Improve ____, continue ____ safely, ____ the book, and ____ it with notes.',
  options:['English','reform','study','annotate','Spanish','commerce','translate','illustrate'],correctIndex:0,
  orderedAnswers:['English','reform','study','annotate'],orderedAliases:[['English'],['reform'],['study','studied'],['annotate','annotated']],
  orderedExplanations:['The language was English.','Reform continued safely.','Study the historical book.','Annotation adds notes.'],
  explanation:'Four related purposes.',difficulty:'medium'};
const lesson:LiveLesson={id:'ordered-test',title:'Ordered quiz',question:'Review',duration:0,sources:[],chapters:[],quiz:[ordered]};
function grade(s:QuizProgressState,correct=true) {
  const q=s.queue[s.cursor];
  return answerChallenge(s,{runId:s.challenge!.id,questionId:q.id,attemptNumber:q.attemptNumber,correct,
    selectedOption:correct?q.correctIndex:(q.correctIndex+1)%q.options.length,
    ...(challengeRequiresTyping(s)?{typedFeedback:{status:correct?'correct' as const:'wrong' as const,userText:correct?q.options[q.correctIndex]:'wrong'}}:{})});
}

test('each ordered blank becomes an independently graded card with its own aliases and feedback',()=>{
  const cards=ensureLessonQuiz(lesson);
  assert.equal(cards.length,4); assert.equal(new Set(cards.map(q=>q.id)).size,4);
  assert.deepEqual(cards.map(q=>q.options[q.correctIndex]),ordered.orderedAnswers);
  assert.deepEqual(cards.map(q=>q.explanation),ordered.orderedExplanations);
  assert.deepEqual(cards[2].acceptedAnswers,['study','studied']);
  assert.equal(cards[2].prompt.match(/____/g)?.length,1,'semantic grader receives a specific target');
  assert.equal(cards[2].orderedSlot?.prompt,ordered.prompt,'renderer retains all numbered blanks');
  assert.deepEqual(expandOrderedQuestions(cards),cards,'export/import does not expand twice');
});

test('All Questions mixes sentences but keeps their first-pass blanks in order',()=>{
  const two={...lesson,quiz:[ordered,{...ordered,id:'other'}]};
  for(let seed=1;seed<8;seed++) {
    const s=startChallenge(createInitialQuizState(two),seed);
    for(const id of ['london','other']) {
      const indices=s.queue.map((q,i)=>q.orderedSlot?.groupId===id?i:-1).filter(i=>i>=0);
      assert.deepEqual(indices,[indices[0],indices[0]+1,indices[0]+2,indices[0]+3]);
      assert.deepEqual(indices.map(i=>s.queue[i].orderedSlot!.index),[0,1,2,3]);
    }
  }
});

test('practice sets do not split an ordered sentence across set boundaries',()=>{
  const singles=Array.from({length:9},(_,i)=>({...ordered,id:`single-${i}`,kind:'concept' as const,orderedAnswers:undefined,orderedSlot:undefined,prompt:'One ____.'}));
  const questions=[...singles,...expandOrderedQuestions([ordered]),...singles.map(q=>({...q,id:`after-${q.id}`}))];
  for(const sets of [partitionOrderedQuestions(questions),getQuizSets(questions).map(s=>s.questions)]) {
    assert.equal(sets.flat().length,questions.length);
    assert.equal(sets.filter(s=>s.some(q=>q.orderedSlot)).length,1);
    assert.equal(sets.find(s=>s.some(q=>q.orderedSlot))!.filter(q=>q.orderedSlot).length,4);
  }
});

test('every correct blank awards a full answer, builds combo, and counts toward heart recovery',()=>{
  let s=startChallenge(createInitialQuizState({...lesson,quiz:[ordered,{...ordered,id:'other'}]}),3);
  s={...s,challenge:{...s.challenge!,hearts:4}};
  const expected=[150,150,188,188,225]; let score=0;
  for(let i=0;i<5;i++) {
    s=grade(s); score+=expected[i];
    assert.equal(s.totalSubmissions,i+1); assert.equal(s.masteredIds.length,i+1); assert.equal(s.challenge!.score,score);
    if(i===4) assert.equal(s.challenge!.hearts,4.5);
    s=advanceChallenge(s);
  }
});

test('a wrong blank costs one heart and recurs independently; a successful retry then requires typing',()=>{
  let s=startChallenge(createInitialQuizState(lesson),1); const first=s.queue[0].id;
  s=advanceChallenge(grade(s,false)); assert.equal(s.challenge!.hearts,4);
  assert.equal(s.queue[0].orderedSlot!.index,1,'continue filling left to right after reviewing the missed answer');
  for(let i=0;i<3;i++) s=advanceChallenge(grade(s));
  assert.equal(s.queue[0].id,first); assert.equal(s.queue[0].options.length,8);
  s=advanceChallenge(grade(s)); assert.equal(challengeRequiresTyping(s),true);
  assert.equal(s.queue.length,1,'successful sibling blanks are not needlessly repeated');
  s=advanceChallenge(grade(s)); s=advanceChallenge(grade(s));
  assert.equal(s.completed,true);
});

test('partial ordered sentences retain exact blank, score and previous answers after reload',()=>{
  let s=startChallenge(createInitialQuizState(lesson),2);
  s=advanceChallenge(grade(s)); s=advanceChallenge(grade(s));
  const data=new Map<string,string>(),storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
  saveChallenge(s,storage); const restored=restoreChallenge(createInitialQuizState(lesson),storage);
  assert.equal(restored.queue[0].orderedSlot!.index,2); assert.equal(restored.challenge!.score,300);
  assert.equal(Object.keys(restored.historyByQuestion).length,2);
  assert.deepEqual(restored.queue,s.queue);
});

test('a recall retry waits until the five-blank sentence is finished',()=>{
  const five={...ordered,prompt:'Improve ____, continue ____, ____ a book, ____ it, and ____ another text.',
    orderedAnswers:['English','reform','study','annotate','translate'],orderedAliases:undefined,orderedExplanations:undefined};
  let s=startChallenge(createInitialQuizState({...lesson,quiz:[five]}),2);
  s=grade(s,false);
  assert.equal(s.challenge!.lastAward!.nextAfter,4);
  assert.deepEqual(s.queue.slice(1,5).map(q=>q.orderedSlot!.index),[1,2,3,4]);
  assert.equal(s.queue[5].orderedSlot!.index,0);
});
