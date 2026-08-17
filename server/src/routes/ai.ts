import { Router, Request, Response } from 'express';
import { chatWithAI, streamChatWithAI, testConnection } from '../services/aiClient.js';
import { IDEATION_SYSTEM_PROMPT } from '../prompts/ideation.js';
import { SUMMARIZE_SYSTEM_PROMPT } from '../prompts/summarize.js';
import { AGENT_SYSTEM_PROMPT } from '../prompts/agent.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

// DeepSeek R1 and similar models wrap chain-of-thought in  标签
function stripThinkTags(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .trim();
}

type ThinkEvent = { type: 'text'; content: string } | { type: 'thinking'; content: string };

// Streaming think-tag processor — separates think content from normal text
function createThinkProcessor() {
  let buffer = '';
  let inThink = false;

  return function process(chunk: string): ThinkEvent[] {
    buffer += chunk;
    const events: ThinkEvent[] = [];

    while (buffer.length > 0) {
      if (inThink) {
        const endMatch = buffer.match(/<\/(think|thinking)>/i);
        if (!endMatch) return events; // still inside, keep buffering
        const thinkContent = buffer.slice(0, endMatch.index!);
        if (thinkContent) events.push({ type: 'thinking', content: thinkContent });
        buffer = buffer.slice(endMatch.index! + endMatch[0].length);
        inThink = false;
      } else {
        const startMatch = buffer.match(/<(think|thinking)>/i);
        if (!startMatch) {
          // Keep a partial "<think" / "<thinking" at the end to avoid splitting tags across chunks
          const lastLt = buffer.lastIndexOf('<');
          if (lastLt !== -1) {
            const suffix = buffer.slice(lastLt);
            if (/^<(?:t(?:h(?:i(?:n(?:k(?:i(?:n(?:g)?)?)?)?)?)?)?)?$/i.test(suffix)) {
              if (lastLt > 0) events.push({ type: 'text', content: buffer.slice(0, lastLt) });
              buffer = suffix;
            } else {
              if (buffer) events.push({ type: 'text', content: buffer });
              buffer = '';
            }
          } else {
            if (buffer) events.push({ type: 'text', content: buffer });
            buffer = '';
          }
        } else {
          if (startMatch.index! > 0) {
            events.push({ type: 'text', content: buffer.slice(0, startMatch.index!) });
          }
          buffer = buffer.slice(startMatch.index! + startMatch[0].length);
          inThink = true;
        }
      }
    }
    return events;
  };
}

// POST /api/ai/test — test API connectivity and list available models
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { provider = 'anthropic', apiKey, baseURL } = req.body;

    if (!apiKey) {
      res.status(400).json({ error: '缺少 API 密钥' });
      return;
    }

    const result = await testConnection(provider, apiKey, baseURL || undefined);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, models: [], error: error?.message || '测试失败' });
  }
});

// POST /api/ai/chat — core AI interaction (supports stream=true for SSE)
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const {
      messages,
      systemPrompt,
      provider = 'anthropic',
      model = '',
      apiKey,
      baseURL,
      stream: isStream = false,
    } = req.body;

    if (!apiKey) {
      res.status(400).json({ error: '缺少 API 密钥' });
      return;
    }

    if (!messages || messages.length === 0) {
      res.status(400).json({ error: '缺少对话消息' });
      return;
    }

    const effectiveSystemPrompt = systemPrompt || IDEATION_SYSTEM_PROMPT;

    if (isStream) {
      // ── SSE Streaming ──
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      let fullRawContent = '';
      let fullCleanContent = '';
      let thinkingCount = 0;
      const thinkProcessor = createThinkProcessor();
      try {
        const stream = streamChatWithAI({
          messages,
          systemPrompt: effectiveSystemPrompt,
          provider,
          model,
          apiKey,
          baseURL: baseURL || undefined,
        });

        for await (const chunk of stream) {
          fullRawContent += chunk;
          const events = thinkProcessor(chunk);
          for (const ev of events) {
            if (ev.type === 'thinking') {
              thinkingCount++;
              console.log(`[思考 #${thinkingCount}] ${ev.content.slice(0, 80)}...`);
              res.write(`data: ${JSON.stringify({ thinking: ev.content })}\n\n`);
            } else {
              fullCleanContent += ev.content;
              res.write(`data: ${JSON.stringify({ chunk: ev.content })}\n\n`);
            }
          }
        }

        console.log(`[思考统计] raw=${fullRawContent.length}chars clean=${fullCleanContent.length}chars thinkingEvents=${thinkingCount}`);

        // If nothing was output (all was think-tagged), use stripped raw content
        const contentToParse = fullCleanContent || stripThinkTags(fullRawContent);

        let parsed = null;
        try {
          const cleaned = contentToParse
            .replace(/```json\s*/gi, '')
            .replace(/```\s*/g, '')
            .trim();
          parsed = JSON.parse(cleaned);
        } catch { /* raw text */ }

        res.write(`data: ${JSON.stringify({ done: true, parsed })}\n\n`);
        res.end();
      } catch (streamError: any) {
        res.write(`data: ${JSON.stringify({ error: streamError?.message || '流式输出中断' })}\n\n`);
        res.end();
      }
    } else {
      // ── Non-streaming (original behavior) ──
      let content = await chatWithAI({
        messages,
        systemPrompt: effectiveSystemPrompt,
        provider,
        model,
        apiKey,
        baseURL: baseURL || undefined,
      });
      content = stripThinkTags(content);

      let parsed = null;
      try {
        const cleaned = content
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/g, '')
          .trim();
        parsed = JSON.parse(cleaned);
      } catch {
        // If parsing fails, return raw content
      }

      res.json({ content, parsed });
    }
  } catch (error: any) {
    console.error('AI API 错误:', error);
    res.status(500).json({
      error: error?.message || 'AI API 调用失败',
    });
  }
});

