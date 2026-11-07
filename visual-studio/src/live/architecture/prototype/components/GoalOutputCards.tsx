import type {SidebarGoal} from '../sidebarGoals';

/** Shared with the original prototype: goal above a dark input/output inset. */
export function GoalOutputCards({title,cards,onActivate}:{title:string;cards:SidebarGoal[];onActivate:(card:SidebarGoal,index:number)=>void}){
 return <div className="rounded border border-[#486356] bg-[#0B1717] overflow-hidden shadow-sm" aria-label="Step goals and outputs">
  <div className="px-3 py-2 border-b border-[#486356]/70 bg-[#142B25]/70 flex items-center justify-between gap-2">
   <span className="text-xs font-semibold text-[#EEF3E9] truncate">Step Goals &amp; Outputs ({title.split('(')[0]})</span>
   <span className="font-mono text-[10.5px] text-[#8AA399] shrink-0">Click any @step to inspect</span>
  </div>
  <div className="divide-y divide-[#486356]/40 font-mono text-xs sm:text-[13px]">
   {cards.map((card,index)=><div key={card.id} role="button" tabIndex={0} onClick={()=>onActivate(card,index)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onActivate(card,index);}}}
    className={`w-full text-left p-3 transition-colors cursor-pointer ${card.highlighted?'bg-[#17332B] text-[#EEF3E9] border-l-4 border-l-[#E0BE72]':'text-[#B5C5BD]/90 hover:bg-[#142B25]/70'}`}>
    <div className="space-y-2">
     <div className="leading-relaxed break-words"><span className={`font-bold ${card.highlighted?'text-[#7BD3B0]':'text-[#91B9CC]'}`}>{card.name}</span>{' '}<span className="text-[#E0BE72] font-semibold">goal</span>{' '}<span className="font-sans text-[#EEF3E9]">&ldquo;{card.goal}&rdquo;</span></div>
     {(card.inputValue||card.outputValue)&&<div className="p-2.5 rounded bg-[#0B1717] border border-[#486356]/80 space-y-1.5 text-[11.5px] leading-snug break-words">
      {card.inputValue&&<div><span className="text-[#38BDF8] font-bold">{card.inputLabel}:</span>{' '}<span className="text-[#EEF3E9]">{card.inputValue}</span></div>}
      {card.outputValue&&<div><span className="text-[#34D399] font-bold">{card.outputLabel}:</span>{' '}<span className="text-[#EEF3E9]">{card.outputValue}</span></div>}
     </div>}
    </div>
   </div>)}
  </div>
 </div>;
}
