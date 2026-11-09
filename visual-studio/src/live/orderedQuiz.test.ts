import test from 'node:test';
import assert from 'node:assert/strict';
import type {LiveLesson,QuizQuestion} from './lessonTypes';
import {ensureLessonQuiz} from './lessonTypes';
import {expandOrderedQuestions,legacyExpandedQuestions,orderedCardAt} from './orderedQuiz';
import {answerOrderedBlank,advanceOrderedBlank,currentOrderedAttempt,orderedHelp} from './orderedQuizProgress';
import {createInitialQuizState,getQuizSets,type QuizProgressState} from './ReinforcementQuizModal';
import {startChallenge,advanceChallenge,pauseChallenge,resumeChallenge,saveChallenge,restoreChallenge,challengeRequiresTyping} from './quizChallenge';

const ordered:QuizQuestion={id:'london',kind:'ordered_cloze',chapterId:'london',chapterTitle:'London',chapterIndex:0,
 prompt:'Improve ____, continue ____ safely, ____ the book, and ____ it with notes.',
 options:['English','reform','study','annotate','Spanish','commerce','translate','illustrate'],correctIndex:0,
 orderedAnswers:['English','reform','study','annotate'],orderedAliases:[['English'],['reform'],['study','studied'],['annotate','annotated']],
 orderedExplanations:['The language was English.','Reform continued safely.','Study the historical book.','Annotation adds notes.'],
 explanation:'Four related purposes.',difficulty:'medium'};
const lesson:LiveLesson={id:'ordered-test',title:'Ordered quiz',question:'Review',duration:0,sources:[],chapters:[],quiz:[ordered]};
function answer(s:QuizProgressState,correct=true) {
 const q=s.queue[s.cursor],a=currentOrderedAttempt(s)!,display=orderedCardAt(q,a.index);
 return answerOrderedBlank(s,{runId:s.challenge?.id,questionId:q.id,attemptNumber:q.attemptNumber,index:a.index,correct,
   selectedOption:correct?display.correctIndex:(display.correctIndex+4)%q.options.length,
   ...(s.isHardMode||challengeRequiresTyping(s)?{typedFeedback:{status:correct?'correct' as const:'wrong' as const,userText:correct?q.options[display.correctIndex]:'wrong'}}:{})});
}
function pass(s:QuizProgressState,misses:number[]=[]) {
 const count=s.queue[s.cursor].orderedSlot!.answers.length;
 for(let i=0;i<count;i++){s=answer(s,!misses.includes(i)); if(i<count-1)s=advanceOrderedBlank(s);}
 return s;
}
function memory(){const data=new Map<string,string>();return {data,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};}

test('a four-blank sentence is one card with per-blank display and aliases',()=>{
 const cards=ensureLessonQuiz(lesson);
 assert.equal(cards.length,1); assert.equal(cards[0].id,'london');
 const third=orderedCardAt(cards[0],2);
 assert.deepEqual(third.acceptedAnswers,['study','studied']); assert.equal(third.explanation,ordered.orderedExplanations![2]);
 assert.equal(third.prompt.match(/____/g)?.length,1); assert.equal(third.orderedSlot!.prompt,ordered.prompt);
 assert.deepEqual(expandOrderedQuestions(cards),cards);
 assert.equal(expandOrderedQuestions(legacyExpandedQuestions(cards)).length,1,'old exported split banks are regrouped');
});

test('All Questions and practice sets count sentences, not their blanks',()=>{
 const questions=Array.from({length:15},(_,i)=>({...ordered,id:`group-${i}`}));
 const p=createInitialQuizState({...lesson,quiz:questions}),s=startChallenge(p,12);
 assert.equal(s.baseQuestions.length,15); assert.equal(s.queue.length,15); assert.equal(Object.keys(s.challenge!.cards).length,15);
 assert.deepEqual(getQuizSets(s.baseQuestions).map(set=>set.questions.length),[10,5]);
});

test('intermediate blanks neither score nor change cards, combo, hearts or mastery',()=>{
 let s=startChallenge(createInitialQuizState(lesson),3);s=answer(s);
 assert.equal(s.challenge!.score,0); assert.equal(s.streak,0); assert.equal(s.totalSubmissions,0);
 assert.equal(s.masteredIds.length,0); assert.equal(s.challenge!.correctTowardHeart,0);assert.equal(s.queue.length,1);
 assert.equal(advanceChallenge(s),s,'an intermediate blank cannot advance the card queue');
 s=advanceOrderedBlank(s); assert.equal(currentOrderedAttempt(s)!.index,1);
 assert.equal(s.queue[0].id,'london'); assert.equal(s.orderedAttempt!.answers[0].correct,true);
});

