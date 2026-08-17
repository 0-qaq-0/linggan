import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { AgentMessage, CardNodeData } from '../types';
import { runAgent } from '../services/agentService';
import { dispatchAction } from '../services/agentActions';
import { useCanvasStore } from './useCanvasStore';
import { useSessionStore } from './useSessionStore';

interface AgentState {
  messages: AgentMessage[];
  isThinking: boolean;
  error: string | null;

  send: (text: string) => Promise<void>;
  confirm: (messageId: string) => Promise<string[]>;
  reject: (messageId: string) => void;
  reset: () => void;
  clearError: () => void;
}

/** Compact snapshot of the canvas so the agent can reference elements by title. */
function buildCanvasContext(): string {
  const nodes = useCanvasStore.getState().nodes;
  if (nodes.length === 0) return '（画布为空）';
  return nodes
    .map((n) => {
      const d = n.data as CardNodeData;
      return `- ${d.title}${d.kind === 'theme' ? '（主题）' : ''}${d.tags?.length ? ` [${d.tags.join(', ')}]` : ''}`;
    })
    .join('\n');
}

export const useAgentStore = create<AgentState>((set, get) => ({
  messages: [],
  isThinking: false,
  error: null,

  send: async (text) => {
    const { provider, model, apiKey, baseURL } = useSessionStore.getState();
    if (!apiKey) {
      set({ error: '请先在设置中配置 API 密钥' });
      return;
    }

    const userMsg: AgentMessage = {
      id: nanoid(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    set((s) => ({ messages: [...s.messages, userMsg], isThinking: true, error: null }));

    try {
      const history = get().messages.map((m) => ({ role: m.role, content: m.content }));
      const { reply, actions } = await runAgent({
        messages: history,
        canvasContext: buildCanvasContext(),
        provider,
        model,
        apiKey,
        baseURL: baseURL || undefined,
      });

      const assistantMsg: AgentMessage = {
        id: nanoid(),
        role: 'assistant',
        content: reply,
        actions: actions.length > 0 ? actions : undefined,
        status: actions.length > 0 ? 'pending' : undefined,
        timestamp: Date.now(),
      };
      set((s) => ({ messages: [...s.messages, assistantMsg], isThinking: false }));
    } catch (e: any) {
      set({ error: e.message, isThinking: false });
    }
  },

  confirm: async (messageId) => {
    const msg = get().messages.find((m) => m.id === messageId);
    if (!msg || !msg.actions) return [];

    const results: string[] = [];
    for (const action of msg.actions) {
      try {
        results.push(await dispatchAction(action));
      } catch (e: any) {
        results.push(`执行失败：${e.message}`);
      }
    }

    // Mark as executed and append a system-style feedback message for follow-up context
    set((s) => ({
      messages: s.messages
        .map((m) => (m.id === messageId ? { ...m, status: 'executed' as const } : m))
        .concat({
          id: nanoid(),
          role: 'assistant',
          content: '✅ 已执行：\n' + results.map((r) => `· ${r}`).join('\n'),
          timestamp: Date.now(),
        }),
    }));

    return results;
  },

  reject: (messageId) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId ? { ...m, status: 'rejected' as const } : m,
      ),
    }));
  },

  reset: () => set({ messages: [], isThinking: false, error: null }),
  clearError: () => set({ error: null }),
}));
