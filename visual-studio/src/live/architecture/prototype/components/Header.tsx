import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Brain, LogOut, HelpCircle, Menu, RotateCcw, CheckCircle2, Eye, FileText, X, ShieldCheck, FlaskConical, GitBranch } from 'lucide-react';
import { PixelQMark } from './PixelQMark';

interface HeaderProps {
  totalSteps?:number;
  onCloseLesson?:()=>void;
  onOpenQuiz?:()=>void;
  voice?:boolean;
  onToggleVoice?:()=>void;
  isReference?:boolean;
  grounding?:'illustrative'|'proposed'|'source-backed';
  assumptions?:string[];
  tradeoffs?:string[];
  limitations?:string[];
  evidenceCount?:number;
  lessonTitle: string;
  currentBeatNumber: number;
  currentBeatTitle: string;
  learnerQuestion: string;
  isAskOpen: boolean;
  onToggleAsk: () => void;
  reducedMotion: boolean;
  onToggleReducedMotion: () => void;
  onResetLesson: () => void;
  onFitOverview: () => void;
  onOpenEvidenceModal: () => void;
  validationPassed: boolean;
  validationIssueCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  totalSteps=7,onCloseLesson,onOpenQuiz,voice,onToggleVoice,
  grounding='illustrative',assumptions=[],tradeoffs=[],limitations=[],evidenceCount=0,
  lessonTitle,
  currentBeatNumber,
  currentBeatTitle,
  learnerQuestion,
  isAskOpen,
  onToggleAsk,
  reducedMotion,
  onToggleReducedMotion,
  onResetLesson,
  onFitOverview,
  onOpenEvidenceModal,
  validationPassed,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <header className="h-13 shrink-0 bg-[#142B25] border-b border-[#486356] px-3 sm:px-4 flex items-center justify-between gap-3 z-30 select-none">
      {/* Left: Brand & Main Heading */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <PixelQMark size={26} />
          <span className="font-pixel text-xs sm:text-sm tracking-wider text-[#E0BE72] whitespace-nowrap">
            QWEEPS
          </span>
        </div>

        <span className="text-[#486356] hidden sm:inline" aria-hidden="true">
          /
        </span>

        <div className="min-w-0 flex flex-col sm:flex-row sm:items-baseline sm:gap-2.5">
          <h1 className="text-sm sm:text-base font-semibold text-[#EEF3E9] truncate">
            {lessonTitle}
          </h1>
          <details className="relative shrink-0 group">
            <summary
              className={`list-none cursor-pointer text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider px-2 py-1 rounded border flex items-center gap-1.5 whitespace-nowrap ${
                grounding === 'source-backed'
                  ? 'border-[#7BD3B0]/70 text-[#7BD3B0] bg-[#7BD3B0]/10'
                  : grounding === 'proposed'
                  ? 'border-[#38BDF8]/70 text-[#38BDF8] bg-[#38BDF8]/10'
                  : 'border-[#E0BE72]/70 text-[#E0BE72] bg-[#E0BE72]/10'
              }`}
              title="Grounding, assumptions, limitations and evidence"
            >
              {grounding === 'source-backed' ? <GitBranch className="w-3 h-3" /> : grounding === 'proposed' ? <FlaskConical className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
              <span>{grounding === 'source-backed' ? 'Source-backed' : grounding === 'proposed' ? 'Proposed' : 'Illustrative'}</span>
              {evidenceCount > 0 && <span className="hidden sm:inline opacity-70">· {evidenceCount} evidence</span>}
            </summary>
            <div className="fixed left-3 top-14 mt-1 z-50 w-80 max-w-[calc(100vw-24px)] max-h-[calc(100dvh-80px)] overflow-y-auto rounded border border-[#486356] bg-[#0B1717] p-3 text-left normal-case tracking-normal font-sans shadow-xl">
              <div className="text-xs font-semibold text-[#EEF3E9] mb-1">Grounding</div>
              <p className="text-[11px] leading-relaxed text-[#B5C5BD]">
                {grounding === 'source-backed'
                  ? 'Structural claims are tied to supplied source evidence. Runtime values still require a trace or fixture.'
                  : grounding === 'proposed'
                  ? 'This is a proposed design. Assumptions and tradeoffs are part of the explanation, not measured facts.'
                  : 'This is an authored worked example. Values and code are illustrative, not measured from a running system.'}
              </p>
              {assumptions.length > 0 && <><div className="text-[10px] font-mono text-[#38BDF8] mt-2 mb-0.5">ASSUMPTIONS</div><ul className="list-disc pl-4 space-y-1 text-[11px] text-[#B5C5BD]">{assumptions.map((a,i)=><li key={i}>{a}</li>)}</ul></>}
              {tradeoffs.length>0&&<><div className="text-[10px] font-mono text-[#38BDF8] mt-2 mb-0.5">TRADEOFFS</div><ul className="list-disc pl-4 space-y-1 text-[11px] text-[#B5C5BD]">{tradeoffs.map((a,i)=><li key={i}>{a}</li>)}</ul></>}
              {limitations.length > 0 && <><div className="text-[10px] font-mono text-[#E0BE72] mt-2 mb-0.5">LIMITATIONS</div><ul className="list-disc pl-4 space-y-1 text-[11px] text-[#B5C5BD]">{limitations.map((a,i)=><li key={i}>{a}</li>)}</ul></>}
              <div className="text-[10px] font-mono text-[#8AA399] mt-2">{evidenceCount} evidence reference{evidenceCount===1?'':'s'} in this graph</div>
            </div>
          </details>
        </div>
      </div>

      {/* Center: Compact Current Beat & Learner Question (visible on medium+ screens) */}
      <div className="hidden lg:flex items-center gap-2 min-w-0 max-w-xl text-xs text-[#B5C5BD] truncate">
        <span className="font-mono text-[#E0BE72] shrink-0">
          Beat {currentBeatNumber}/{totalSteps} · {currentBeatTitle}:
        </span>
        <span className="truncate text-[#EEF3E9]/90" title={learnerQuestion}>
          {learnerQuestion}
        </span>
      </div>

      {/* Right: Contextual Ask QWEEPS & Menu */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onToggleAsk}
          className={`min-h-[38px] sm:min-h-[36px] px-3 py-1.5 text-xs sm:text-sm font-medium rounded border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E0BE72] ${
            isAskOpen
              ? 'bg-[#E0BE72] text-[#0B1717] border-[#E0BE72] font-semibold'
              : 'bg-[#0B1717]/80 text-[#EEF3E9] border-[#486356] hover:border-[#E0BE72] hover:text-[#E0BE72]'
          }`}
          aria-expanded={isAskOpen}
          aria-label="Ask QWEEPS"
        >
          <HelpCircle className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Ask QWEEPS</span>
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className={`min-h-[38px] min-w-[38px] sm:min-h-[36px] px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded border transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E0BE72] ${
              menuOpen
                ? 'bg-[#1A362E] text-[#E0BE72] border-[#E0BE72]'
                : 'bg-[#0B1717]/80 text-[#EEF3E9] border-[#486356] hover:border-[#7BD3B0]'
            }`}
            aria-label="Workspace menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            <span className="hidden sm:inline">Menu</span>
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-1.5 w-72 bg-[#142B25] border border-[#486356] rounded shadow-xl p-2 z-50 text-sm text-[#EEF3E9]"
            >
              <div className="px-2.5 py-1.5 border-b border-[#486356]/60 mb-1">
                <div className="font-pixel text-[11px] text-[#E0BE72]">
                  SIMULATION WORKSPACE
                </div>
                <p className="text-xs text-[#B5C5BD] mt-0.5 leading-relaxed">
                  Scripted execution trace of <code className="text-[#7BD3B0]">answer.py</code>. No live LLM, vector DB, or Python interpreter is running.
                </p>
              </div>

              {onCloseLesson&&<button type="button" role="menuitem" onClick={onCloseLesson} className="w-full text-left px-2.5 py-2 rounded hover:bg-[#0B1717] flex items-center gap-2.5 text-xs sm:text-sm cursor-pointer"><LogOut className="w-4 h-4 text-[#E0BE72]"/>Return to lesson library</button>}
              {onOpenQuiz&&<button type="button" role="menuitem" onClick={()=>{onOpenQuiz();setMenuOpen(false);}} className="w-full text-left px-2.5 py-2 rounded hover:bg-[#0B1717] flex items-center gap-2.5 text-xs sm:text-sm cursor-pointer"><Brain className="w-4 h-4 text-[#E0BE72]"/>Reinforcement quiz</button>}
              {onToggleVoice&&<button type="button" role="menuitem" onClick={onToggleVoice} className="w-full text-left px-2.5 py-2 rounded hover:bg-[#0B1717] flex items-center gap-2.5 text-xs sm:text-sm cursor-pointer">{voice?<Volume2 className="w-4 h-4 text-[#7BD3B0]"/>:<VolumeX className="w-4 h-4"/>}{voice?'Mute narration':'Enable narration'}</button>}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onOpenEvidenceModal();
                  setMenuOpen(false);
                }}
                className="w-full text-left px-2.5 py-2 rounded hover:bg-[#0B1717] flex items-center gap-2.5 text-xs sm:text-sm text-[#EEF3E9] transition-colors cursor-pointer"
              >
                <FileText className="w-4 h-4 text-[#7BD3B0] shrink-0" />
                <span>Inspect 3 prepared policy docs</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onFitOverview();
                  setMenuOpen(false);
                }}
                className="w-full text-left px-2.5 py-2 rounded hover:bg-[#0B1717] flex items-center gap-2.5 text-xs sm:text-sm text-[#EEF3E9] transition-colors cursor-pointer"
              >
                <Eye className="w-4 h-4 text-[#91B9CC] shrink-0" />
                <span>Overview / Fit entire graph</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onToggleReducedMotion();
                }}
                className="w-full text-left px-2.5 py-2 rounded hover:bg-[#0B1717] flex items-center justify-between gap-2 text-xs sm:text-sm text-[#EEF3E9] transition-colors cursor-pointer"
              >
                <span>Reduced motion transitions</span>
                <span
                  className={`font-mono text-xs px-1.5 py-0.5 rounded border ${
                    reducedMotion
                      ? 'border-[#7BD3B0] text-[#7BD3B0] bg-[#0B1717]'
                      : 'border-[#486356] text-[#B5C5BD]'
                  }`}
                >
                  {reducedMotion ? 'ON' : 'OFF'}
                </span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onResetLesson();
                  setMenuOpen(false);
                }}
                className="w-full text-left px-2.5 py-2 rounded hover:bg-[#0B1717] flex items-center gap-2.5 text-xs sm:text-sm text-[#E0BE72] transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 shrink-0" />
                <span>Restart walkthrough (0:00)</span>
              </button>

              <div className="mt-1.5 pt-1.5 border-t border-[#486356]/60 px-2.5 py-1 flex items-center justify-between text-[11px] text-[#B5C5BD]">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#7BD3B0]" />
                  Graph & step references
                </span>
                <span className="font-mono text-[#7BD3B0]">
                  {validationPassed ? 'VALIDATED' : 'CHECK ISSUES'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