test('one complete clean sentence earns one card score, one streak and one recovery answer',()=>{
 let s=startChallenge(createInitialQuizState(lesson),2);s={...s,challenge:{...s.challenge!,hearts:4}};
 s=pass(s);assert.equal(s.challenge!.score,150);assert.equal(s.streak,1);assert.equal(s.totalSubmissions,1);
 assert.deepEqual(s.masteredIds,['london']);assert.equal(s.challenge!.correctTowardHeart,1);assert.equal(s.challenge!.hearts,4);
 assert.equal(s.historyByQuestion.london.orderedAnswers!.length,4);
 s=advanceChallenge(s);assert.equal(s.completed,true);assert.equal(s.orderedAttempt,null);
});

test('any mistake repeats the entire card immediately, with all blanks cleared',()=>{
 const other={...ordered,id:'other'};let s=startChallenge(createInitialQuizState({...lesson,quiz:[ordered,other]}),2);
 const first=s.queue[0].id,following=s.queue[1].id;
 s=pass(s,[1]);assert.equal(s.challenge!.hearts,4);assert.equal(s.masteredIds.length,0);
 assert.equal(s.challenge!.lastAward!.nextAfter,0);assert.equal(s.queue[1].id,first);assert.equal(s.queue[2].id,following);
 s=advanceChallenge(s);assert.equal(s.queue[0].id,first);assert.equal(currentOrderedAttempt(s)!.index,0);
 assert.deepEqual(currentOrderedAttempt(s)!.answers,[]);assert.equal(s.queue[0].requiresTypedRecall,false);
 s=pass(s);assert.equal(s.challenge!.cards[first].secured,true,'one whole perfect pass secures it');
 s=advanceChallenge(s);assert.equal(s.queue[0].id,following);assert.equal(s.queue.some(q=>q.id===first),false);
});

test('multiple errors in one sentence cost one heart and one attempt, and repeated failed passes do not multiply copies',()=>{
 let s=startChallenge(createInitialQuizState(lesson),5);
 for(let n=1;n<=3;n++){
  s=pass(s,[0,1,3]);assert.equal(s.challenge!.hearts,5-n);assert.equal(s.attemptsByQuestion.london,n);
  assert.equal(s.queue.length,2);assert.equal(s.challenge!.score,0);s=advanceChallenge(s);
 }
 s=pass(s);assert.equal(s.masteredIds.length,1);assert.equal(s.challenge!.score,150);assert.equal(s.totalSubmissions,4);
 assert.equal(advanceChallenge(s).completed,true);
});

test('practice also repeats complete sentences until a perfect pass, without a second reinforcement copy',()=>{
 let s=createInitialQuizState(lesson);s=pass(s,[0,2]);
 assert.equal(s.totalSubmissions,1);assert.equal(s.queue.length,2);assert.equal(s.reinforcementQueue.length,0);
 assert.deepEqual(s.masteredIds,[]);
 s={...s,queue:s.queue.slice(1),cursor:0,selectedOption:null,orderedAttempt:null};
 s=pass(s);assert.deepEqual(s.masteredIds,['london']);assert.equal(s.queue.length,1);assert.equal(s.totalSubmissions,2);
});

test('partial sentences survive save/reload and pause/resume without grading twice',()=>{
 const p=createInitialQuizState(lesson),storage=memory();let s=startChallenge(p,2);
 s=advanceOrderedBlank(answer(s));s=answer(s,false);saveChallenge(s,storage);
 let restored=restoreChallenge(p,storage);assert.equal(restored.orderedAttempt!.index,1);
 assert.equal(restored.orderedAttempt!.answers.length,2);assert.equal(restored.challenge!.score,0);assert.equal(restored.challenge!.hearts,5);
 restored=resumeChallenge(pauseChallenge(restored));restored=advanceOrderedBlank(restored);
 restored=advanceOrderedBlank(answer(restored));restored=answer(restored);
 assert.equal(restored.totalSubmissions,1);assert.equal(restored.challenge!.hearts,4);
 assert.equal(restored.challenge!.lastAward!.status,'missed');
 assert.equal(answer(restored),restored,'duplicate final response is ignored');
});

test('five correct whole cards restore half a heart, rather than five blanks',()=>{
 let s=startChallenge(createInitialQuizState({...lesson,quiz:Array.from({length:5},(_,i)=>({...ordered,id:`q${i}`}))}),9);
 s={...s,challenge:{...s.challenge!,hearts:4}};
 for(let n=1;n<=5;n++) {s=pass(s);assert.equal(s.challenge!.hearts,n===5?4.5:4);assert.equal(s.streak,n);s=advanceChallenge(s);}
 assert.equal(s.completed,true);assert.equal(s.totalSubmissions,5);
});

test('Hard Mode keeps all blanks together, with a stale blank response unable to affect the next one',()=>{
 let s=startChallenge({...createInitialQuizState(lesson),isHardMode:true},2);s=answer(s);
 s=advanceOrderedBlank(s);const before=s;
 s=answerOrderedBlank(s,{questionId:'london',attemptNumber:1,index:0,runId:s.challenge!.id,correct:true,selectedOption:0});
 assert.equal(s,before);assert.equal(s.orderedAttempt!.index,1);
 for(let i=1;i<4;i++){s=answer(s);if(i<3)s=advanceOrderedBlank(s);}
 assert.equal(s.challenge!.score,180);assert.equal(s.masteredIds.length,1);
});

