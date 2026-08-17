import { useState } from 'react';
import { motion } from 'framer-motion';
import type { AIQuestion } from '../../types';

interface Props {
  questions: AIQuestion[];
  onSubmit: (questionId: string, answer: string) => void;
}

export default function QuestionCard({ questions, onSubmit }: Props) {
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});

  const handleOptionSelect = (questionId: string, option: string) => {
    if (submittedIds.has(questionId)) return;
    setSubmittedIds((prev) => new Set(prev).add(questionId));
    onSubmit(questionId, option);
  };

  const handleCustomSubmit = (questionId: string) => {
    const custom = customInputs[questionId]?.trim();
    if (custom && !submittedIds.has(questionId)) {
      setSubmittedIds((prev) => new Set(prev).add(questionId));
      onSubmit(questionId, custom);
    }
  };

  return (
    <div className="space-y-4">
      {questions.map((q, qi) => {
        const submitted = submittedIds.has(q.id);
        return (
          <motion.div
            key={q.id}
            className="glass p-4 space-y-3"
            initial={{ opacity: 0, x: -10 }}
            animate={submitted ? { opacity: 0.5 } : { opacity: 1, x: 0 }}
            transition={{ delay: qi * 0.1 }}
          >
            <p className="text-sm font-medium text-white">{q.question}</p>
            <div className="space-y-1.5">
              {q.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => handleOptionSelect(q.id, opt)}
                  disabled={submitted}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                    submitted
                      ? 'bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff]/60 cursor-default'
                      : 'bg-white/5 border border-white/5 text-gray-300 hover:border-[#00d4ff]/30 hover:text-[#00d4ff]'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>

            {/* Custom answer input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={customInputs[q.id] || ''}
                onChange={(e) => setCustomInputs((prev) => ({ ...prev, [q.id]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit(q.id)}
                placeholder="或输入你自己的回答..."
                disabled={submitted}
                className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#a78bfa] transition-colors disabled:opacity-40"
              />
              <button
                onClick={() => handleCustomSubmit(q.id)}
                disabled={submitted || !customInputs[q.id]?.trim()}
                className="px-3 py-1.5 rounded-lg bg-[#a78bfa]/20 border border-[#a78bfa]/30 text-[#a78bfa] text-xs hover:bg-[#a78bfa]/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                确认
              </button>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
