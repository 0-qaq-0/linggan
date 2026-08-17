import type { ChatMessage, AIProvider, AIRecommendation } from '../types';
import { authFetch } from './authFetch';

// ── Test connection ──

interface TestResult {
  success: boolean;
  models: string[];
  error?: string;
}

export async function testConnection(
  provider: AIProvider,
  apiKey: string,
  baseURL?: string,
): Promise<TestResult> {
  const res = await authFetch('/api/ai/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, apiKey, baseURL: baseURL || undefined }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }));
    return { success: false, models: [], error: err.error || '服务器错误' };
  }

  return res.json();
}

// ── Chat ──

interface ChatRequest {
  messages: { role: string; content: string }[];
  systemPrompt?: string;
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseURL?: string;
}

interface ChatResponse {
  content: string;
  parsed: {
    phase?: string;
    analysis?: string;
    questions?: { id: string; question: string; options: string[]; stepLabel?: string }[];
    refinedIdea?: string;
    refinementNote?: string;
    suggestedTags?: string[];
    suggestElement?: { title: string; summary: string; reason?: string };
  } | null;
}

export async function sendChatMessage(params: ChatRequest): Promise<ChatResponse> {
  const res = await authFetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }));
    throw new Error(err.error || 'AI 请求失败');
  }

  return res.json();
}

// ── Streaming Chat ──

export interface StreamEvent {
  chunk?: string;
  thinking?: string;
  done?: boolean;
  parsed?: ChatResponse['parsed'];
  error?: string;
}

export async function* streamChatMessage(params: ChatRequest): AsyncGenerator<StreamEvent> {
  const res = await authFetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, stream: true }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }));
    throw new Error(err.error || 'AI 请求失败');
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('浏览器不支持流式读取');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          yield data;
        } catch {
          // skip invalid JSON lines
        }
      }
    }
  }

  // Process remaining buffer
  if (buffer.startsWith('data: ')) {
    try {
      const data = JSON.parse(buffer.slice(6));
      yield data;
    } catch { /* skip */ }
  }
}

// ── Summarize to element ──

interface SummarizeRequest {
  messages: { role: string; content: string }[];
  focus?: string;
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseURL?: string;
}

export interface SummarizedElement {
  title: string;
  summary: string;
  content: string;
  tags: string[];
}

export async function summarizeToElement(
  params: SummarizeRequest,
): Promise<SummarizedElement> {
  const res = await authFetch('/api/ai/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }));
    throw new Error(err.error || 'AI 总结失败');
  }

  const data = await res.json();
  const el = data.element;
  if (!el || !el.title) {
    // Fallback: derive a minimal element from raw content
    const raw: string = data.content || '';
    return {
      title: raw.slice(0, 16) || '新元素',
      summary: raw.slice(0, 60),
      content: raw,
      tags: [],
    };
  }
  return {
    title: el.title,
    summary: el.summary || '',
    content: el.content || el.summary || '',
    tags: Array.isArray(el.tags) ? el.tags : [],
  };
}

// ── Recommend ──

interface RecommendRequest {
  cardTitle: string;
  cardContent: string;
  canvasContext: string;
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseURL?: string;
}

export async function getRecommendations(
  params: RecommendRequest,
): Promise<AIRecommendation[]> {
  const res = await authFetch('/api/ai/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }));
    throw new Error(err.error || 'AI 推荐请求失败');
  }

  const data = await res.json();
  return data.recommendations || [];
}

// Extract JSON from AI response (handles markdown code fences)
export function extractJSON(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch { /* continue */ }
    }
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch { /* give up */ }
    }
    return null;
  }
}
