import React from 'react';
import { X, CheckCircle2, XCircle, FileText } from 'lucide-react';
import { FINAL_SCRIPTED_ANSWER, PREPARED_DOCUMENTS } from '../data/ragGraph';

interface EvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  highlightedDocId: string | null;
  onSelectDoc: (docId: string) => void;
}

export const EvidenceModal: React.FC<EvidenceModalProps> = ({
  isOpen,
  onClose,
  highlightedDocId,
  onSelectDoc,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Prepared document candidates and supporting evidence"
      className="fixed inset-0 z-50 bg-[#0B1717]/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#142B25] border border-[#E0BE72] rounded shadow-2xl overflow-hidden flex flex-col max-h-[86dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 bg-[#0B1717] border-b border-[#486356] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#E0BE72]" />
            <h2 className="text-sm sm:text-base font-semibold text-[#EEF3E9]">
              Prepared Shop Policy Candidates &amp; Evidence Verification
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] px-2.5 py-1 rounded border border-[#486356] bg-[#142B25] text-xs text-[#EEF3E9] hover:border-[#E0BE72] flex items-center gap-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>Close</span>
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4 text-xs sm:text-sm">
          {/* Scripted Answer & Claim Check */}
          <div className="p-3 rounded border border-[#7BD3B0] bg-[#0B1717] space-y-1.5">
            <div className="flex items-center justify-between font-mono text-xs text-[#7BD3B0]">
              <span>Final Scripted Response (Beat 6–7)</span>
              <span>Citation: [refund-policy]</span>
            </div>
            <p className="text-sm text-[#EEF3E9] leading-relaxed">
              &ldquo;{FINAL_SCRIPTED_ANSWER}&rdquo;
            </p>
            <p className="text-xs text-[#B5C5BD]">
              The claim <strong className="text-[#E0BE72]">&ldquo;within 30 days of purchase&rdquo;</strong> is directly supported by the first sentence of <code className="text-[#7BD3B0]">refund-policy</code> below.
            </p>
          </div>

          {/* 3 Prepared Candidates */}
          <div className="space-y-2.5">
            {PREPARED_DOCUMENTS.map((doc) => {
              const isHighlighted = highlightedDocId === doc.id;
              return (
                <div
                  key={doc.id}
                  onClick={() => onSelectDoc(doc.id)}
                  className={`p-3 rounded border transition-colors cursor-pointer ${
                    isHighlighted
                      ? 'border-[#E0BE72] bg-[#1A362E]'
                      : doc.selected
                      ? 'border-[#7BD3B0]/70 bg-[#0B1717]/90'
                      : 'border-[#486356]/60 bg-[#0B1717]/50 opacity-80'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 font-mono text-xs sm:text-sm font-bold text-[#EEF3E9]">
                      {doc.selected ? (
                        <CheckCircle2 className="w-4 h-4 text-[#7BD3B0]" />
                      ) : (
                        <XCircle className="w-4 h-4 text-[#B5C5BD]" />
                      )}
                      <span>{doc.title}</span>
                    </div>
                    <span
                      className={`font-mono text-xs ${
                        doc.selected ? 'text-[#7BD3B0]' : 'text-[#B5C5BD]'
                      }`}
                    >
                      {doc.illustrativeRank}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-[#EEF3E9] leading-relaxed mb-1.5">
                    {doc.supportingSpan ? (
                      <>
                        <mark className="bg-[#E0BE72]/25 text-[#E0BE72] px-1 rounded font-semibold">
                          {doc.supportingSpan}
                        </mark>
                        {doc.text.replace(doc.supportingSpan, '')}
                      </>
                    ) : (
                      doc.text
                    )}
                  </p>

                  <div className="text-xs text-[#B5C5BD]">{doc.reason}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
