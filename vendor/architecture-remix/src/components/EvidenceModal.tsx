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
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#2B2D30] border border-[#4E5157] rounded-md shadow-xl overflow-hidden flex flex-col max-h-[86dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-2.5 bg-[#2B2D30] border-b border-[#393B40] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#56A8F5]" />
            <h2 className="text-sm font-semibold text-[#DFE1E5]">
              Prepared Shop Policy Candidates &amp; Evidence Verification
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[30px] px-2.5 py-1 rounded border border-[#4E5157] bg-[#35373B] text-xs text-[#DFE1E5] hover:bg-[#3E4146] flex items-center gap-1 cursor-pointer transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            <span>Close</span>
          </button>
        </div>

        <div className="p-4 overflow-y-auto bg-[#1E1F22] space-y-4 text-xs sm:text-sm">
          {/* Scripted Answer & Claim Check */}
          <div className="p-3 rounded border border-[#393B40] bg-[#25272B] space-y-1.5">
            <div className="flex items-center justify-between font-mono text-xs text-[#6AAB73]">
              <span>Final Scripted Response (Beat 6–7)</span>
              <span>Citation: [refund-policy]</span>
            </div>
            <p className="text-sm text-[#DFE1E5] leading-relaxed">
              &ldquo;{FINAL_SCRIPTED_ANSWER}&rdquo;
            </p>
            <p className="text-xs text-[#868A91]">
              The claim <strong className="text-[#D9A354]">&ldquo;within 30 days of purchase&rdquo;</strong> is directly supported by the first sentence of <code className="text-[#6AAB73]">refund-policy</code> below.
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
                      ? 'border-[#3574F0] bg-[#263248]'
                      : doc.selected
                      ? 'border-[#6AAB73]/60 bg-[#25272B]'
                      : 'border-[#393B40] bg-[#232529] opacity-80'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 font-mono text-xs sm:text-sm font-bold text-[#DFE1E5]">
                      {doc.selected ? (
                        <CheckCircle2 className="w-4 h-4 text-[#6AAB73]" />
                      ) : (
                        <XCircle className="w-4 h-4 text-[#6F737A]" />
                      )}
                      <span>{doc.title}</span>
                    </div>
                    <span
                      className={`font-mono text-xs ${
                        doc.selected ? 'text-[#6AAB73]' : 'text-[#868A91]'
                      }`}
                    >
                      {doc.illustrativeRank}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-[#BCBEC4] leading-relaxed mb-1.5">
                    {doc.supportingSpan ? (
                      <>
                        <mark className="bg-[#2E436E] text-[#DFE1E5] px-1 rounded font-semibold">
                          {doc.supportingSpan}
                        </mark>
                        {doc.text.replace(doc.supportingSpan, '')}
                      </>
                    ) : (
                      doc.text
                    )}
                  </p>

                  <div className="text-xs text-[#868A91]">{doc.reason}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