test('hints apply to the whole attempt and an unaided clean pass finishes its full-card retry',()=>{
 let s=startChallenge(createInitialQuizState(lesson),2);s=pass(orderedHelp(s));
 assert.equal(s.challenge!.lastAward!.status,'assisted');assert.equal(s.queue.length,2);
 s=pass(advanceChallenge(s));assert.equal(s.challenge!.cards.london.secured,true);
 assert.equal(s.challenge!.score,113);assert.equal(s.masteredIds.length,1);
});

test('old split-card saves regroup the queue, keep hearts and earned points, and persist in the new format',()=>{
 const fresh=createInitialQuizState(lesson),base=legacyExpandedQuestions(fresh.baseQuestions);
 const oldPractice={...fresh,baseQuestions:base,orderedAttempt:null,queue:base.map(q=>({...q,roundNumber:1,attemptNumber:1,isReinforcement:false}))};
 let old=startChallenge(oldPractice,8);
 const id=base[0].id;
 old.challenge!.cards[id]={...old.challenge!.cards[id],earned:150,scoreCap:150,secured:true,creditedStage:3,firstTryClean:true};
 old={...old,masteredIds:[id],queue:old.queue.slice(1),challenge:{...old.challenge!,score:150,personalBest:150,hearts:3.5}};
 const storage=memory();saveChallenge(old,storage);
 const migrated=restoreChallenge(fresh,storage);
 assert.equal(migrated.baseQuestions.length,1);assert.equal(migrated.queue.length,1);assert.equal(migrated.queue[0].id,'london');
 assert.equal(migrated.challenge!.hearts,3.5);assert.equal(migrated.challenge!.score,150);assert.equal(migrated.challenge!.legacyPoints,150);
 assert.equal(currentOrderedAttempt(migrated)!.index,0);assert.deepEqual(migrated.masteredIds,[]);
 saveChallenge(migrated,storage);const again=restoreChallenge(fresh,storage);
 assert.equal(again.challenge!.score,150);assert.equal(again.queue[0].id,'london');
 const clean=pass(again);assert.equal(clean.challenge!.score,300);assert.equal(clean.challenge!.cards.london.secured,true);
});

test('legacy lookup reconstructs the exact old serialized question bank',()=>{
 const original=[ordered].flatMap(q=>q.orderedAnswers!.map((answer,index)=>({...q,id:`${q.id}::blank-${index+1}`,
   prompt:q.prompt.split(/_{3,}/).map((part,i)=>part+(i<q.orderedAnswers!.length?(i===index?'____':q.orderedAnswers![i]):'')).join(''),
   correctIndex:q.options.indexOf(answer),acceptedAnswers:q.orderedAliases?.[index]||[answer],explanation:q.orderedExplanations?.[index]||q.explanation,
   orderedSlot:{groupId:q.id,prompt:q.prompt,answers:q.orderedAnswers!,index,slotIds:q.orderedAnswers!.map((_,i)=>`${q.id}::blank-${i+1}`)}})));
 assert.equal(JSON.stringify(legacyExpandedQuestions(ensureLessonQuiz(lesson))),JSON.stringify(original));
});

test('paused old runs migrate without dropping their unrelated single-card progress',()=>{
 const single:QuizQuestion={...ordered,id:'single',kind:'concept',orderedSlot:undefined,orderedAnswers:undefined,prompt:'A single ____.'};
 const fresh=createInitialQuizState({...lesson,id:'mixed-migration',quiz:[ordered,single]});
 const base=legacyExpandedQuestions(fresh.baseQuestions);
 const p={...fresh,baseQuestions:base,queue:base.map(q=>({...q,roundNumber:1,attemptNumber:1,isReinforcement:false}))};
 let old=startChallenge(p,4);
 old.challenge!.cards.single={...old.challenge!.cards.single,earned:150,scoreCap:150,secured:true,creditedStage:3,firstTryClean:true};
 old={...old,masteredIds:['single'],queue:old.queue.filter(q=>q.id!=='single'),challenge:{...old.challenge!,score:150,personalBest:150,hearts:4}};
 const storage=memory();saveChallenge(pauseChallenge(old),storage);
 const paused=restoreChallenge(fresh,storage);
 assert.equal(paused.activeSetIndex,0);assert.deepEqual(paused.baseQuestions.map(q=>q.id),['london','single']);
 const game=resumeChallenge(paused);
 assert.equal(game.challenge!.hearts,4);assert.equal(game.challenge!.score,150);assert.equal(game.challenge!.cards.single.secured,true);
 assert.deepEqual(game.masteredIds,['single']);assert.deepEqual(game.queue.map(q=>q.id),['london']);
});
