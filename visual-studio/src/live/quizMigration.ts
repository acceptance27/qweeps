import type {ActiveCard,QuizProgressState} from './ReinforcementQuizModal';
import type {ChallengeCard,QuizChallenge} from './quizChallenge';
import {partitionOrderedQuestions} from './orderedQuiz';

type Session=Omit<QuizProgressState,'lessonId'|'baseQuestions'|'soundEnabled'|'challenge'>;
/** Keep earned points/hearts and unrelated progress when replacing per-blank saved queues. */
export function migrateOrderedChallenge(fresh:QuizProgressState,old:QuizProgressState):QuizProgressState {
  const previous=old.challenge!;
  const byId=new Map(fresh.baseQuestions.map(q=>[q.id,q]));
  const canonical=(id:string)=>byId.has(id)?id:fresh.baseQuestions.find(q=>q.orderedSlot?.slotIds.includes(id))?.id;
  const parts=(id:string)=>byId.get(id)?.orderedSlot?.slotIds || [id];
  const cleanPractice=(id:string,s:Session)=>parts(id).every(p=>s.masteredIds.includes(p) &&
    !s.everMissedIds.includes(p) && (s.attemptsByQuestion[p]||0)<=1);
  const cards:Record<string,ChallengeCard>={};
  for(const q of fresh.baseQuestions) {
    if(!q.orderedSlot) {cards[q.id]=previous.cards[q.id];continue;}
    const stats=parts(q.id).map(id=>previous.cards[id]);
    const difficulty=Math.max(...stats.map(c=>c.difficulty)) as 1|2|3;
    const clean=stats.every(c=>c.secured && c.firstTryClean && !c.misses);
    cards[q.id]={difficulty,value:[100,150,200][difficulty-1],misses:Math.max(...stats.map(c=>c.misses)),
      correctStreak:clean?1:0,creditedStage:clean?3:0,earned:0,needsRecovery:stats.some(c=>c.needsRecovery),
      secured:clean,hintCreditUsed:false,scoreCap:null,firstTryClean:clean?true:stats.some(c=>c.firstTryClean===false)?false:null,typedRecallUnlocked:clean};
  }
  const migrateSession=(s:Session,game:boolean):Session=>{
    const {lessonId:_id,baseQuestions:_base,soundEnabled:_sound,challenge:_run,...snapshot}=s as QuizProgressState;
    const masteredIds=fresh.baseQuestions.filter(q=>game?cards[q.id].secured:q.orderedSlot?cleanPractice(q.id,s):s.masteredIds.includes(q.id)).map(q=>q.id);
    const everMissedIds=[...new Set(s.everMissedIds.map(canonical).filter((id):id is string=>Boolean(id)))];
    const attemptsByQuestion:Record<string,number>={},historyByQuestion:QuizProgressState['historyByQuestion']={};
    for(const q of fresh.baseQuestions) {
      const attempts=Math.max(...parts(q.id).map(id=>s.attemptsByQuestion[id]||0));
      if(attempts) attemptsByQuestion[q.id]=attempts;
      if(!q.orderedSlot) {if(s.historyByQuestion[q.id]) historyByQuestion[q.id]=s.historyByQuestion[q.id];continue;}
      if(parts(q.id).every(id=>s.historyByQuestion[id])) {
        const answers=parts(q.id).map((id,i)=>({correct:s.historyByQuestion[id].isCorrect,
          selectedOption:s.historyByQuestion[id].isCorrect?q.options.indexOf(q.orderedSlot!.answers[i]):-1,
          typedFeedback:s.historyByQuestion[id].typedFeedback}));
        historyByQuestion[q.id]={selectedOption:answers[answers.length-1].selectedOption,typedFeedback:null,
          isCorrect:masteredIds.includes(q.id),orderedAnswers:answers};
      }
    }
    const seen=new Set<string>();
    let queue=s.queue.slice(s.cursor).flatMap(card=>{
      const id=canonical(card.id); if(!id) return [];
      const q=byId.get(id)!;
      if(!q.orderedSlot) return [card];
      if(seen.has(id) || masteredIds.includes(id)) return [];
      seen.add(id);
      return [{...q,roundNumber:card.roundNumber,attemptNumber:Math.max(1,attemptsByQuestion[id]||0)+1,
        isReinforcement:everMissedIds.includes(id),isSpacedRecall:everMissedIds.includes(id),requiresTypedRecall:false} as ActiveCard];
    });
    const current=canonical(s.queue[s.cursor]?.id||'');
    const sets=partitionOrderedQuestions(fresh.baseQuestions);
    const activeSetIndex=game?-1:Math.max(0,sets.findIndex(set=>set.some(q=>q.id===current)));
    const relevant=game?fresh.baseQuestions:sets[activeSetIndex]||[];
    if(!game) {const ids=new Set(relevant.map(q=>q.id));queue=queue.filter(q=>ids.has(q.id));}
    for(const q of relevant) if(!masteredIds.includes(q.id) && !queue.some(c=>c.id===q.id))
      queue.push({...q,roundNumber:1,attemptNumber:(attemptsByQuestion[q.id]||0)+1,isReinforcement:everMissedIds.includes(q.id)});
    const resetCurrent=Boolean(current && byId.get(current)?.orderedSlot) || queue[0]?.id!==current;
    const ended=game && previous.outOfHearts;
    if(ended) queue=[];
    return {...snapshot,activeSetIndex,queue,cursor:0,reinforcementQueue:[],masteredIds,everMissedIds,attemptsByQuestion,historyByQuestion,
      orderedAttempt:null,selectedOption:resetCurrent?null:s.selectedOption,
      typedInput:resetCurrent?'':s.typedInput,typedFeedback:resetCurrent?null:s.typedFeedback,
      recalledItems:resetCurrent?[]:s.recalledItems,showHint:resetCurrent?false:s.showHint,memoryLocked:false,isVerifyingSemantic:false,
      viewingQuestionId:s.viewingQuestionId && canonical(s.viewingQuestionId)!==queue[0]?.id ? canonical(s.viewingQuestionId)||null : null,
      completed:ended||(!queue.length && (game||masteredIds.length===fresh.baseQuestions.length)),
      setCompleted:ended||queue.length===0};
  };
  const practice=migrateSession(previous.practice,false);
  const active=old.activeSetIndex===-1;
  const game=migrateSession(active?old:previous.paused!,true);
  const legacyPoints=previous.score-Object.values(cards).reduce((sum,c)=>sum+c.earned,0);
  const run:QuizChallenge={...previous,cards,legacyPoints,lastAward:null,helpUsed:false,slip:false,practice,paused:active?undefined:game};
  return {...fresh,...(active?game:practice),challenge:run};
}
