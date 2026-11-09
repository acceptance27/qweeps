import type {QuizProgressState} from './ReinforcementQuizModal';
import {answerChallenge,isChallenge,challengeRequiresTyping,type ChallengeAnswer} from './quizChallenge';
import type {OrderedAttempt,OrderedBlankResult} from './orderedQuiz';

export function currentOrderedAttempt(state:QuizProgressState):OrderedAttempt|null {
  const card=state.queue[state.cursor];
  if(!card?.orderedSlot) return null;
  const saved=state.orderedAttempt;
  return saved?.cardId===card.id && saved.attemptNumber===card.attemptNumber ? saved :
    {cardId:card.id,attemptNumber:card.attemptNumber,index:0,answers:[],assisted:false};
}
export function orderedHelp(state:QuizProgressState):QuizProgressState {
  if(state.viewingQuestionId) return state;
  const attempt=currentOrderedAttempt(state);
  return attempt && state.selectedOption===null ? {...state,orderedAttempt:{...attempt,assisted:true}} : state;
}
export type OrderedAnswer = Omit<ChallengeAnswer,'runId'|'recalledItems'> & {index:number;runId?:string};

/** Intermediate blanks only fill the sentence. Grade and schedule the whole card once. */
export function answerOrderedBlank(state:QuizProgressState,answer:OrderedAnswer):QuizProgressState {
  const card=state.queue[state.cursor], attempt=currentOrderedAttempt(state);
  if(!card?.orderedSlot || !attempt || state.completed || state.viewingQuestionId || state.selectedOption!==null ||
    card.id!==answer.questionId || card.attemptNumber!==answer.attemptNumber || attempt.index!==answer.index ||
    (isChallenge(state) && (state.challenge!.id!==answer.runId || state.challenge!.outOfHearts))) return state;
  if(challengeRequiresTyping(state) && !answer.typedFeedback && !answer.revealed) return state;
  const result:OrderedBlankResult={selectedOption:answer.selectedOption,correct:answer.correct,typedFeedback:answer.typedFeedback??null};
  const orderedAttempt={...attempt,answers:[...attempt.answers,result]};
  const current={...state,orderedAttempt,selectedOption:answer.selectedOption,typedInput:'',typedFeedback:result.typedFeedback,isVerifyingSemantic:false};
  if(orderedAttempt.answers.length<card.orderedSlot.answers.length) return current;
  const correct=orderedAttempt.answers.every(a=>a.correct);
  if(isChallenge(state)) {
    const prepared={...state,orderedAttempt,challenge:{...state.challenge!,helpUsed:state.challenge!.helpUsed||orderedAttempt.assisted}};
    return answerChallenge(prepared,{...answer,runId:state.challenge!.id,correct,orderedAnswers:orderedAttempt.answers});
  }
  const future=state.queue.slice(state.cursor+1).filter(q=>q.id!==card.id);
  if(!correct) future.unshift({...card,attemptNumber:card.attemptNumber+1,isReinforcement:true,isSpacedRecall:true});
  const streak=correct?state.streak+1:0;
  return {...current,queue:[card,...future],cursor:0,reinforcementQueue:state.reinforcementQueue.filter(q=>q.id!==card.id),
    totalSubmissions:state.totalSubmissions+1,streak,bestStreak:Math.max(state.bestStreak,streak),
    attemptsByQuestion:{...state.attemptsByQuestion,[card.id]:(state.attemptsByQuestion[card.id]||0)+1},
    historyByQuestion:{...state.historyByQuestion,[card.id]:{selectedOption:answer.selectedOption,typedFeedback:result.typedFeedback,isCorrect:correct,orderedAnswers:orderedAttempt.answers}},
    masteredIds:correct?[...new Set([...state.masteredIds,card.id])]:state.masteredIds.filter(id=>id!==card.id),
    everMissedIds:correct?state.everMissedIds:[...new Set([...state.everMissedIds,card.id])]};
}
export function advanceOrderedBlank(state:QuizProgressState):QuizProgressState {
  const attempt=currentOrderedAttempt(state),card=state.queue[state.cursor];
  if(!attempt || state.viewingQuestionId || state.selectedOption===null || attempt.index>=card.orderedSlot!.answers.length-1) return state;
  return {...state,orderedAttempt:{...attempt,index:attempt.index+1},selectedOption:null,
    showHint:false,memoryLocked:false,typedInput:'',typedFeedback:null,isVerifyingSemantic:false};
}
