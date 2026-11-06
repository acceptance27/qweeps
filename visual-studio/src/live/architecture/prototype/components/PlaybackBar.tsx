import React from 'react';
import { Play, Pause, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { Step } from '../types/lesson';

interface PlaybackBarProps {
  isPlaying: boolean;
  playhead: number;
  totalDuration: number;
  steps: Step[];
  currentStepIndex: number;
  involvedStepIndices?: number[];
  selectedNodeLabel?: string | null;
  onTogglePlay: () => void;
  onRestart: () => void;
  onSeek: (time: number) => void;
  onJumpToStep: (stepIndex: number) => void;
}

function formatSeconds(sec: number): string {
  const clamped = Math.max(0, sec);
  const mins = Math.floor(clamped / 60);
  const rem = Math.floor(clamped % 60);
  const tenths = Math.floor((clamped % 1) * 10);
  return `${mins}:${rem.toString().padStart(2, '0')}.${tenths}`;
}

export const PlaybackBar: React.FC<PlaybackBarProps> = ({
  isPlaying,
  playhead,
  totalDuration,
  steps,
  currentStepIndex,
  involvedStepIndices = [],
  selectedNodeLabel = null,
  onTogglePlay,
  onRestart,
  onSeek,
  onJumpToStep,
}) => {
  const involvedSet = new Set(involvedStepIndices);

  // Compute start timestamp for each beat
  const beatStarts: number[] = [];
  let acc = 0;
  for (const s of steps) {
    beatStarts.push(acc);
    acc += s.duration;
  }

  return (
    <footer
      aria-label="Lesson timeline and beat navigation"
      className="shrink-0 bg-[#142B25] border-t border-[#486356] px-3 sm:px-4 py-2 select-none z-30"
    >
      <div className="flex flex-col gap-1.5">
        {/* Top Row: Transport buttons + Scrubber + Elapsed/Total Time */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Play / Pause */}
          <button
            type="button"
            onClick={onTogglePlay}
            className="min-h-[40px] sm:min-h-[36px] px-3.5 py-1.5 rounded border border-[#E0BE72] bg-[#E0BE72] text-[#0B1717] hover:bg-[#E0BE72]/90 font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-[#7BD3B0]"
            aria-label={isPlaying ? 'Pause walkthrough' : 'Play walkthrough'}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>{playhead >= totalDuration - 0.05 ? 'Replay' : 'Play'}</span>
              </>
            )}
          </button>

          {/* Restart */}
          <button
            type="button"
            onClick={onRestart}
            className="min-h-[40px] min-w-[40px] sm:min-h-[36px] sm:min-w-[36px] px-2.5 py-1.5 rounded border border-[#486356] bg-[#0B1717]/80 text-[#EEF3E9] hover:border-[#7BD3B0] hover:text-[#7BD3B0] text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-[#E0BE72]"
            aria-label="Restart walkthrough from 0:00"
            title="Restart walkthrough (0:00)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Restart</span>
          </button>

          {/* Prev / Next Beat Quick Buttons (Also triggered by ← / → Arrow Keys) */}
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={currentStepIndex <= 0 && playhead < 0.5}
              onClick={() => onJumpToStep(Math.max(0, currentStepIndex - 1))}
              className="min-h-[36px] px-2.5 py-1 rounded border border-[#486356] bg-[#0B1717]/80 text-[#EEF3E9] disabled:opacity-40 hover:border-[#7BD3B0] flex items-center justify-center gap-1 cursor-pointer text-xs font-mono"
              aria-label="Previous reasoning beat (Left Arrow)"
              title="Previous Beat (← Left Arrow key)"
            >
              <SkipBack className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">← Beat</span>
            </button>
            <button
              type="button"
              disabled={currentStepIndex >= steps.length - 1}
              onClick={() =>
                onJumpToStep(Math.min(steps.length - 1, currentStepIndex + 1))
              }
              className="min-h-[36px] px-2.5 py-1 rounded border border-[#486356] bg-[#0B1717]/80 text-[#EEF3E9] disabled:opacity-40 hover:border-[#7BD3B0] flex items-center justify-center gap-1 cursor-pointer text-xs font-mono"
              aria-label="Next reasoning beat (Right Arrow)"
              title="Next Beat (→ Right Arrow key)"
            >
              <span className="hidden lg:inline">Beat →</span>
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Interactive Timeline Scrubber */}
          <div className="relative flex-1 flex items-center min-w-[100px]">
            <input
              type="range"
              min={0}
              max={totalDuration}
              step={0.05}
              value={playhead}
              onChange={(e) => onSeek(parseFloat(e.target.value))}
              aria-label="Walkthrough timeline scrubber"
              className="w-full h-2 bg-[#0B1717] rounded-lg appearance-none cursor-pointer accent-[#E0BE72] border border-[#486356]"
            />
          </div>

          {/* Elapsed / Total Time */}
          <div className="font-mono text-xs text-[#EEF3E9] shrink-0 tabular-nums">
            <span className="text-[#E0BE72] font-semibold">
              {formatSeconds(playhead)}
            </span>
            <span className="text-[#B5C5BD]"> / {formatSeconds(totalDuration)}</span>
          </div>
        </div>

        {/* Bottom Row: Connected Reasoning Beat Markers (Highlights beats involved with selected node!) */}
        <div
          role="tablist"
          aria-label="Connected reasoning beats"
          className="grid gap-1 sm:gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
          }}
        >
          {steps.map((step, idx) => {
            const isCurrent = idx === currentStepIndex;
            const isPast = idx < currentStepIndex;
            const isInvolved = involvedSet.has(idx);
            const startSec = beatStarts[idx];

            return (
              <button
                key={step.id}
                role="tab"
                aria-selected={isCurrent}
                type="button"
                onClick={() => onJumpToStep(idx)}
                title={`Beat ${step.beatNumber}: ${step.title} (${formatSeconds(startSec)})${
                  isInvolved && selectedNodeLabel
                    ? ` — Involved with ${selectedNodeLabel}`
                    : ''
                }`}
                className={`min-h-[32px] px-1.5 py-1 rounded border text-left transition-colors flex items-center justify-between gap-1 cursor-pointer overflow-hidden focus-visible:outline-2 focus-visible:outline-[#E0BE72] ${
                  isInvolved
                    ? 'border-[#38BDF8] border-2 bg-[#0F2E3D] text-[#EEF3E9] shadow-[0_0_10px_rgba(56,189,248,0.35)]'
                    : isCurrent
                    ? 'border-[#E0BE72] bg-[#1A362E] text-[#EEF3E9]'
                    : isPast
                    ? 'border-[#486356] bg-[#0B1717]/80 text-[#7BD3B0] hover:border-[#7BD3B0]'
                    : 'border-[#486356]/60 bg-[#0B1717]/50 text-[#B5C5BD] hover:border-[#486356] hover:text-[#EEF3E9]'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`font-mono text-[11px] font-bold shrink-0 ${
                      isInvolved
                        ? 'text-[#38BDF8]'
                        : isCurrent
                        ? 'text-[#E0BE72]'
                        : isPast
                        ? 'text-[#7BD3B0]'
                        : 'text-[#B5C5BD]'
                    }`}
                  >
                    B{step.beatNumber}
                  </span>
                  <span className="text-[11px] font-medium truncate hidden md:inline">
                    {step.title}
                  </span>
                </div>

                {isInvolved && (
                  <span className="font-mono text-[9.5px] font-extrabold px-1.5 py-0.5 rounded bg-[#38BDF8] text-[#0B1717] shrink-0">
                    INVOLVED
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </footer>
  );
};
