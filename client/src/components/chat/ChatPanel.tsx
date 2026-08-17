import { useRef, useEffect, useState } from 'react';
import { useSessionStore } from '../../store/useSessionStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import type { SuggestElement } from '../../types';
import ChatMessage from './ChatMessage';
import ThinkingIndicator from './ThinkingIndicator';
import StepIndicator from './StepIndicator';
import RollbackGraph from './RollbackGraph';

interface Props {
  onOpenCardDetail: (cardId: string | null) => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function ChatPanel({ onOpenCardDetail, onShowToast }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showParentMenu, setShowParentMenu] = useState(false);
  const [traceView, setTraceView] = useState<'timeline' | 'graph'>('timeline');

  const {
    phase,
    chatHistory,
    isThinking,
    error,
    historyStack,
    steps,
    currentStepIndex,
    stepElements,
    anchorCardId,
    rootCardId,
    isSummarizing,
    submitIdea,
    submitAnswer,
    submitCustomAnswer,
    continueChat,
    summarizeToElement,
    crystallizeElement,
    rollback,
    rollbackToStep,
    resetSession,
    clearError,
  } = useSessionStore();

  const { nodes } = useCanvasStore();

  const cardTitleById = (id: string | null) => {
    if (!id) return '';
    const node = nodes.find((n) => n.id === id);
    return (node?.data as { title?: string } | undefined)?.title || '';
  };

  const canSummarize =
    phase !== 'idle' && chatHistory.length >= 2 && !isThinking && !isSummarizing;

  const runSummarize = async (parentId?: string) => {
    setShowParentMenu(false);
    const cardId = await summarizeToElement(parentId !== undefined ? { parentId } : undefined);
    if (cardId) onShowToast('已总结为画布元素');
  };

  const handleSummarizeClick = () => {
    // If both an advancing anchor and a distinct root exist, let the user choose attach point.
    if (rootCardId && anchorCardId && rootCardId !== anchorCardId) {
      setShowParentMenu((v) => !v);
    } else {
      runSummarize();
    }
  };

  const handleAdopt = async (suggest: SuggestElement) => {
    const cardId = await summarizeToElement({
      focus: `${suggest.title}：${suggest.summary}`,
    });
    if (cardId) onShowToast('已采纳为画布元素');
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isThinking]);

  const handleSubmit = () => {
    const text = inputRef.current?.value?.trim();
    if (!text) return;

    if (phase === 'idle') {
      submitIdea(text);
    } else if (phase === 'questions') {
      submitCustomAnswer(text);
    } else {
      continueChat(text);
    }

    if (inputRef.current) inputRef.current.value = '';
  };

  const handlePackage = async (content: string, title: string, summary: string) => {
    const cardId = await crystallizeElement({ title, content, summary });
    if (cardId) onShowToast('精炼结果已固化为画布元素');
  };

  const handleNewIdea = () => {
    resetSession();
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">对话</h2>
        <div className="flex items-center gap-2 relative">
          {canSummarize && (
            <button
              onClick={handleSummarizeClick}
              disabled={isSummarizing}
              className="text-xs text-[#34d399] hover:text-[#6ee7b7] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="把当前对话总结为画布元素"
            >
              {isSummarizing ? '✨ 总结中…' : '✨ 总结为元素'}
            </button>
          )}
          {showParentMenu && (
            <div className="absolute top-6 right-0 z-30 w-52 glass p-2 space-y-1 border border-white/10 rounded-lg">
              <button
                onClick={() => runSummarize()}
                className="w-full text-left px-2 py-1.5 rounded text-xs text-gray-200 hover:bg-white/10 transition-colors"
              >
                链式：接到当前节点
                <span className="block text-[10px] text-gray-500 truncate">{cardTitleById(anchorCardId) || '锚点'}</span>
              </button>
              <button
                onClick={() => rootCardId && runSummarize(rootCardId)}
                className="w-full text-left px-2 py-1.5 rounded text-xs text-gray-200 hover:bg-white/10 transition-colors"
              >
                放射：接到主题根
                <span className="block text-[10px] text-gray-500 truncate">{cardTitleById(rootCardId) || '主题'}</span>
              </button>
            </div>
          )}
          {(historyStack.length > 0 || steps.length > 0) && (
            <button
              onClick={() => {
                if (steps.length > 0 && currentStepIndex > 0) {
                  rollbackToStep(currentStepIndex - 1);
                } else {
                  rollback();
                }
              }}
              disabled={isThinking}
              className="text-xs text-gray-400 hover:text-yellow-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="撤销上一步对话"
            >
              ↩ 回退
            </button>
          )}
          {phase !== 'idle' && (
            <button
              onClick={handleNewIdea}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              + 新想法
            </button>
          )}
        </div>
      </div>

      {/* Trace: timeline / graph toggle */}
      {steps.length > 0 && (
        <div className="px-4 pt-2 flex items-center gap-1">
          <button
            onClick={() => setTraceView('timeline')}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              traceView === 'timeline' ? 'bg-[#00d4ff]/20 text-[#00d4ff]' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            时间线
          </button>
          <button
            onClick={() => setTraceView('graph')}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              traceView === 'graph' ? 'bg-[#00d4ff]/20 text-[#00d4ff]' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            节点图
          </button>
        </div>
      )}

      {/* Step trace */}
      {traceView === 'timeline' ? (
        <StepIndicator
          steps={steps}
          currentStepIndex={currentStepIndex}
          isThinking={isThinking}
          onRollbackToStep={rollbackToStep}
        />
      ) : (
        <RollbackGraph
          steps={steps}
          currentStepIndex={currentStepIndex}
          stepElements={stepElements}
          isThinking={isThinking}
          onRollbackToStep={rollbackToStep}
          onOpenCardDetail={onOpenCardDetail}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin">
        {phase === 'idle' && chatHistory.length === 0 && !isThinking && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
            <span className="text-4xl">💡</span>
            <p className="text-sm text-gray-400">输入一个初始想法，AI 将引导你</p>
            <p className="text-sm text-gray-400">一步步深入和完善它</p>
            <div className="mt-6 space-y-2 w-full">
              {[
                '我想当一个画家',
                '我想开发一个 App',
                '我想学习一门新技能',
              ].map((example) => (
                <button
                  key={example}
                  onClick={() => {
                    if (inputRef.current) {
                      inputRef.current.value = example;
                    }
                    handleSubmit();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg bg-white/5 border border-white/5 text-gray-400 text-xs hover:border-white/20 transition-colors"
                >
                  💬 {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {chatHistory.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onSelectOption={(qId, answer) => submitAnswer(qId, answer)}
            onPackage={handlePackage}
            onAdoptElement={handleAdopt}
            adopting={isSummarizing}
          />
        ))}

        {isThinking && <ThinkingIndicator />}

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm mb-4">
            {error}
            <button
              onClick={clearError}
              className="ml-2 underline text-xs"
            >
              关闭
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/5">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder={
              phase === 'idle'
                ? '输入你的初始想法...'
                : phase === 'final'
                  ? '继续完善或输入新想法...'
                  : '输入你的回答或自定义方向...'
            }
            className="flex-1 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00d4ff] transition-colors"
            disabled={isThinking}
          />
          <button
            onClick={handleSubmit}
            disabled={isThinking}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00d4ff] to-[#a78bfa] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
