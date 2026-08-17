import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAgentStore } from '../../store/useAgentStore';
import { describeAction } from '../../services/agentActions';
import ThinkingIndicator from '../chat/ThinkingIndicator';

interface Props {
  onClose: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function AgentPanel({ onClose, onShowToast }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const { messages, isThinking, error, send, confirm, reject, reset, clearError } = useAgentStore();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const handleSend = () => {
    const text = inputRef.current?.value?.trim();
    if (!text || isThinking) return;
    send(text);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleConfirm = async (messageId: string) => {
    const results = await confirm(messageId);
    onShowToast(`已执行 ${results.length} 个操作`);
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed right-0 top-12 bottom-0 w-[380px] glass border-l border-white/10 z-40 flex flex-col"
        initial={{ x: 380 }}
        animate={{ x: 0 }}
        exit={{ x: 380 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-base">🤖</span>
            <h2 className="text-sm font-semibold text-white">AI 助手</h2>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button onClick={reset} className="text-xs text-gray-400 hover:text-white transition-colors">
                清空
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin space-y-3">
          {messages.length === 0 && !isThinking && (
            <div className="text-center space-y-2 mt-8">
              <span className="text-3xl">🪄</span>
              <p className="text-sm text-gray-400">用自然语言指挥我操作画布</p>
              <div className="mt-4 space-y-2">
                {[
                  '创建一个叫"目标用户"的元素，连接到主题',
                  '把"核心功能"这个卡片改成绿色',
                  '从"商业模式"引出新的提问',
                ].map((ex) => (
                  <button
                    key={ex}
                    onClick={() => {
                      if (inputRef.current) inputRef.current.value = ex;
                      handleSend();
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-white/5 border border-white/5 text-gray-400 text-xs hover:border-white/20 transition-colors"
                  >
                    💬 {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[90%] space-y-2">
                {msg.role === 'user' ? (
                  <div className="px-3 py-2 rounded-2xl bg-[#00d4ff]/15 border border-[#00d4ff]/20 text-white text-sm">
                    {msg.content}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {msg.content && (
                      <div className="glass p-3 text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </div>
                    )}

                    {/* Pending actions → confirmation card */}
                    {msg.actions && msg.actions.length > 0 && (
                      <div
                        className={`p-3 rounded-xl border space-y-2 ${
                          msg.status === 'executed'
                            ? 'bg-[#34d399]/5 border-[#34d399]/20'
                            : msg.status === 'rejected'
                              ? 'bg-white/5 border-white/10 opacity-60'
                              : 'bg-[#a78bfa]/10 border-[#a78bfa]/30'
                        }`}
                      >
                        <div className="text-[10px] uppercase tracking-wider text-gray-400">
                          待执行操作（{msg.actions.length}）
                        </div>
                        <ul className="space-y-1">
                          {msg.actions.map((a, i) => (
                            <li key={i} className="text-xs text-gray-200 flex items-start gap-1.5">
                              <span className="text-[#a78bfa]">•</span>
                              <span>{describeAction(a)}</span>
                            </li>
                          ))}
                        </ul>

                        {msg.status === 'pending' && (
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => handleConfirm(msg.id)}
                              className="flex-1 py-1.5 rounded-lg bg-gradient-to-r from-[#00d4ff] to-[#a78bfa] text-white text-xs font-medium hover:opacity-90 transition-opacity"
                            >
                              确认执行
                            </button>
                            <button
                              onClick={() => reject(msg.id)}
                              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-xs hover:bg-white/10 transition-colors"
                            >
                              取消
                            </button>
                          </div>
                        )}
                        {msg.status === 'executed' && (
                          <div className="text-[10px] text-[#34d399]">已执行</div>
                        )}
                        {msg.status === 'rejected' && (
                          <div className="text-[10px] text-gray-500">已取消</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isThinking && <ThinkingIndicator />}

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
              <button onClick={clearError} className="ml-2 underline text-xs">关闭</button>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-white/10 shrink-0">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="让助手帮你操作画布..."
              disabled={isThinking}
              className="flex-1 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00d4ff] transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={isThinking}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00d4ff] to-[#a78bfa] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              发送
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
