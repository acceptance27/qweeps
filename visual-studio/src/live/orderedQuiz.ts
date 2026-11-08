import type {QuizQuestion} from './lessonTypes';

/** Each blank has its own stable identity, grading, score, life cost and recall schedule. */
export function expandOrderedQuestions(questions: QuizQuestion[]): QuizQuestion[] {
  return questions.flatMap(q => {
    if (q.kind !== 'ordered_cloze' || q.orderedSlot) return [q];
    const answers = q.orderedAnswers || [];
    if (answers.length < 2 || answers.length > 5 || q.prompt.split(/_{3,}/).length !== answers.length + 1 ||
      q.options.length < 8 || q.options.length > 10 || answers.some(a => !q.options.includes(a))) {
      throw new Error('This ordered question needs 2–5 blanks and an 8–10-choice answer bank.');
    }
    const slotIds = answers.map((_,i) => `${q.id}::blank-${i+1}`);
    return answers.map((answer,index) => ({...q, id:slotIds[index],
      prompt:q.prompt.split(/_{3,}/).map((part,i) => part + (i < answers.length ? i === index ? '____' : answers[i] : '')).join(''),
      correctIndex:q.options.indexOf(answer), acceptedAnswers:q.orderedAliases?.[index] || [answer],
      explanation:q.orderedExplanations?.[index] || q.explanation,
      orderedSlot:{groupId:q.id,prompt:q.prompt,answers,index,slotIds},
    }));
  });
}

/** Shuffle groups, never the blanks inside a newly encountered question. */
export function groupQuizQuestions<T extends QuizQuestion>(questions: T[]): T[][] {
  const groups:T[][]=[], byId=new Map<string,T[]>();
  for (const q of questions) {
    const key=q.orderedSlot?.groupId || q.id;
    let group=byId.get(key);
    if (!group) {group=[]; byId.set(key,group); groups.push(group);}
    group.push(q);
  }
  return groups.map(group => [...group].sort((a,b)=>(a.orderedSlot?.index||0)-(b.orderedSlot?.index||0)));
}

export function partitionOrderedQuestions(questions: QuizQuestion[]): QuizQuestion[][] {
  const groups=groupQuizQuestions(questions), sets:QuizQuestion[][]=[];
  let current:QuizQuestion[]=[];
  for(const group of groups) {
    if(current.length>=10) {sets.push(current); current=[];}
    current.push(...group);
  }
  if(current.length) {
    if(current.length<5 && sets.length) sets[sets.length-1].push(...current);
    else sets.push(current);
  }
  return sets;
}

/** A retry can wait until a sentence is finished instead of cutting between its blanks. */
export function orderedSafeInsertion(queue: QuizQuestion[], desired: number): number {
  let index=Math.min(desired,queue.length);
  while(index>0 && index<queue.length) {
    const before=queue[index-1].orderedSlot, after=queue[index].orderedSlot;
    if(!before || !after || before.groupId!==after.groupId || after.index!==before.index+1) break;
    index++;
  }
  return index;
}
