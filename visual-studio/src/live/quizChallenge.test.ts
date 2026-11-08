import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialQuizState, selectQuizSet, type QuizProgressState} from './ReinforcementQuizModal';
import type {LiveLesson, QuizQuestion} from './lessonTypes';
import {startChallenge, answerChallenge, advanceChallenge, challengeHelp, challengeRequiresTyping, comboMultiplier, pauseChallenge, resumeChallenge, saveChallenge, restoreChallenge} from './quizChallenge';

function practice(count = 16): QuizProgressState {
  const questions: QuizQuestion[] = Array.from({length: Math.max(3,count)}, (_,i) => ({
    id: `q${i}`, chapterId: 'chapter', chapterIndex: 0, chapterTitle: 'Example', kind: 'concept',
    prompt: `Fact ${i} is ____.`, options: [`Answer ${i}`,'Wrong B','Wrong C','Wrong D'], correctIndex: 0,
    explanation: `Explanation for fact ${i}.`, hint: 'A hint',
  }));
  const lesson: LiveLesson = {id: `challenge-test-${count}`,title:'Test',question:'Test',duration:1,sources:[],chapters:[],quiz:questions};
  const state = createInitialQuizState(lesson);
  return {...state,baseQuestions:questions.slice(0,count),queue:state.queue.slice(0,count)};
}
function grade(state: QuizProgressState, correct = true) {
  const card = state.queue[state.cursor];
  return answerChallenge(state,{runId:state.challenge!.id,questionId:card.id,attemptNumber:card.attemptNumber,
    correct,selectedOption:correct?card.correctIndex:(card.correctIndex+1)%4,
    ...(challengeRequiresTyping(state) ? {typedFeedback:{status:correct?'correct' as const:'wrong' as const,userText:correct?card.options[card.correctIndex]:'Wrong'}} : {})});
}
function play(state: QuizProgressState, correct = true) {return advanceChallenge(grade(state,correct));}
function until(state: QuizProgressState, id: string) {
  let n=0;
  while(state.queue[0]?.id!==id && n++<100) state=play(state);
  assert.equal(state.queue[0]?.id,id); return state;
}
function memory() {
  const data = new Map<string,string>();
  return {data,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
}

test('All Questions starts a separate mixed run including cards already mastered in practice',()=>{
  const p=practice(); p.masteredIds=p.baseQuestions.map(q=>q.id); p.completed=true;
  const s=selectQuizSet(p,-1,42);
  assert.equal(s.queue.length,16); assert.equal(s.masteredIds.length,0); assert.equal(s.completed,false);
  assert.notDeepEqual(s.queue.map(q=>q.id),p.baseQuestions.map(q=>q.id));
  assert.deepEqual(s.queue,startChallenge(p,42).queue,'seeded updates remain deterministic');
  assert.deepEqual(s.challenge!.practice.masteredIds,p.masteredIds);
});

test('difficulty uses explicit demand, legacy type, and personal difficulty, then freezes during a run',()=>{
  const p=practice(5);
  p.baseQuestions[0].difficulty='easy'; p.baseQuestions[1].difficulty='medium'; p.baseQuestions[2].difficulty='hard';
  p.baseQuestions[3].kind='safeguard'; p.everMissedIds=['q4'];
  let s=startChallenge(p,42);
  assert.deepEqual(Object.values(s.challenge!.cards).map(c=>c.value),[100,150,200,200,150]);
  const id=s.queue[0].id, original=s.challenge!.cards[id].value;
  s=grade(s,false); assert.equal(s.challenge!.cards[id].value,original);
});

test('clean streaks award combos at 3, 5 and 10; completion keeps a personal best on replay',()=>{
  let s=startChallenge(practice(10),4); let expected=0;
  for(let n=1;n<=10;n++) {
    s=grade(s); expected+=100*comboMultiplier(n);
    assert.equal(s.challenge!.score,expected); assert.equal(s.streak,n);
    assert.equal(s.challenge!.lastAward!.multiplier,comboMultiplier(n)); s=advanceChallenge(s);
  }
  assert.equal(s.completed,true); assert.equal(s.challenge!.bestMultiplier,2); assert.equal(s.bestStreak,10);
  const next=startChallenge(s,5);
  assert.equal(next.challenge!.score,0); assert.equal(next.challenge!.personalBest,expected);
  assert.equal(next.completed,false); assert.equal(next.queue.length,10);
});

test('successive misses shorten spacing to 3, 2, 1 OTHER cards and reset combos',()=>{
  let s=startChallenge(practice(30),42); const id=s.queue[0].id;
  for(const gap of [3,2,1,1]) {
    s=grade({...s,streak:8},false);
    assert.equal(s.streak,0); assert.equal(s.challenge!.lastAward!.nextAfter,gap);
    assert.equal(s.queue[gap+1].id,id); assert.equal(s.queue.filter(q=>q.id===id).length,2);
    s=until(advanceChallenge(s),id);
    assert.ok(s.queue.length<=30,'processed cards do not accumulate');
  }
});

test('weak cards need 3 consecutive clean recalls; second clean recall returns after 10 others',()=>{
  const p=practice(40), id=startChallenge(p,44).queue[0].id; p.everMissedIds=[id];
  let s=grade(startChallenge(p,44));
  assert.equal(s.challenge!.lastAward!.nextAfter,3); assert.equal(s.masteredIds.includes(id),false);
  s=until(advanceChallenge(s),id); s=grade(s);
  assert.equal(s.challenge!.lastAward!.nextAfter,10); assert.equal(s.queue[11].id,id);
  s=until(advanceChallenge(s),id); s=grade(s);
  assert.equal(s.challenge!.cards[id].correctStreak,3); assert.equal(s.challenge!.cards[id].secured,true);
  assert.equal(s.queue.filter(q=>q.id===id).length,1);
});

test('broken recall streaks cannot farm credit by repeating the same milestone',()=>{
  let s=startChallenge(practice(1),10); s=play(s,false); s=grade(s);
  assert.equal(s.challenge!.cards.q0.earned,50);
  s=play(advanceChallenge(s),false); s=grade(s);
  assert.equal(s.challenge!.lastAward!.points,0);
  s=play(advanceChallenge(s)); s=play(s);
  assert.equal(s.completed,true); assert.equal(s.challenge!.score,100);
  assert.equal(s.challenge!.cards.q0.firstTryClean,false);
});

test('hints and partial multi-item slips require unaided recalls with capped credit',()=>{
  let s=startChallenge(practice(1),10);
  s=grade(challengeHelp(s,true));
  assert.equal(s.streak,0); assert.equal(s.challenge!.cards.q0.misses,1);
  assert.equal(s.challenge!.lastAward!.status,'assisted'); assert.equal(s.challenge!.score,25);
  s=advanceChallenge(s); s=grade(challengeHelp(s));
  assert.equal(s.challenge!.lastAward!.points,0,'second assisted response adds no credit');
  s=advanceChallenge(s); for(let i=0;i<3;i++) s=play(s);
  assert.equal(s.completed,true); assert.equal(s.challenge!.score,75,'hint-assisted budget is lower than a clean first answer');
});

test('one- and two-card banks clamp spacing to available cards and always finish',()=>{
  for(const count of [1,2]) {
    let s=startChallenge(practice(count),10); s=play(s,false);
    let turns=0; while(!s.completed && turns++<20) s=play(s);
    assert.equal(s.completed,true); assert.equal(s.masteredIds.length,count); assert.ok(turns<=count+3);
  }
  assert.equal(startChallenge(practice(0),10).completed,true);
});

test('review, double clicks, late attempts, late runs, and advancing twice never award points',()=>{
  const s=startChallenge(practice(5),10), q=s.queue[0];
  const answer={runId:s.challenge!.id,questionId:q.id,attemptNumber:q.attemptNumber,correct:true,selectedOption:q.correctIndex};
  assert.equal(answerChallenge({...s,viewingQuestionId:'q1'},answer).challenge!.score,0);
  assert.equal(answerChallenge(s,{...answer,runId:'old'}),s);
  assert.equal(answerChallenge(s,{...answer,attemptNumber:99}),s);
  const graded=answerChallenge(s,answer); assert.equal(answerChallenge(graded,answer),graded);
  const next=advanceChallenge(graded); assert.equal(advanceChallenge(next),next);
});

test('typed grading and revealed answers use the same scheduler and hard-mode bonus',()=>{
  let s=startChallenge({...practice(1),isHardMode:true},10); const q=s.queue[0];
  s=answerChallenge(s,{runId:s.challenge!.id,questionId:q.id,attemptNumber:1,correct:true,selectedOption:q.correctIndex,
    typedFeedback:{status:'correct',userText:'Answer 0',semantic:true}});
  assert.equal(s.challenge!.score,120); assert.equal(s.historyByQuestion.q0.typedFeedback!.semantic,true);
  let revealed=startChallenge(practice(1),11);
  revealed=answerChallenge(revealed,{runId:revealed.challenge!.id,questionId:'q0',attemptNumber:1,correct:false,selectedOption:-1,revealed:true});
  assert.equal(revealed.challenge!.score,0); assert.equal(revealed.masteredIds.length,0); assert.equal(revealed.multiItemRevealed,true);
});

test('switching practice sets pauses the challenge; resuming preserves score, queue and answers',()=>{
  const p=practice(20); p.masteredIds=['q19'];
  const game=grade(startChallenge(p,44));
  let paused=selectQuizSet(game,1,45);
  assert.equal(paused.activeSetIndex,1); assert.equal(paused.challenge!.paused!.selectedOption,game.selectedOption);
  paused={...paused,typedInput:'practice work'};
  const resumed=selectQuizSet(paused,-1,46);
  assert.deepEqual(resumed.queue,game.queue); assert.equal(resumed.selectedOption,game.selectedOption);
  assert.equal(resumed.challenge!.score,game.challenge!.score); assert.equal(resumed.challenge!.practice.typedInput,'practice work');
  assert.equal(pauseChallenge(resumed).typedInput,'practice work');
});

test('active, answered, paused and completed runs survive reload; bank changes invalidate saves',()=>{
  const storage=memory(), p=practice(5);
  let game=grade(startChallenge(p,33),false);
  assert.equal(saveChallenge(game,storage),true);
  let restored=restoreChallenge(p,storage);
  assert.deepEqual(restored.queue,game.queue); assert.equal(restored.challenge!.id,game.challenge!.id);
  assert.equal(restored.selectedOption,game.selectedOption); assert.equal(restored.challenge!.lastAward!.status,'missed');
  const paused=pauseChallenge(restored); saveChallenge(paused,storage); restored=restoreChallenge(p,storage);
  assert.equal(restored.activeSetIndex,0); assert.deepEqual(resumeChallenge(restored).queue,game.queue);
  const changed={...p,baseQuestions:p.baseQuestions.map(q=>({...q,explanation:'Updated source'}))};
  assert.equal(restoreChallenge(changed,storage),changed);
  game=startChallenge(p,44); while(!game.completed) game=play(game);
  saveChallenge(game,storage); restored=restoreChallenge(p,storage);
  assert.equal(restored.completed,true); assert.equal(restored.challenge!.score,game.challenge!.score);
});

test('corrupt or unavailable device storage safely leaves a fresh quiz',()=>{
  const p=practice(5), storage=memory(); const game=startChallenge(p,12); saveChallenge(game,storage);
  const [key,raw]=[...storage.data][0];
  for(const mutate of [
    (v:any)=>{v.run.score=-1;}, (v:any)=>{v.session.cursor=500;}, (v:any)=>{v.session.queue[0].options=null;},
    (v:any)=>{v.run.practice.historyByQuestion=null;}, (v:any)=>{v.run.cards.q0.earned=Infinity;},
    (v:any)=>{v.session.queue=[];}, (v:any)=>{v.run.lastAward={points:-5};},
  ]) {
    const bad=JSON.parse(raw); mutate(bad); storage.data.set(key,JSON.stringify(bad));
    assert.equal(restoreChallenge(p,storage),p);
  }
  storage.data.set(key,'not JSON'); assert.equal(restoreChallenge(p,storage),p);
  const blocked={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('quota');}};
  assert.equal(saveChallenge(game,blocked),false); assert.equal(restoreChallenge(p,blocked),p);
});

