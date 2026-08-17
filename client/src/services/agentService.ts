import type { AIProvider, AgentAction } from '../types';
import { authFetch } from './authFetch';

interface AgentRequest {
  messages: { role: string; content: string }[];
  canvasContext: string;
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseURL?: string;
}

interface AgentResponse {
  reply: string;
  actions: AgentAction[];
}

export async function runAgent(params: AgentRequest): Promise<AgentResponse> {
  const res = await authFetch('/api/ai/agent', {
    method: 'POST',
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }));
    throw new Error(err.error || 'AI Agent 请求失败');
  }

  const data = await res.json();
  return {
    reply: data.reply || '',
    actions: Array.isArray(data.actions) ? data.actions : [],
  };
}
