import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { IdeationStep } from '../../types';

interface Props {
  steps: IdeationStep[];
  currentStepIndex: number;
  isThinking: boolean;
  onRollbackToStep: (stepIndex: number) => void;
}

/** Extract a short display label from a question string */
function shortLabel(question: string, maxLen = 10): string {
  // Remove common question prefixes
  const cleaned = question
    .replace(/^(你|您)认为/, '')
    .replace(/^(你|您)觉得/, '')
    .replace(/^(你|您)想/, '')
    .replace(/^(你|您)希望/, '')
    .replace(/^(你|您)打算/, '')
    .replace(/^(你|您)准备/, '')
    .replace(/^(你|您)的/, '')
    .replace(/[？?？]$/, '')
    .trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + '…' : cleaned;
}

export default function StepIndicator({ steps, currentStepIndex, isThinking, onRollbackToStep }: Props) {
  const [confirmIndex, setConfirmIndex] = useState<number | null>(null);

  if (steps.length === 0) return null;

  const handleStepClick = (index: number) => {
    // Can only rollback to completed steps (not the current one being answered)
    if (index === currentStepIndex) return;
    if (isThinking) return;
    setConfirmIndex(index);
  };

  const handleConfirm = () => {
    if (confirmIndex !== null) {
      onRollbackToStep(confirmIndex);
      setConfirmIndex(null);
    }
  };

  const handleCancel = () => setConfirmIndex(null);

  return (
    <div className="px-4 py-2 border-b border-white/5">
      {/* Confirmation bar */}
      <AnimatePresence>
        {confirmIndex !== null && (
          <motion.div
            className="mb-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-between"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <span className="text-xs text-yellow-300">
              回溯到步骤 {confirmIndex + 1}？之后的进度将被丢弃。
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleConfirm}
                className="px-2 py-0.5 rounded text-xs bg-yellow-500/30 text-yellow-200 hover:bg-yellow-500/50 transition-colors"
              >
                确认
              </button>
              <button
                onClick={handleCancel}
                className="px-2 py-0.5 rounded text-xs bg-white/10 text-gray-300 hover:bg-white/20 transition-colors"
              >
                取消
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step timeline */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
        {steps.map((step, idx) => {
          const isCurrent = idx === currentStepIndex;
          const isPast = idx < currentStepIndex;
          const isClickable = isPast && !isThinking;

          return (
            <div key={step.id} className="flex items-center gap-1 shrink-0">
              {/* Connector line before (except first) */}
              {idx > 0 && (
                <div
                  className={`w-3 h-px ${isPast ? 'bg-[#00d4ff]/40' : 'bg-white/10'}`}
                />
              )}

              {/* Step dot + label */}
              <button
                onClick={() => handleStepClick(idx)}
                disabled={!isClickable && !isCurrent}
                title={step.question}
                className={`group flex items-center gap-1.5 px-1.5 py-1 rounded-lg transition-all ${
                  isClickable
                    ? 'cursor-pointer hover:bg-white/5'
                    : 'cursor-default'
                }`}
              >
                {/* Circle indicator */}
                <span
                  className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 transition-colors ${
                    isCurrent
                      ? 'bg-[#00d4ff] text-black'
                      : isPast
                        ? 'bg-[#00d4ff]/30 text-[#00d4ff] group-hover:bg-[#00d4ff]/50'
                        : 'bg-white/10 text-gray-500'
                  }`}
                >
                  {idx + 1}
                </span>

                {/* Step label */}
                <span
                  className={`text-[10px] whitespace-nowrap transition-colors ${
                    isCurrent
                      ? 'text-[#00d4ff] font-medium'
                      : isPast
                        ? 'text-gray-400 group-hover:text-gray-200'
                        : 'text-gray-600'
                  }`}
                >
                  {shortLabel(step.question)}
                </span>
              </button>
            </div>
          );
        })}

        {/* Waiting indicator for next step */}
        {isThinking && (
          <div className="flex items-center gap-1 shrink-0">
            <div className="w-3 h-px bg-white/10" />
            <span className="flex items-center gap-1 px-1.5 py-1">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/10 text-[10px]">
                <motion.span
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  ···
                </motion.span>
              </span>
              <span className="text-[10px] text-gray-500">思考中</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
