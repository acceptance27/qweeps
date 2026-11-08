import React from 'react';
import { Play, Pause, RotateCcw, SkipBack, SkipForward, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { Step } from '../types/lesson';

interface PlaybackBarProps {
  voiceEnabled?: boolean;
  voiceBusy?: boolean;
  voiceStatus?: string;
  voiceError?: boolean;
  onToggleVoice?: () => void;
  onCancelVoice?: () => void;
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
  voiceEnabled, voiceBusy, voiceStatus, voiceError, onToggleVoice, onCancelVoice,
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

  const beatStarts: number[] = [];
  let acc = 0;
  for (const s of steps) {
    beatStarts.push(acc);
    acc += s.duration;
  }

  return (
    <footer
      aria-label="Lesson timeline and beat navigation"
      className="shrink-0 bg-[#2B2D30] border-t border-[#393B40] px-3 sm:px-4 py-1.5 select-none z-30"
    >
      <div className="flex flex-col gap-1.5">
        {/* Top Row: JetBrains Debug / Run Transport Controls + Scrubber + Time */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Play / Pause (JetBrains Run Blue Button, zero neon shadow) */}
          <button
            type="button"
            onClick={onTogglePlay}
            className="min-h-[32px] px-3 py-1 rounded border border-[#3574F0] bg-[#3574F0] text-[#FFFFFF] hover:bg-[#3065D5] font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-[#3574F0]"
            aria-label={isPlaying ? 'Pause walkthrough' : 'Play walkthrough'}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span className="hidden min-[360px]:inline">Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span className="hidden min-[360px]:inline">{playhead >= totalDuration - 0.05 ? 'Rerun' : 'Run'}</span>
              </>
            )}
          </button>

          <button type="button" onClick={onToggleVoice} aria-label={voiceEnabled ? 'Mute narration' : 'Enable narration'} aria-pressed={voiceEnabled}
            title={voiceEnabled ? 'Recorded narration follows the measured speech clock' : 'Play with recorded voice explanation'}
            className={`min-h-[32px] px-2.5 py-1 rounded border text-xs flex items-center gap-1.5 shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#3574F0] ${voiceEnabled ? 'border-[#3574F0] bg-[#263248] text-[#DFE1E5]' : 'border-[#4E5157] bg-[#35373B] text-[#BCBEC4]'}`}>
            {voiceBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : voiceEnabled ? <Volume2 className="w-3.5 h-3.5"/> : <VolumeX className="w-3.5 h-3.5"/>}
            <span className="hidden sm:inline">Voice</span>
          </button>

          {/* Restart */}
          <button
            type="button"
            onClick={onRestart}
            className="min-h-[32px] px-2.5 py-1 rounded border border-[#4E5157] bg-[#35373B] text-[#DFE1E5] hover:bg-[#3E4045] hover:border-[#5A5D63] text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer shrink-0"
            aria-label="Restart walkthrough from 0:00"
            title="Restart walkthrough (0:00)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Reset</span>
          </button>

          {/* Prev / Next Beat Step Buttons */}
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={currentStepIndex <= 0 && playhead < 0.5}
              onClick={() => onJumpToStep(Math.max(0, currentStepIndex - 1))}
              className="min-h-[32px] px-2.5 py-1 rounded border border-[#4E5157] bg-[#35373B] text-[#DFE1E5] disabled:opacity-35 hover:bg-[#3E4045] flex items-center justify-center gap-1 cursor-pointer text-xs font-mono"
              aria-label="Previous reasoning beat (Left Arrow)"
              title="Step Back (← Left Arrow key)"
            >
              <SkipBack className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">← Step</span>
            </button>
            <button
              type="button"
              disabled={currentStepIndex >= steps.length - 1}
              onClick={() =>
                onJumpToStep(Math.min(steps.length - 1, currentStepIndex + 1))
              }
              className="min-h-[32px] px-2.5 py-1 rounded border border-[#4E5157] bg-[#35373B] text-[#DFE1E5] disabled:opacity-35 hover:bg-[#3E4045] flex items-center justify-center gap-1 cursor-pointer text-xs font-mono"
              aria-label="Next reasoning beat (Right Arrow)"
              title="Step Over (→ Right Arrow key)"
            >
              <span className="hidden lg:inline">Step →</span>
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Interactive Timeline Scrubber */}
          <div className="relative flex-1 flex items-center min-w-[56px] sm:min-w-[100px]">
            <input
              type="range"
              min={0}
              max={totalDuration}
              step={0.05}
              value={playhead}
              onChange={(e) => onSeek(parseFloat(e.target.value))}
              aria-label="Walkthrough timeline scrubber"
              className="w-full h-1.5 bg-[#1E1F22] rounded appearance-none cursor-pointer accent-[#3574F0] border border-[#393B40]"
            />
          </div>

          {/* Elapsed / Total Time */}
          <div className="font-mono text-[10px] sm:text-xs text-[#BCBEC4] shrink-0 tabular-nums">
            <span className="text-[#DFE1E5] font-medium">
              {formatSeconds(playhead)}
            </span>
            <span className="text-[#868A91]"> / {formatSeconds(totalDuration)}</span>
          </div>
        </div>

        {voiceStatus && <div className="flex items-center gap-2 text-xs min-w-0" role="status">
          <span className={`truncate ${voiceError ? 'text-[#F2C55C]' : 'text-[#BCBEC4]'}`} title={voiceStatus}>{voiceStatus}</span>
          {voiceBusy && <button type="button" onClick={onCancelVoice} className="shrink-0 underline text-[#56A8F5] cursor-pointer">Cancel preparation</button>}
        </div>}

        {/* Bottom Row: JetBrains Debug Frame Tabs */}
        <div
          role="tablist"
          aria-label="Connected reasoning beats"
          className="grid gap-1"
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
                className={`min-h-[28px] px-2 py-1 rounded border text-left transition-colors flex items-center justify-between gap-1 cursor-pointer overflow-hidden focus-visible:outline-2 focus-visible:outline-[#3574F0] ${
                  isInvolved
                    ? 'border-[#56A8F5] bg-[#263248] text-[#DFE1E5]'
                    : isCurrent
                    ? 'border-[#3574F0] bg-[#2E436E] text-[#DFE1E5]'
                    : isPast
                    ? 'border-[#393B40] bg-[#232528] text-[#BCBEC4] hover:border-[#4E5157] hover:text-[#DFE1E5]'
                    : 'border-[#323438] bg-[#1E1F22] text-[#868A91] hover:border-[#4E5157] hover:text-[#BCBEC4]'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`font-mono text-[11px] font-semibold shrink-0 ${
                      isInvolved
                        ? 'text-[#56A8F5]'
                        : isCurrent
                        ? 'text-[#56A8F5]'
                        : isPast
                        ? 'text-[#6AAB73]'
                        : 'text-[#868A91]'
                    }`}
                  >
                    {step.beatNumber}.
                  </span>
                  <span className="text-[11px] font-medium truncate hidden md:inline">
                    {step.title}
                  </span>
                </div>

                {isInvolved && (
                  <span className="font-mono text-[9.5px] font-semibold text-[#56A8F5] shrink-0">
                    linked
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
