import { useEffect, useState } from 'react';
import type { ChatMessage as ChatMessageType, SuggestElement } from '../../types';
import QuestionCard from './QuestionCard';
import RefinementResult from './RefinementResult';

interface Props {
  message: ChatMessageType;
  onSelectOption?: (questionId: string, answer: string) => void;
  onPackage?: (content: string, title: string, summary: string) => void;
  onAdoptElement?: (suggest: SuggestElement) => void;
  adopting?: boolean;
}

function ThinkingBlock({ thinking }: { thinking: string }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border border-white/5 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:text-gray-200 bg-white/[0.02] transition-colors"
      >
        <span className="transform transition-transform" style={{ rotate: open ? '90deg' : '0deg' }}>
          ▶
        </span>
        <span>{open ? '收起思考过程' : '查看思考过程'}</span>
      </button>
      {open && (
        <div className="px-3 py-2 border-t border-white/5 text-xs text-gray-500 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
          {thinking}
        </div>
      )}
    </div>
  );
}

export default function ChatMessage({ message, onSelectOption, onPackage, onAdoptElement, adopting }: Props) {
  const isUser = message.role === 'user';
  const isRefinement = message.type === 'refinement';
  const hasQuestions = message.metadata?.questions && message.metadata.questions.length > 0;
  const isStreaming = message.role === 'assistant' && !message.metadata && !isRefinement;
  const suggestElement = message.metadata?.suggestElement;

  const handlePackage = () => {
    const meta = message.metadata;
    const title = meta?.suggestedTags?.[0]
      ? `${meta.suggestedTags[0]}：${meta.refinedContent?.slice(0, 20) || ''}`
      : meta?.refinedContent?.slice(0, 40) || '新想法';
    const summary = meta?.refinedContent?.slice(0, 80) || message.content.slice(0, 80);
    onPackage?.(meta?.refinedContent || message.content, title, summary);
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[85%] ${isUser ? 'order-1' : ''}`}>
        {isUser ? (
          <div className="px-4 py-2 rounded-2xl bg-[#00d4ff]/15 border border-[#00d4ff]/20 text-white text-sm">
            {message.content}
          </div>
        ) : (
          <div className="space-y-3">
            {message.thinking && <ThinkingBlock thinking={message.thinking} />}

            {hasQuestions && onSelectOption && message.metadata && (
              <QuestionCard
                questions={message.metadata.questions!}
                onSubmit={onSelectOption}
              />
            )}

            {isRefinement && (
              <RefinementResult
                content={message.metadata?.refinedContent || message.content}
                note={message.metadata?.refinementNote}
                tags={message.metadata?.suggestedTags}
                onPackage={handlePackage}
              />
            )}

            {/* Streaming or regular text content */}
            {!hasQuestions && !isRefinement && !message.metadata?.analysis && (
              <div className="glass p-3 text-sm text-gray-200 leading-relaxed">
                {message.content || (isStreaming ? '' : message.content)}
                {isStreaming && (
                  <StreamingCursor text={message.content} />
                )}
              </div>
            )}

            {/* AI-suggested element crystallization */}
            {suggestElement && onAdoptElement && (
              <div className="p-3 rounded-xl bg-[#34d399]/10 border border-[#34d399]/30 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🌱</span>
                  <span className="text-xs font-medium text-[#34d399]">AI 建议固化为元素</span>
                </div>
                <div className="text-sm text-white font-medium">{suggestElement.title}</div>
                {suggestElement.summary && (
                  <div className="text-xs text-gray-300 leading-relaxed">{suggestElement.summary}</div>
                )}
                {suggestElement.reason && (
                  <div className="text-[10px] text-gray-500 leading-relaxed">理由：{suggestElement.reason}</div>
                )}
                <button
                  onClick={() => onAdoptElement(suggestElement)}
                  disabled={adopting}
                  className="w-full py-1.5 rounded-lg bg-[#34d399]/20 border border-[#34d399]/40 text-[#34d399] text-xs font-medium hover:bg-[#34d399]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {adopting ? '生成中…' : '➕ 采纳为元素'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Blinking cursor that animates while content streams in
function StreamingCursor({ text }: { text: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => setVisible((v) => !v), 530);
    return () => clearInterval(interval);
  }, []);

  return (
    <span
      className="inline-block w-[2px] h-[1.1em] align-text-bottom ml-0.5 rounded-sm transition-opacity duration-75"
      style={{
        backgroundColor: visible ? '#a78bfa' : 'transparent',
      }}
    >
      {/* Show a visible text fragment when cursor is "off" for readability */}
      {!visible && !text && <span className="opacity-0">|</span>}
    </span>
  );
}
