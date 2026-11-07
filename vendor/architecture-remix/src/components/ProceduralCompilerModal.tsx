import React, { useState } from 'react';
import {
  X,
  Cpu,
  Sparkles,
  Zap,
  Code2,
  Play,
  Loader2,
  AlertCircle,
  GitMerge,
  CheckCircle2,
} from 'lucide-react';
import {
  PROCEDURAL_PIPELINE_PRESETS,
  ProceduralPresetTemplate,
} from '../procedural/proceduralCompiler';

interface ProceduralCompilerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTitle: string;
  activeSourceCode: string;
  activeSampleInput: string;
  lastCompileTimeMs: number | null;
  aiFillStatus: 'curated' | 'procedural-only' | 'filling' | 'filled' | 'error';
  aiFillTimeMs?: number | null;
  aiError?: string | null;
  onCompileWalkthrough: (options: {
    title: string;
    fileName: string;
    sourceCode: string;
    sampleInput: string;
    sampleStoreLabel: string;
    sampleStorePreview: string;
    runAiGapFill: boolean;
  }) => void;
  onLoadQweepsRepoWalkthrough: () => void;
  onScanGitHubRepo: (repoUrl: string, runAiGapFill: boolean) => Promise<void>;
  onFillCurrentWalkthroughGaps: () => void;
}