test('challenge starts with five hearts, deducts one per miss, and ends at zero without losing score',()=>{
  let s=startChallenge(practice(30),8);
  assert.equal(s.challenge!.hearts,5);
  s=play(s); const score=s.challenge!.score;
  for(let i=1;i<=5;i++) {
    s=grade(s,false);
    assert.equal(s.challenge!.hearts,5-i);
    const duplicate=grade(s,false); assert.equal(duplicate.challenge!.hearts,s.challenge!.hearts);
    s=advanceChallenge(s);
  }
  assert.equal(s.completed,true); assert.equal(s.challenge!.outOfHearts,true); assert.equal(s.challenge!.score,score);
  assert.equal(s.queue.length,0);
  assert.equal(gradeCompleted(s),s);
  const replay=startChallenge(s,9);
  assert.equal(replay.challenge!.hearts,5); assert.equal(replay.challenge!.correctTowardHeart,0);
  assert.equal(replay.challenge!.outOfHearts,false); assert.equal(replay.challenge!.personalBest,score);
});
function gradeCompleted(s:QuizProgressState) {
  return answerChallenge(s,{runId:s.challenge!.id,questionId:'q0',attemptNumber:1,correct:true,selectedOption:0});
}

test('every five correct answers regenerate half a heart, even across a broken streak',()=>{
  let s=startChallenge(practice(30),8); s=play(s,false);
  s=play(play(s)); s=play(s,false);
  for(let i=0;i<2;i++) s=play(s);
  assert.equal(s.challenge!.hearts,3); assert.equal(s.challenge!.correctTowardHeart,4);
  s=grade(s);
  assert.equal(s.challenge!.hearts,3.5); assert.equal(s.challenge!.correctTowardHeart,0);
  assert.equal(s.challenge!.lastAward!.heartsRestored,.5);
  const storage=memory(); saveChallenge(s,storage);
  assert.equal(restoreChallenge(practice(30),storage).challenge!.hearts,3.5);
  assert.equal(restoreChallenge(practice(30),storage).challenge!.correctTowardHeart,0);
});

