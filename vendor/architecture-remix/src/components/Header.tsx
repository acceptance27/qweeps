import React, { useEffect, useRef, useState } from 'react';
import {
  HelpCircle,
  Menu,
  RotateCcw,
  Eye,
  FileText,
  X,
  Cpu,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { PixelQMark } from './PixelQMark';

interface HeaderProps {
  onExit?:()=>void;
  lessonTitle: string;
  currentBeatNumber: number;
  totalBeatsCount: number;
  currentBeatTitle: string;
  learnerQuestion: string;
  isAskOpen: boolean;
  onToggleAsk: () => void;
  reducedMotion: boolean;
  onToggleReducedMotion: () => void;
  onResetLesson: () => void;
  onFitOverview: () => void;
  onOpenEvidenceModal: () => void;
  onOpenProceduralModal: () => void;
  onFillGapsNow: () => void;
  compileTimeMs: number | null;
  aiFillStatus: 'curated' | 'procedural-only' | 'filling' | 'filled' | 'error';
  aiFillTimeMs: number | null;
  validationPassed: boolean;
  validationIssueCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  onExit,
  lessonTitle,
  currentBeatNumber,
  totalBeatsCount,
  currentBeatTitle,
  learnerQuestion,
  isAskOpen,
  onToggleAsk,
  reducedMotion,
  onToggleReducedMotion,
  onResetLesson,
  onFitOverview,
  onOpenEvidenceModal,
  onOpenProceduralModal,
  onFillGapsNow,
  compileTimeMs,
  aiFillStatus,
  aiFillTimeMs,
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
    <header className="h-11 shrink-0 bg-[#2B2D30] border-b border-[#393B40] px-3 sm:px-4 flex items-center justify-between gap-3 z-30 select-none">
      {/* Left: JetBrains Project Widget & Active Target */}
      <div className="flex items-center gap-2.5 min-w-0">
        <a href="/?home=1" onClick={onExit ? (event) => { event.preventDefault(); onExit(); } : undefined} aria-label="QWEEPS main menu" title="Main menu" className="flex items-center gap-2 shrink-0 rounded focus-visible:outline-2 focus-visible:outline-[#3574F0]">
          <PixelQMark size={22} />
          <span className="font-mono text-xs font-bold tracking-wide text-[#DFE1E5] whitespace-nowrap">
            QWEEPS
          </span>
        </a>

        <span className="text-[#4E5157] hidden sm:inline" aria-hidden="true">
          /
        </span>

        <div className="min-w-0 flex flex-col sm:flex-row sm:items-baseline sm:gap-2.5">
          <h1 className="text-xs sm:text-[13.5px] font-semibold text-[#DFE1E5] truncate">
            {lessonTitle}
          </h1>
          <span className="text-[11px] font-mono text-[#868A91] whitespace-nowrap shrink-0 hidden md:inline">
            {compileTimeMs !== null ? `${compileTimeMs.toFixed(1)}ms` : '1.2ms'} ELK
            {aiFillStatus === 'filling'
              ? ' · indexing AI notes…'
              : aiFillStatus === 'filled'
              ? ` · AI notes (${aiFillTimeMs ? `${(aiFillTimeMs / 1000).toFixed(1)}s` : 'ready'})`
              : ''}
          </span>
        </div>
      </div>

      {/* Center: Active Debug Beat Breadcrumb */}
      <div className="hidden xl:flex items-center gap-2 min-w-0 max-w-lg text-xs text-[#868A91] truncate">
        <span className="font-mono text-[#56A8F5] font-medium shrink-0">
          Beat {currentBeatNumber}/{totalBeatsCount} · {currentBeatTitle}
        </span>
        <span className="text-[#4E5157]" aria-hidden="true">
          —
        </span>
        <span className="truncate text-[#BCBEC4]" title={learnerQuestion}>
          {learnerQuestion}
        </span>
      </div>

      {/* Right: JetBrains New UI Run / Tool Window Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onOpenProceduralModal}
          className="min-h-[30px] px-2.5 py-1 text-xs font-medium rounded border border-[#4E5157] bg-[#35373B] text-[#DFE1E5] hover:bg-[#3E4045] hover:border-[#5A5D63] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#3574F0]"
          title="Compile custom code or scan any GitHub repository"
        >
          {aiFillStatus === 'filling' ? (
            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-[#56A8F5]" />
          ) : (
            <Cpu className="w-3.5 h-3.5 shrink-0 text-[#56A8F5]" />
          )}
          <span className="hidden sm:inline">Compiler &amp; Repo Scan</span>
          <span className="sm:hidden">Compile</span>
        </button>

        <button
          type="button"
          onClick={onToggleAsk}
          className={`min-h-[30px] px-2.5 py-1 text-xs font-medium rounded border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#3574F0] ${
            isAskOpen
              ? 'bg-[#3574F0] text-[#FFFFFF] border-[#3574F0] font-semibold'
              : 'bg-[#35373B] text-[#DFE1E5] border-[#4E5157] hover:bg-[#3E4045] hover:border-[#5A5D63]'
          }`}
          aria-expanded={isAskOpen}
        >
          <HelpCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Ask QWEEPS</span>
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className={`min-h-[30px] min-w-[30px] px-2 py-1 text-xs font-medium rounded border transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#3574F0] ${
              menuOpen
                ? 'bg-[#2E436E] text-[#DFE1E5] border-[#3574F0]'
                : 'bg-[#35373B] text-[#DFE1E5] border-[#4E5157] hover:bg-[#3E4045]'
            }`}
            aria-label="Workspace menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-1.5 w-80 bg-[#2B2D30] border border-[#4E5157] rounded-md shadow-2xl p-1.5 z-50 text-xs text-[#DFE1E5]"
            >
              <div className="px-2.5 py-1.5 border-b border-[#393B40] mb-1">
                <div className="font-semibold text-xs text-[#DFE1E5]">
                  QWEEPS Architecture &amp; Debugger
                </div>
                <p className="text-[11px] text-[#868A91] mt-0.5 leading-relaxed">
                  Deterministic 3-level ELK graph layout with OpenCode Go explanatory gap-filling.
                </p>
              </div>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onOpenProceduralModal();
                  setMenuOpen(false);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#2E436E] flex items-center gap-2.5 text-xs text-[#DFE1E5] font-medium transition-colors cursor-pointer"
              >
                <Cpu className="w-4 h-4 text-[#56A8F5] shrink-0" />
                <span>Compile custom pipeline / switch preset</span>
              </button>
              {onExit&&<button type="button" role="menuitem" onClick={onExit} className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#2E436E] text-xs cursor-pointer">QWEEPS lesson library</button>}

              <button
                type="button"
                role="menuitem"
                disabled={aiFillStatus === 'filling'}
                onClick={() => {
                  onFillGapsNow();
                  setMenuOpen(false);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#2E436E] disabled:opacity-50 flex items-center gap-2.5 text-xs text-[#56A8F5] font-medium transition-colors cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-[#D9A354] shrink-0" />
                <span>
                  {aiFillStatus === 'filling'
                    ? 'Synthesizing explanatory notes…'
                    : 'Fill explanatory gaps with OpenCode Go'}
                </span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onOpenEvidenceModal();
                  setMenuOpen(false);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#2E436E] flex items-center gap-2.5 text-xs text-[#DFE1E5] transition-colors cursor-pointer"
              >
                <FileText className="w-4 h-4 text-[#6AAB73] shrink-0" />
                <span>Inspect source evidence &amp; policy store</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onFitOverview();
                  setMenuOpen(false);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#2E436E] flex items-center gap-2.5 text-xs text-[#DFE1E5] transition-colors cursor-pointer"
              >
                <Eye className="w-4 h-4 text-[#56A8F5] shrink-0" />
                <span>Fit entire diagram to viewport</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onToggleReducedMotion();
                }}
                className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#2E436E] flex items-center justify-between gap-2 text-xs text-[#DFE1E5] transition-colors cursor-pointer"
              >
                <span>Reduced motion transitions</span>
                <span className="font-mono text-xs text-[#868A91]">
                  {reducedMotion ? 'ON' : 'OFF'}
                </span>
              </button>

              <div className="border-t border-[#393B40] my-1 pt-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onResetLesson();
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#2E436E] flex items-center gap-2.5 text-xs text-[#D9A354] transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4 shrink-0" />
                  <span>Reset walkthrough to 0:00</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
