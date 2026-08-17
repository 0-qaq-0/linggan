import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { IdeationStep, StepElement } from '../../types';

interface Props {
  steps: IdeationStep[];
  currentStepIndex: number;
  stepElements: StepElement[];
  isThinking: boolean;
  onRollbackToStep: (stepIndex: number) => void;
  onOpenCardDetail: (cardId: string | null) => void;
}

function shortLabel(question: string, maxLen = 16): string {
  const cleaned = question
    .replace(/[？?]$/, '')
    .trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + '…' : cleaned;
}

/**
 * Vertical node-graph view of the ideation steps and the canvas elements
 * crystallized from them. Click a step to backtrack; click an element to open it.
 */
export default function RollbackGraph({
  steps,
  currentStepIndex,
  stepElements,
  isThinking,
  onRollbackToStep,
  onOpenCardDetail,
}: Props) {
  const [confirmIndex, setConfirmIndex] = useState<number | null>(null);

  if (steps.length === 0) return null;

  const elementsForStep = (stepId: string) =>
    stepElements.filter((se) => se.stepId === stepId);

  const handleStepClick = (index: number) => {
    if (index === currentStepIndex || isThinking) return;
    setConfirmIndex(index);
  };

  return (
    <div className="px-4 py-3 border-b border-white/5 max-h-64 overflow-y-auto scrollbar-thin">
      <AnimatePresence>
        {confirmIndex !== null && (
          <motion.div
            className="mb-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-between"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <span className="text-xs text-yellow-300">
              回溯到节点 {confirmIndex + 1}？之后的进度将被丢弃。
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onRollbackToStep(confirmIndex);
                  setConfirmIndex(null);
                }}
                className="px-2 py-0.5 rounded text-xs bg-yellow-500/30 text-yellow-200 hover:bg-yellow-500/50 transition-colors"
              >
                确认
              </button>
              <button
                onClick={() => setConfirmIndex(null)}
                className="px-2 py-0.5 rounded text-xs bg-white/10 text-gray-300 hover:bg-white/20 transition-colors"
              >
                取消
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-0.5">
        {steps.map((step, idx) => {
          const isCurrent = idx === currentStepIndex;
          const isPast = idx < currentStepIndex;
          const isClickable = isPast && !isThinking;
          const els = elementsForStep(step.id);

          return (
            <div key={step.id} className="flex flex-col">
              {/* Connector from previous node */}
              {idx > 0 && (
                <div className={`ml-[11px] w-px h-2 ${isPast || isCurrent ? 'bg-[#00d4ff]/40' : 'bg-white/10'}`} />
              )}

              <div className="flex items-start gap-2">
                <button
                  onClick={() => handleStepClick(idx)}
                  disabled={!isClickable && !isCurrent}
                  title={step.question}
                  className={`mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold shrink-0 transition-colors ${
                    isCurrent
                      ? 'bg-[#00d4ff] text-black'
                      : isPast
                        ? 'bg-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/50 cursor-pointer'
                        : 'bg-white/10 text-gray-500'
                  }`}
                >
                  {idx + 1}
                </button>

                <div className="flex-1 min-w-0 pb-1">
                  <button
                    onClick={() => handleStepClick(idx)}
                    disabled={!isClickable && !isCurrent}
                    className={`text-left text-xs leading-snug transition-colors ${
                      isCurrent
                        ? 'text-[#00d4ff] font-medium'
                        : isPast
                          ? 'text-gray-300 hover:text-white cursor-pointer'
                          : 'text-gray-600'
                    }`}
                  >
                    {shortLabel(step.question)}
                  </button>

                  {/* Crystallized elements branching off this step */}
                  {els.length > 0 && (
                    <div className="mt-1 flex flex-col gap-1">
                      {els.map((se) => (
                        <button
                          key={se.cardId}
                          onClick={() => onOpenCardDetail(se.cardId)}
                          className="self-start inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-[#34d399]/10 border border-[#34d399]/30 text-[#34d399] hover:bg-[#34d399]/20 transition-colors"
                          title="打开该画布元素"
                        >
                          🌱 已固化元素
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {isThinking && (
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/10 text-[10px]">
              <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}>
                ···
              </motion.span>
            </span>
            <span className="text-[10px] text-gray-500">思考中</span>
          </div>
        )}
      </div>
    </div>
  );
}