// POST /api/ai/summarize — crystallize a conversation (or sub-topic) into one canvas element
router.post('/summarize', async (req: Request, res: Response) => {
  try {
    const {
      messages,
      focus,
      provider = 'anthropic',
      model = '',
      apiKey,
      baseURL,
    } = req.body;

    if (!apiKey) {
      res.status(400).json({ error: '缺少 API 密钥' });
      return;
    }
    if (!messages || messages.length === 0) {
      res.status(400).json({ error: '缺少对话消息' });
      return;
    }

    const focusHint = focus
      ? `\n\n请特别聚焦于这个子话题/方向进行总结：${focus}`
      : '';

    const summarizeMessages = [
      ...messages,
      {
        role: 'user',
        content: `请把以上对话凝练成一个画布想法元素，严格按 JSON 输出。${focusHint}`,
      },
    ];

    let content = await chatWithAI({
      messages: summarizeMessages,
      systemPrompt: SUMMARIZE_SYSTEM_PROMPT,
      provider,
      model,
      apiKey,
      baseURL: baseURL || undefined,
    });
    content = stripThinkTags(content);

    let parsed = null;
    try {
      const cleaned = content
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // fallback to raw content
    }

    res.json({ content, element: parsed });
  } catch (error: any) {
    console.error('AI Summarize 错误:', error);
    res.status(500).json({ error: error?.message || 'AI 总结失败' });
  }
});

// POST /api/ai/agent — agent that proposes structured canvas actions
router.post('/agent', async (req: Request, res: Response) => {
  try {
    const {
      messages,
      canvasContext,
      provider = 'anthropic',
      model = '',
      apiKey,
      baseURL,
    } = req.body;

    if (!apiKey) {
      res.status(400).json({ error: '缺少 API 密钥' });
      return;
    }
    if (!messages || messages.length === 0) {
      res.status(400).json({ error: '缺少对话消息' });
      return;
    }

    const contextMessage = {
      role: 'user' as const,
      content: `【画布快照（供你引用元素标题）】\n${canvasContext || '（画布为空）'}`,
    };

    let content = await chatWithAI({
      messages: [contextMessage, ...messages],
      systemPrompt: AGENT_SYSTEM_PROMPT,
      provider,
      model,
      apiKey,
      baseURL: baseURL || undefined,
    });
    content = stripThinkTags(content);

    let parsed: { reply?: string; actions?: unknown[] } | null = null;
    try {
      const cleaned = content
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // fallback: treat raw content as reply with no actions
    }

    res.json({
      reply: parsed?.reply || content,
      actions: Array.isArray(parsed?.actions) ? parsed!.actions : [],
    });
  } catch (error: any) {
    console.error('AI Agent 错误:', error);
    res.status(500).json({ error: error?.message || 'AI Agent 调用失败' });
  }
});

// POST /api/ai/recommend — AI-recommended related questions/elements
router.post('/recommend', async (req: Request, res: Response) => {
  try {
    const {
      cardTitle,
      cardContent,
      canvasContext,
      provider = 'anthropic',
      model = '',
      apiKey,
      baseURL,
    } = req.body;

    if (!apiKey) {
      res.status(400).json({ error: '缺少 API 密钥' });
      return;
    }

    const recommendPrompt = `你是一个创意拓展助手。基于以下已完善的想法，推荐 3-5 个相关的新问题或探索方向。

已完善想法标题：${cardTitle}
已完善想法内容：${cardContent}
画布上下文（附近相关想法）：${canvasContext || '无'}

请推荐新的相关问题/方向。每个推荐包含：
- type: "question"（新的引导问题）或 "connection"（应连接到已有想法）
- title: 简短标题
- question: 具体问题或探索方向描述
- tags: 相关标签

输出格式（严格 JSON）：
{
  "recommendations": [
    {
      "type": "question",
      "title": "简短标题",
      "question": "具体问题或探索方向",
      "tags": ["标签1"]
    }
  ]
}`;

    const content = await chatWithAI({
      messages: [{ role: 'user', content: `请基于以下想法推荐相关方向：\n标题：${cardTitle}\n内容：${cardContent}` }],
      systemPrompt: recommendPrompt,
      provider,
      model,
      apiKey,
      baseURL: baseURL || undefined,
    });

    let parsed = null;
    try {
      const cleaned = content
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // fallback
    }

    res.json({ content, recommendations: parsed?.recommendations || [] });
  } catch (error: any) {
    console.error('AI Recommend 错误:', error);
    res.status(500).json({ error: error?.message || 'AI 推荐失败' });
  }
});

export default router;