export const ProceduralCompilerModal: React.FC<ProceduralCompilerModalProps> = ({
  isOpen,
  onClose,
  activeTitle,
  activeSourceCode,
  activeSampleInput,
  lastCompileTimeMs,
  aiFillStatus,
  aiFillTimeMs,
  aiError,
  onCompileWalkthrough,
  onLoadQweepsRepoWalkthrough,
  onScanGitHubRepo,
  onFillCurrentWalkthroughGaps,
}) => {
  const [repoUrl, setRepoUrl] = useState<string>('https://github.com/acceptance27/qweeps');
  const [isScanningRepo, setIsScanningRepo] = useState<boolean>(false);

  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    PROCEDURAL_PIPELINE_PRESETS[0].id
  );
  const [title, setTitle] = useState<string>(
    activeTitle || PROCEDURAL_PIPELINE_PRESETS[0].title
  );
  const [fileName, setFileName] = useState<string>('answer.py');
  const [sampleInput, setSampleInput] = useState<string>(
    activeSampleInput || PROCEDURAL_PIPELINE_PRESETS[0].sampleInput
  );
  const [sampleStoreLabel, setSampleStoreLabel] = useState<string>('index store');
  const [sampleStorePreview, setSampleStorePreview] = useState<string>(
    '3 policies: refund, returns, shipping'
  );
  const [sourceCode, setSourceCode] = useState<string>(
    activeSourceCode || PROCEDURAL_PIPELINE_PRESETS[0].sourceCode
  );

  if (!isOpen) return null;

  const handleSelectPreset = (preset: ProceduralPresetTemplate) => {
    setSelectedPresetId(preset.id);
    setTitle(preset.title);
    setFileName(preset.fileName);
    setSampleInput(preset.sampleInput);
    setSampleStoreLabel(preset.sampleStoreLabel);
    setSampleStorePreview(preset.sampleStorePreview);
    setSourceCode(preset.sourceCode);
  };

  const handleLiveRepoScan = async (runAiGapFill: boolean) => {
    setIsScanningRepo(true);
    try {
      await onScanGitHubRepo(repoUrl, runAiGapFill);
      onClose();
    } finally {
      setIsScanningRepo(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Procedural Architecture Compiler and AI Explanatory Gap-Filler"
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 sm:p-6 select-none"
    >
      <div className="w-full max-w-4xl max-h-[92dvh] bg-[#2B2D30] border border-[#4E5157] rounded-md shadow-xl flex flex-col overflow-hidden text-[#DFE1E5]">
        {/* Header */}
        <div className="px-4 py-2.5 bg-[#2B2D30] border-b border-[#393B40] flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-[#DFE1E5] font-semibold">
              <Cpu className="w-4 h-4 text-[#56A8F5] shrink-0" />
              <span>Procedural Compiler + AI Explanatory Gap-Filler</span>
            </div>
            <p className="text-xs text-[#868A91] mt-0.5">
              Zero hand-placed coordinates: deterministic AST/import scanning &amp; ELK layout build the 3-level graphs in &lt;3ms, while the AI model fills the explanatory beats.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[30px] px-3 py-1 rounded border border-[#4E5157] bg-[#35373B] text-[#DFE1E5] hover:bg-[#3E4146] text-xs flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            <span>Close</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#1E1F22] space-y-4 select-text">
          {/* Two-Stage Pipeline Status Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded border border-[#393B40] bg-[#25272B] space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold text-[#6AAB73]">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Stage 1 · Deterministic Procedural Tool</span>
                </span>
                <span className="font-mono tabular-nums">
                  {lastCompileTimeMs !== null ? `${lastCompileTimeMs}ms` : '< 3ms'}
                </span>
              </div>
              <p className="text-xs text-[#868A91] leading-relaxed">
                Extracts AST symbols &amp; imports, builds Level-0 package containers, Level-1 module graphs, Level-2 AST flowcharts, and computes all coordinates &amp; wires algorithmically (0 hand-placed nodes/edges).
              </p>
            </div>

            <div className="p-3 rounded border border-[#393B40] bg-[#25272B] space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold text-[#56A8F5]">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Stage 2 · AI Model Storyboard &amp; Gap-Filler</span>
                </span>
                <span className="font-mono tabular-nums text-[#DFE1E5]">
                  {aiFillStatus === 'filling'
                    ? 'Filling gaps...'
                    : aiFillStatus === 'filled' && aiFillTimeMs
                    ? `Filled (${(aiFillTimeMs / 1000).toFixed(1)}s)`
                    : aiFillStatus === 'procedural-only'
                    ? 'Ready to fill'
                    : 'Model Storyboard Active'}
                </span>
              </div>
              <p className="text-xs text-[#868A91] leading-relaxed">
                Authors storyboard beats, <code className="text-[#DFE1E5]">question</code>, <code className="text-[#DFE1E5]">narration</code>, <code className="text-[#DFE1E5]">takeaway</code>, and contextual Q&amp;A slots without altering any graph geometry or AST line numbers.
              </p>
            </div>
          </div>

          {aiError && (
            <div className="p-3 rounded border border-[#D46A6E]/50 bg-[#D46A6E]/10 text-xs text-[#E88B8E] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#D46A6E] shrink-0" />
              <span>{aiError}</span>
            </div>
          )}

          {/* GitHub Repository Visual Architecture Section */}
          <div className="p-3.5 rounded border border-[#393B40] bg-[#25272B] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#56A8F5]">
                <GitMerge className="w-4 h-4" />
                <span>GitHub Repository Architecture Compiler (acceptance27/qweeps)</span>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[#6AAB73]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>0 Hand-Placed Nodes · 0 Hand-Placed Coordinates</span>
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/acceptance27/qweeps"
                className="flex-1 px-3 py-1.5 rounded bg-[#1E1F22] border border-[#4E5157] font-mono text-xs text-[#DFE1E5] focus:outline-none focus:border-[#3574F0]"
              />
              <button
                type="button"
                onClick={() => {
                  onLoadQweepsRepoWalkthrough();
                  onClose();
                }}
                className="min-h-[34px] px-3 py-1.5 rounded border border-[#4E5157] bg-[#35373B] text-[#DFE1E5] hover:bg-[#3E4146] text-xs font-medium cursor-pointer shrink-0 transition-colors"
              >
                Load acceptance27/qweeps Scan + Storyboard
              </button>
              <button
                type="button"
                disabled={isScanningRepo}
                onClick={() => void handleLiveRepoScan(true)}
                className="min-h-[34px] px-3 py-1.5 rounded bg-[#3574F0] text-white hover:bg-[#4682FA] disabled:opacity-50 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition-colors"
              >
                {isScanningRepo ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span>Live GitHub Scan + AI Gaps</span>
              </button>
            </div>
          </div>

          {/* Template Picker */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[#DFE1E5]">
              Or Compile a Single-File Python Pipeline Preset (&lt;3ms)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PROCEDURAL_PIPELINE_PRESETS.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`p-2.5 rounded border text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-[#3574F0] bg-[#263248] text-[#DFE1E5]'
                        : 'border-[#393B40] bg-[#25272B] text-[#868A91] hover:border-[#4E5157] hover:text-[#DFE1E5]'
                    }`}
                  >
                    <div className="text-xs font-semibold text-[#DFE1E5] truncate">
                      {preset.label}
                    </div>
                    <div className="text-[11px] font-mono text-[#56A8F5] truncate mt-0.5">
                      {preset.sampleInput}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Input & Metadata Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[#868A91]">
                Walkthrough Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-[#25272B] border border-[#4E5157] text-xs text-[#DFE1E5] focus:outline-none focus:border-[#3574F0]"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-[#868A91]">
                Entry Input Value (Worked Example)
              </label>
              <input
                type="text"
                value={sampleInput}
                onChange={(e) => setSampleInput(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-[#25272B] border border-[#4E5157] text-xs font-mono text-[#56A8F5] focus:outline-none focus:border-[#3574F0]"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-[#868A91]">
                Prepared Store Preview
              </label>
              <input
                type="text"
                value={sampleStorePreview}
                onChange={(e) => setSampleStorePreview(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-[#25272B] border border-[#4E5157] text-xs font-mono text-[#DFE1E5] focus:outline-none focus:border-[#3574F0]"
              />
            </div>
          </div>

          {/* Source Code Editor */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-[#DFE1E5] flex items-center gap-1.5">
                <Code2 className="w-4 h-4 text-[#56A8F5]" />
                <span>Python Pipeline Code ({fileName})</span>
              </label>
              <span className="font-mono text-[11px] text-[#868A91]">
                Each assignment compiles into a macro node + Level-1 sub-graph + Level-2 flowchart
              </span>
            </div>
            <textarea
              rows={6}
              value={sourceCode}
              onChange={(e) => setSourceCode(e.target.value)}
              spellCheck={false}
              className="w-full p-3 rounded bg-[#25272B] border border-[#4E5157] font-mono text-xs sm:text-sm text-[#DFE1E5] leading-relaxed focus:outline-none focus:border-[#3574F0]"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-2.5 bg-[#2B2D30] border-t border-[#393B40] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onFillCurrentWalkthroughGaps}
            disabled={aiFillStatus === 'filling'}
            className="min-h-[32px] px-3 py-1 rounded border border-[#4E5157] bg-[#35373B] text-[#DFE1E5] hover:bg-[#3E4146] disabled:opacity-50 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            {aiFillStatus === 'filling' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#56A8F5]" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-[#56A8F5]" />
            )}
            <span>Re-Fill Current Walkthrough Gaps with AI</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onCompileWalkthrough({
                  title,
                  fileName,
                  sourceCode,
                  sampleInput,
                  sampleStoreLabel,
                  sampleStorePreview,
                  runAiGapFill: false,
                });
                onClose();
              }}
              className="min-h-[32px] px-3 py-1 rounded border border-[#4E5157] bg-[#35373B] text-[#6AAB73] hover:bg-[#3E4146] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Compile Pipeline Procedurally (&lt;3ms)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onCompileWalkthrough({
                  title,
                  fileName,
                  sourceCode,
                  sampleInput,
                  sampleStoreLabel,
                  sampleStorePreview,
                  runAiGapFill: true,
                });
                onClose();
              }}
              className="min-h-[32px] px-3.5 py-1 rounded bg-[#3574F0] text-white hover:bg-[#4682FA] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Compile Pipeline (&lt;3ms) + AI Fill</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
