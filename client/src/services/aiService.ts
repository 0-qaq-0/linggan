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
      const event = parseSSELine(line);
      if (event !== null) yield event;
    }
  }

  // 收尾：流结束时缓冲区里可能还剩最后一行（服务端没以换行结尾的情况）
  if (buffer.length > 0) {
    const event = parseSSELine(buffer);
    if (event !== null) yield event;
  }
}

/**
 * 解析一行 SSE 数据。
 *
 * 为什么单独抽出来：
 *  1. SSE 规范允许行尾是 \r\n（很多反向代理会改写行尾）。旧实现只按 \n 切分，
 *     行尾会残留 \r，之所以还能跑通纯粹是因为 JSON.parse 容忍尾部空白——
 *     属于"依赖巧合的正确"，换个解析器就会出问题。
 *  2. 规范里 `data:` 后面不强制要求空格（`data:{...}` 同样合法），
 *     旧实现只认 `data: ` 这一种写法。
 *  3. 需要忽略空行和 `:` 开头的注释行（SSE 心跳常用）。
 *
 * @returns 解析出的事件对象；该行不是有效数据时返回 null
 */
export function parseSSELine(rawLine: string): StreamEvent | null {
  // 去掉 \r\n 里的 \r，以及首尾空白
  const line = rawLine.replace(/\r$/, '').trim();
  if (line.length === 0) return null; // 空行：事件分隔符
  if (line.startsWith(':')) return null; // 注释行：SSE 心跳

  if (!line.startsWith('data:')) return null;

  const payload = line.slice(5).trimStart();
  if (payload.length === 0) return null;

  try {
    return JSON.parse(payload) as StreamEvent;
  } catch {
    // 单行 JSON 不完整（理论上不会发生，因为服务端按行写完整 JSON）
    return null;
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