test('hearts cap at five, recovery credit cannot be banked, and half a heart can be lost',()=>{
  let s=startChallenge(practice(30),8);
  for(let i=0;i<5;i++) s=play(s);
  assert.equal(s.challenge!.hearts,5); assert.equal(s.challenge!.correctTowardHeart,0);
  s=play(s,false); for(let i=0;i<4;i++) s=play(s);
  assert.equal(s.challenge!.hearts,4);
  s=grade(s); assert.equal(s.challenge!.hearts,4.5);
  const low={...advanceChallenge(s),challenge:{...s.challenge!,hearts:.5,outOfHearts:false}};
  assert.equal(grade(low,false).challenge!.hearts,0);
});

test('out-of-hearts results and partial regeneration survive reload and practice switching',()=>{
  const p=practice(30),storage=memory(); let s=startChallenge(p,10);
  s=play(play(s)); s=play(s,false);
  saveChallenge(pauseChallenge(s),storage);
  let restored=resumeChallenge(restoreChallenge(p,storage));
  assert.equal(restored.challenge!.correctTowardHeart,2); assert.equal(restored.challenge!.hearts,4);
  for(let i=0;i<4;i++) restored=play(restored,false);
  assert.equal(restored.completed,true); saveChallenge(restored,storage);
  restored=restoreChallenge(p,storage);
  assert.equal(restored.completed,true); assert.equal(restored.challenge!.hearts,0); assert.equal(restored.challenge!.outOfHearts,true);
});

test('after a recurring answer succeeds, later returns require typed recall and keep it after another miss',()=>{
  let s=startChallenge(practice(1),22);
  assert.equal(challengeRequiresTyping(s),false);
  s=play(s,false); assert.equal(challengeRequiresTyping(s),false,'first missed retry still has choices');
  s=grade(s); assert.equal(challengeRequiresTyping(s),false,'grading does not change the current question mode');
  s=advanceChallenge(s); assert.equal(challengeRequiresTyping(s),true,'later recurrence has no choices');
  const card=s.queue[0];
  assert.equal(answerChallenge(s,{runId:s.challenge!.id,questionId:card.id,attemptNumber:card.attemptNumber,correct:true,selectedOption:card.correctIndex}),s,'choice shortcut cannot bypass typed recall');
  const storage=memory(); saveChallenge(s,storage); s=restoreChallenge(practice(1),storage);
  assert.equal(challengeRequiresTyping(s),true,'reload retains forced typing');
  s=play(s,false); assert.equal(challengeRequiresTyping(s),true,'a later miss does not unlock choices again');
  for(let n=0;n<3;n++) s=play(s);
  assert.equal(s.completed,true); assert.equal(s.challenge!.cards.q0.secured,true);
});
