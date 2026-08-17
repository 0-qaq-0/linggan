import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

interface ChatParams {
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
  systemPrompt: string;
  provider: 'anthropic' | 'openai';
  model: string;
  apiKey: string;
  baseURL?: string;
}

const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6';
const DEFAULT_OPENAI_MODEL = 'gpt-4o';

const ANTHROPIC_MODELS = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'claude-opus-4-5',
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
];

const OPENAI_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4',
  'gpt-3.5-turbo',
  'o3-mini',
  'o1',
  'o1-mini',
];

export interface TestResult {
  success: boolean;
  models: string[];
  error?: string;
}

export async function testConnection(
  provider: 'anthropic' | 'openai',
  apiKey: string,
  baseURL?: string,
): Promise<TestResult> {
  try {
    if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
      await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 10,
        system: 'Reply with just "ok".',
        messages: [{ role: 'user', content: 'ping' }],
      });
      return { success: true, models: ANTHROPIC_MODELS };
    } else {
      const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
      const response = await client.models.list();
      let chatModels: string[];
      if (baseURL) {
        chatModels = response.data.map((m) => m.id).sort();
      } else {
        chatModels = response.data
          .filter((m) => m.id.includes('gpt') || m.id.includes('o1') || m.id.includes('o3'))
          .map((m) => m.id)
          .sort();
      }
      const models = [...new Set([...OPENAI_MODELS, ...chatModels])];
      return { success: true, models };
    }
  } catch (error: any) {
    return {
      success: false,
      models: provider === 'anthropic' ? ANTHROPIC_MODELS : OPENAI_MODELS,
      error: error?.message || '连接失败',
    };
  }
}

export async function chatWithAI(params: ChatParams): Promise<string> {
  const { messages, systemPrompt, provider, model, apiKey, baseURL } = params;
  if (provider === 'anthropic') {
    return chatWithAnthropic(messages, systemPrompt, model || DEFAULT_CLAUDE_MODEL, apiKey, baseURL);
  } else {
    return chatWithOpenAI(messages, systemPrompt, model || DEFAULT_OPENAI_MODEL, apiKey, baseURL);
  }
}

// ── Streaming (returns async generator of text chunks) ──

export async function* streamChatWithAI(params: ChatParams): AsyncGenerator<string> {
  const { messages, systemPrompt, provider, model, apiKey, baseURL } = params;

  if (provider === 'anthropic') {
    yield* streamWithAnthropic(messages, systemPrompt, model || DEFAULT_CLAUDE_MODEL, apiKey, baseURL);
  } else {
    yield* streamWithOpenAI(messages, systemPrompt, model || DEFAULT_OPENAI_MODEL, apiKey, baseURL);
  }
}

async function* streamWithAnthropic(
  messages: { role: string; content: string }[],
  systemPrompt: string,
  model: string,
  apiKey: string,
  baseURL?: string,
): AsyncGenerator<string> {
  const client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });

  const anthropicMessages: { role: 'user' | 'assistant'; content: string }[] = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const stream = client.messages.stream({
    model,
    max_tokens: 8192,
    system: systemPrompt,
    messages: anthropicMessages,
    thinking: { type: 'enabled', budget_tokens: 4096 },
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      if (event.delta.type === 'thinking_delta') {
        yield `<think>${event.delta.thinking}</think>`;
      } else if (event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }
}

async function* streamWithOpenAI(
  messages: { role: string; content: string }[],
  systemPrompt: string,
  model: string,
  apiKey: string,
  baseURL?: string,
): AsyncGenerator<string> {
  const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });

  const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ];

  const stream = await client.chat.completions.create({
    model,
    max_tokens: 4096,
    messages: openaiMessages,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta as Record<string, unknown> | undefined;
    if (delta?.reasoning_content && typeof delta.reasoning_content === 'string') {
      yield `<think>${delta.reasoning_content}</think>`;
    }
    if (typeof delta?.content === 'string') {
      yield delta.content;
    }
  }
}

// ── Non-streaming internals ──

async function chatWithAnthropic(
  messages: { role: string; content: string }[],
  systemPrompt: string,
  model: string,
  apiKey: string,
  baseURL?: string,
): Promise<string> {
  const client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
  const anthropicMessages: { role: 'user' | 'assistant'; content: string }[] = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: anthropicMessages,
  });
  const textBlock = response.content.find((block) => block.type === 'text');
  return textBlock?.text || '';
}

async function chatWithOpenAI(
  messages: { role: string; content: string }[],
  systemPrompt: string,
  model: string,
  apiKey: string,
  baseURL?: string,
): Promise<string> {
  const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];
  const response = await client.chat.completions.create({
    model,
    max_tokens: 4096,
    messages: openaiMessages,
  });
  return response.choices[0]?.message?.content || '';
}
