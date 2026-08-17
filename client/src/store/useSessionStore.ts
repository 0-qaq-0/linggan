import { create } from 'zustand';
import type { ChatMessage, ChatPhase, AIQuestion, IdeationStep, StepElement } from '../types';
import { nanoid } from 'nanoid';
import { streamChatMessage, summarizeToElement as summarizeToElementApi } from '../services/aiService';
import { useCanvasStore } from './useCanvasStore';
import { getDb } from '../db/dexie';

interface SessionSnapshot {
  phase: ChatPhase;
  currentRefinement: string;
  chatHistory: ChatMessage[];
  currentQuestions: AIQuestion[];
  userAnswers: Record<string, string>;
}

interface SessionState {
  phase: ChatPhase;
  originalIdea: string;
  currentRefinement: string;
  chatHistory: ChatMessage[];
  currentQuestions: AIQuestion[];
  userAnswers: Record<string, string>;
  isThinking: boolean;
  error: string | null;
  historyStack: SessionSnapshot[];

  // ── Step-based traceability ──
  steps: IdeationStep[];
  currentStepIndex: number;

  // ── Tree growth: anchoring conversation to canvas elements ──
  anchorCardId: string | null; // next crystallized element attaches here (chain mode advances it)
  rootCardId: string | null;   // the theme/root element for this conversation
  stepElements: StepElement[]; // step ↔ crystallized element mapping (for rollback graph)
  isSummarizing: boolean;

  provider: 'anthropic' | 'openai';
  model: string;
  apiKey: string;
  baseURL: string;

  setSettings: (provider: 'anthropic' | 'openai', model: string, apiKey: string, baseURL?: string) => void;

  submitIdea: (idea: string) => Promise<void>;
  submitAnswer: (questionId: string, answer: string) => Promise<void>;
  submitCustomAnswer: (answer: string) => Promise<void>;
  continueChat: (message: string) => Promise<void>;
  summarizeToElement: (opts?: { parentId?: string; focus?: string }) => Promise<string | null>;
  crystallizeElement: (payload: { title: string; content: string; summary: string; tags?: string[]; parentId?: string }) => Promise<string | null>;
  startFromCard: (cardId: string) => Promise<void>;
  setAnchor: (cardId: string | null) => void;
  rollback: () => void;
  rollbackToStep: (stepIndex: number) => Promise<void>;
  resetSession: () => void;
  clearError: () => void;
  loadHistory: (messages: ChatMessage[], phase: ChatPhase, refinement: string) => void;
}

const takeSnapshot = (s: SessionState): SessionSnapshot => ({
  phase: s.phase,
  currentRefinement: s.currentRefinement,
  chatHistory: [...s.chatHistory],
  currentQuestions: [...s.currentQuestions],
  userAnswers: { ...s.userAnswers },
});

/** Build an IdeationStep from a completed Q&A round */
function buildStep(
  question: string,
  options: string[],
  userAnswer: string,
  analysis: string | undefined,
  phase: ChatPhase,
  messageCount: number,
): IdeationStep {
  return {
    id: nanoid(),
    stepNumber: 0, // will be set by caller based on current steps length
    question,
    options,
    userAnswer,
    analysis,
    phase,
    messageCount,
    timestamp: Date.now(),
  };
}

/** Shared side-effects after crystallizing a conversation into a canvas element. */
function applyCrystallizeResult(
  state: SessionState,
  cardId: string,
  usedAnchor: boolean,
): Pick<SessionState, 'stepElements' | 'anchorCardId' | 'rootCardId'> {
  const currentStep = state.steps[state.currentStepIndex];
  const stepElements = currentStep
    ? [...state.stepElements, { stepId: currentStep.id, cardId }]
    : state.stepElements;
  return {
    stepElements,
    anchorCardId: usedAnchor ? cardId : state.anchorCardId,
    rootCardId: state.rootCardId || cardId,
  };
}

export const useSessionStore = create<SessionState>((set, get) => ({
  phase: 'idle',
  originalIdea: '',
  currentRefinement: '',
  chatHistory: [],
  currentQuestions: [],
  userAnswers: {},
  isThinking: false,
  error: null,
  historyStack: [],
  steps: [],
  currentStepIndex: -1,
  anchorCardId: null,
  rootCardId: null,
  stepElements: [],
  isSummarizing: false,
  provider: 'anthropic',
  model: '',
  apiKey: '',
  baseURL: '',

  setSettings: (provider, model, apiKey, baseURL = '') =>
    set({ provider, model, apiKey, baseURL }),

  clearError: () => set({ error: null }),

  submitIdea: async (idea: string) => {
    const { provider, model, apiKey, baseURL } = get();
    if (!apiKey) {
      set({ error: '请先在设置中配置 API 密钥' });
      return;
    }

    const userMsg: ChatMessage = {
      id: nanoid(),
      role: 'user',
      content: idea,
      type: 'text',
      timestamp: Date.now(),
    };

    const assistantMsgId = nanoid();
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      type: 'text',
      timestamp: Date.now(),
    };

    // Crystallize the initial idea as a root "theme" element so the tree has a root.
    let rootCardId: string | null = null;
    try {
      rootCardId = await useCanvasStore.getState().addChildElement(
        null,
        {
          title: idea.slice(0, 16) || '新主题',
          content: idea,
          summary: idea.slice(0, 60),
          tags: [],
        },
        'theme',
      );
    } catch {
      rootCardId = null;
    }

    set((s) => ({
      historyStack: [...s.historyStack, takeSnapshot(s)],
      originalIdea: idea,
      chatHistory: [userMsg, assistantMsg],
      isThinking: true,
      error: null,
      phase: 'analyze',
      steps: [],
      currentStepIndex: -1,
      rootCardId,
      anchorCardId: rootCardId,
      stepElements: [],
    }));

    let fullContent = '';
    try {
      const stream = streamChatMessage({
        messages: [{ role: 'user', content: idea }],
        provider,
        model,
        apiKey,
        baseURL: baseURL || undefined,
      });

      for await (const event of stream) {
        if (event.chunk) {
          fullContent += event.chunk;
          set((s) => ({
            chatHistory: s.chatHistory.map((m) =>
              m.id === assistantMsgId ? { ...m, content: fullContent } : m,
            ),
          }));
        }
        if (event.thinking) {
          console.log('[TT] thinking:', event.thinking.slice(0, 80));
          set((s) => ({
            chatHistory: s.chatHistory.map((m) =>
              m.id === assistantMsgId ? { ...m, thinking: (m.thinking || '') + event.thinking } : m,
            ),
          }));
        }
        if (event.error) {
          throw new Error(event.error);
        }
        if (event.done) {
          const parsed = event.parsed;
          set((s) => ({
            chatHistory: s.chatHistory.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: fullContent,
                    type: parsed?.questions ? 'question' : 'text',
                    metadata: {
                      phase: (parsed?.phase as ChatPhase) || 'analyze',
                      analysis: parsed?.analysis,
                      questions: parsed?.questions,
                      suggestedTags: parsed?.suggestedTags,
                      suggestElement: parsed?.suggestElement,
                    },
                  }
                : m,
            ),
            currentQuestions: parsed?.questions || [],
            phase: parsed?.phase === 'final' ? 'final' : 'questions',
            isThinking: false,
          }));
          return;
        }
      }
    } catch (e: any) {
      set((s) => ({
        chatHistory: s.chatHistory.filter((m) => m.id !== assistantMsgId),
        error: e.message,
        phase: 'idle',
        isThinking: false,
      }));
    }
  },

  submitAnswer: async (questionId: string, answer: string) => {
    const { provider, model, apiKey, baseURL, chatHistory, currentQuestions } = get();

    // Capture the question being answered BEFORE the stream mutates state
    const answeredQ = currentQuestions.find((x) => x.id === questionId);

    const newAnswers = { ...get().userAnswers, [questionId]: answer };
    const userMsg: ChatMessage = {
      id: nanoid(),
      role: 'user',
      content: answer,
      type: 'text',
      timestamp: Date.now(),
    };

    const assistantMsgId = nanoid();
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      type: 'text',
      timestamp: Date.now(),
    };

    set((s) => ({
      historyStack: [...s.historyStack, takeSnapshot(s)],
      userAnswers: newAnswers,
      chatHistory: [...chatHistory, userMsg, assistantMsg],
      isThinking: true,
      error: null,
    }));

    try {
      const qaSummary = Object.entries(newAnswers)
        .map(([qid, ans]) => {
          const q = currentQuestions.find((x) => x.id === qid);
          return q ? `Q: ${q.question}\nA: ${ans}` : `A: ${ans}`;
        })
        .join('\n\n');

      const prompt = `用户对之前问题的回答：\n${qaSummary}\n\n请根据这些回答，提出下一个最关键的问题。如果信息已经足够充分（通常5-8轮问答后），请产出精炼版本。`;

      const stream = streamChatMessage({
        messages: [
          ...get().chatHistory.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user', content: prompt },
        ],
        provider,
        model,
        apiKey,
        baseURL: baseURL || undefined,
      });

      let fullContent = '';
      for await (const event of stream) {
        if (event.chunk) {
          fullContent += event.chunk;
          set((s) => ({
            chatHistory: s.chatHistory.map((m) =>
              m.id === assistantMsgId ? { ...m, content: fullContent } : m,
            ),
          }));
        }
        if (event.thinking) {
          console.log('[TT] thinking:', event.thinking.slice(0, 80));
          set((s) => ({
            chatHistory: s.chatHistory.map((m) =>
              m.id === assistantMsgId ? { ...m, thinking: (m.thinking || '') + event.thinking } : m,
            ),
          }));
        }
        if (event.error) throw new Error(event.error);
        if (event.done) {
          const parsed = event.parsed;
          set((s) => {
            // Build a step for this completed Q&A round
            const step = buildStep(
              answeredQ?.question || '自定义回答',
              answeredQ?.options || [],
              answer,
              parsed?.analysis,
              (parsed?.phase as ChatPhase) || 'questions',
              s.chatHistory.length, // messageCount = current length (includes user+assistant msgs)
            );
            step.stepNumber = s.steps.length + 1;

            return {
              chatHistory: s.chatHistory.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: fullContent,
                      type: parsed?.phase === 'final' ? 'refinement' : 'question',
                      metadata: {
                        phase: (parsed?.phase as ChatPhase) || 'questions',
                        analysis: parsed?.analysis,
                        questions: parsed?.questions,
                        refinedContent: parsed?.refinedIdea,
                        refinementNote: parsed?.refinementNote,
                        suggestedTags: parsed?.suggestedTags,
                        suggestElement: parsed?.suggestElement,
                      },
                    }
                  : m,
              ),
              currentQuestions: parsed?.questions || [],
              currentRefinement: parsed?.refinedIdea || s.currentRefinement,
              phase: parsed?.phase === 'final' ? 'final' : 'questions',
              steps: [...s.steps, step],
              currentStepIndex: s.steps.length, // 0-based, so steps.length = new index
              isThinking: false,
            };
          });
          return;
        }
      }
    } catch (e: any) {
      set((s) => ({
        chatHistory: s.chatHistory.filter((m) => m.id !== assistantMsgId),
        error: e.message,
        isThinking: false,
      }));
    }
  },

  submitCustomAnswer: async (answer: string) => {
    const { chatHistory, provider, model, apiKey, baseURL, currentQuestions } = get();

    // Capture question context before stream mutates state
    const contextQuestion = currentQuestions[0]?.question || '继续探讨';

    const userMsg: ChatMessage = {
      id: nanoid(),
      role: 'user',
      content: answer,
      type: 'text',
      timestamp: Date.now(),
    };

    const assistantMsgId = nanoid();
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      type: 'text',
      timestamp: Date.now(),
    };

    set((s) => ({
      historyStack: [...s.historyStack, takeSnapshot(s)],
      chatHistory: [...chatHistory, userMsg, assistantMsg],
      isThinking: true,
      error: null,
    }));

    try {
      const stream = streamChatMessage({
        messages: get().chatHistory.map((m) => ({ role: m.role, content: m.content })),
        provider,
        model,
        apiKey,
        baseURL: baseURL || undefined,
      });

      let fullContent = '';
      for await (const event of stream) {
        if (event.chunk) {
          fullContent += event.chunk;
          set((s) => ({
            chatHistory: s.chatHistory.map((m) =>
              m.id === assistantMsgId ? { ...m, content: fullContent } : m,
            ),
          }));
        }
        if (event.thinking) {
          console.log('[TT] thinking:', event.thinking.slice(0, 80));
          set((s) => ({
            chatHistory: s.chatHistory.map((m) =>
              m.id === assistantMsgId ? { ...m, thinking: (m.thinking || '') + event.thinking } : m,
            ),
          }));
        }
        if (event.error) throw new Error(event.error);
        if (event.done) {
          const parsed = event.parsed;
          set((s) => {
            const step = buildStep(
              contextQuestion,
              currentQuestions[0]?.options || [],
              answer,
              parsed?.analysis,
              (parsed?.phase as ChatPhase) || 'questions',
              s.chatHistory.length,
            );
            step.stepNumber = s.steps.length + 1;

            return {
              chatHistory: s.chatHistory.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: fullContent,
                      type: parsed?.phase === 'final'
                        ? 'refinement'
                        : parsed?.questions
                          ? 'question'
                          : 'text',
                      metadata: {
                        phase: (parsed?.phase as ChatPhase) || 'questions',
                        analysis: parsed?.analysis,
                        questions: parsed?.questions,
                        refinedContent: parsed?.refinedIdea,
                        refinementNote: parsed?.refinementNote,
                        suggestedTags: parsed?.suggestedTags,
                        suggestElement: parsed?.suggestElement,
                      },
                    }
                  : m,
              ),
              currentQuestions: parsed?.questions || [],
              currentRefinement: parsed?.refinedIdea || s.currentRefinement,
              phase: parsed?.phase === 'final' ? 'final' : 'questions',
              steps: [...s.steps, step],
              currentStepIndex: s.steps.length,
              isThinking: false,
            };
          });
          return;
        }
      }
    } catch (e: any) {
      set((s) => ({
        chatHistory: s.chatHistory.filter((m) => m.id !== assistantMsgId),
        error: e.message,
        isThinking: false,
      }));
    }
  },

  continueChat: async (message: string) => {
    const { chatHistory, provider, model, apiKey, baseURL } = get();
    const userMsg: ChatMessage = {
      id: nanoid(),
      role: 'user',
      content: message,
      type: 'text',
      timestamp: Date.now(),
    };

    const assistantMsgId = nanoid();
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      type: 'text',
      timestamp: Date.now(),
    };

    set((s) => ({
      historyStack: [...s.historyStack, takeSnapshot(s)],
      chatHistory: [...chatHistory, userMsg, assistantMsg],
      isThinking: true,
      error: null,
    }));

    try {
      const stream = streamChatMessage({
        messages: get().chatHistory.map((m) => ({ role: m.role, content: m.content })),
        provider,
        model,
        apiKey,
        baseURL: baseURL || undefined,
      });

      let fullContent = '';
      for await (const event of stream) {
        if (event.chunk) {
          fullContent += event.chunk;
          set((s) => ({
            chatHistory: s.chatHistory.map((m) =>
              m.id === assistantMsgId ? { ...m, content: fullContent } : m,
            ),
          }));
        }
        if (event.thinking) {
          console.log('[TT] thinking:', event.thinking.slice(0, 80));
          set((s) => ({
            chatHistory: s.chatHistory.map((m) =>
              m.id === assistantMsgId ? { ...m, thinking: (m.thinking || '') + event.thinking } : m,
            ),
          }));
        }
        if (event.error) throw new Error(event.error);
        if (event.done) {
          const parsed = event.parsed;
          set((s) => ({
            chatHistory: s.chatHistory.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: fullContent,
                    type: parsed?.phase === 'final'
                      ? 'refinement'
                      : parsed?.questions
                        ? 'question'
                        : 'text',
                    metadata: {
                      phase: (parsed?.phase as ChatPhase) || 'questions',
                      analysis: parsed?.analysis,
                      questions: parsed?.questions,
                      refinedContent: parsed?.refinedIdea,
                      refinementNote: parsed?.refinementNote,
                      suggestedTags: parsed?.suggestedTags,
                      suggestElement: parsed?.suggestElement,
                    },
                  }
                : m,
            ),
            currentQuestions: parsed?.questions || [],
            currentRefinement: parsed?.refinedIdea || s.currentRefinement,
            phase: parsed?.phase === 'final' ? 'final' : 'questions',
            isThinking: false,
          }));
          return;
        }
      }
    } catch (e: any) {
      set((s) => ({
        chatHistory: s.chatHistory.filter((m) => m.id !== assistantMsgId),
        error: e.message,
        isThinking: false,
      }));
    }
  },

  // ── Crystallize current conversation into a canvas element ──
  summarizeToElement: async (opts) => {
    const { provider, model, apiKey, baseURL, chatHistory, anchorCardId } = get();
    if (!apiKey) {
      set({ error: '请先在设置中配置 API 密钥' });
      return null;
    }
    if (chatHistory.length === 0) {
      set({ error: '当前没有可总结的对话内容' });
      return null;
    }

    set({ isSummarizing: true, error: null });
    try {
      const el = await summarizeToElementApi({
        messages: chatHistory.map((m) => ({ role: m.role, content: m.content })),
        focus: opts?.focus,
        provider,
        model,
        apiKey,
        baseURL: baseURL || undefined,
      });

      const usedAnchor = opts?.parentId === undefined;
      const parentId = usedAnchor ? anchorCardId : (opts?.parentId ?? null);

      const cardId = await useCanvasStore.getState().addChildElement(parentId, {
        title: el.title,
        content: el.content,
        summary: el.summary,
        tags: el.tags,
        chatHistory: [...chatHistory],
      });

      set((s) => ({
        ...applyCrystallizeResult(s, cardId, usedAnchor),
        isSummarizing: false,
      }));

      return cardId;
    } catch (e: any) {
      set({ error: e.message, isSummarizing: false });
      return null;
    }
  },

  // ── Crystallize with explicit content (e.g. final refinement, no API call) ──
  crystallizeElement: async (payload) => {
    const { anchorCardId, chatHistory } = get();
    const usedAnchor = payload.parentId === undefined;
    const parentId = usedAnchor ? anchorCardId : (payload.parentId ?? null);

    const cardId = await useCanvasStore.getState().addChildElement(parentId, {
      title: payload.title,
      content: payload.content,
      summary: payload.summary,
      tags: payload.tags || [],
      chatHistory: [...chatHistory],
    });

    set((s) => applyCrystallizeResult(s, cardId, usedAnchor));
    return cardId;
  },

  // ── Branch a new questioning session off an existing canvas element ──
  startFromCard: async (cardId) => {
    const { provider, model, apiKey, baseURL } = get();
    if (!apiKey) {
      set({ error: '请先在设置中配置 API 密钥' });
      return;
    }

    const card = await getDb().cards.get(cardId);
    if (!card) {
      set({ error: '找不到该卡片' });
      return;
    }
    const version = await getDb().versions.get(card.currentVersionId);
    const title = version?.title || '已有想法';
    const content = version?.content || version?.summary || title;

    const seedPrompt = `我想从这个已有的想法继续深入，并拓展出新的分支方向：\n标题：${title}\n内容：${content}\n\n请基于它提出下一个最关键的引导性问题。`;

    const userMsg: ChatMessage = {
      id: nanoid(),
      role: 'user',
      content: `从「${title}」继续拓展`,
      type: 'text',
      timestamp: Date.now(),
    };
    const assistantMsgId = nanoid();
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      type: 'text',
      timestamp: Date.now(),
    };

    set((s) => ({
      historyStack: [...s.historyStack, takeSnapshot(s)],
      originalIdea: title,
      chatHistory: [userMsg, assistantMsg],
      currentQuestions: [],
      userAnswers: {},
      phase: 'analyze',
      isThinking: true,
      error: null,
      steps: [],
      currentStepIndex: -1,
      stepElements: [],
      rootCardId: cardId,
      anchorCardId: cardId,
    }));

    let fullContent = '';
    try {
      const stream = streamChatMessage({
        messages: [{ role: 'user', content: seedPrompt }],
        provider,
        model,
        apiKey,
        baseURL: baseURL || undefined,
      });

      for await (const event of stream) {
        if (event.chunk) {
          fullContent += event.chunk;
          set((s) => ({
            chatHistory: s.chatHistory.map((m) =>
              m.id === assistantMsgId ? { ...m, content: fullContent } : m,
            ),
          }));
        }
        if (event.thinking) {
          set((s) => ({
            chatHistory: s.chatHistory.map((m) =>
              m.id === assistantMsgId ? { ...m, thinking: (m.thinking || '') + event.thinking } : m,
            ),
          }));
        }
        if (event.error) throw new Error(event.error);
        if (event.done) {
          const parsed = event.parsed;
          set((s) => ({
            chatHistory: s.chatHistory.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: fullContent,
                    type: parsed?.questions ? 'question' : 'text',
                    metadata: {
                      phase: (parsed?.phase as ChatPhase) || 'questions',
                      analysis: parsed?.analysis,
                      questions: parsed?.questions,
                      suggestedTags: parsed?.suggestedTags,
                      suggestElement: parsed?.suggestElement,
                    },
                  }
                : m,
            ),
            currentQuestions: parsed?.questions || [],
            phase: parsed?.phase === 'final' ? 'final' : 'questions',
            isThinking: false,
          }));
          return;
        }
      }
    } catch (e: any) {
      set((s) => ({
        chatHistory: s.chatHistory.filter((m) => m.id !== assistantMsgId),
        error: e.message,
        phase: 'idle',
        isThinking: false,
      }));
    }
  },

  setAnchor: (cardId) => set({ anchorCardId: cardId }),

  // ── Linear rollback (single-step undo, kept for backward compat) ──
  rollback: () => {
    const { historyStack, steps, currentStepIndex } = get();
    if (historyStack.length === 0) return;
    const prev = historyStack[historyStack.length - 1];
    set({
      historyStack: historyStack.slice(0, -1),
      phase: prev.phase,
      currentRefinement: prev.currentRefinement,
      chatHistory: prev.chatHistory,
      currentQuestions: prev.currentQuestions,
      userAnswers: prev.userAnswers,
      isThinking: false,
      error: null,
      // Also roll back steps if needed
      steps: currentStepIndex > 0 ? steps.slice(0, currentStepIndex) : [],
      currentStepIndex: currentStepIndex > 0 ? currentStepIndex - 1 : -1,
    });
  },

  // ── Step-based rollback (jump to any completed step, sync canvas) ──
  rollbackToStep: async (stepIndex: number) => {
    const { steps, stepElements, rootCardId } = get();
    if (stepIndex < 0 || stepIndex >= steps.length) return;

    const target = steps[stepIndex];
    const truncatedSteps = steps.slice(0, stepIndex + 1);
    const keptStepIds = new Set(truncatedSteps.map((s) => s.id));

    // Remove canvas elements crystallized after the target step (never delete theme root)
    const toRemove = stepElements.filter((se) => !keptStepIds.has(se.stepId));
    const removeCard = useCanvasStore.getState().removeCard;
    for (const se of toRemove) {
      if (se.cardId !== rootCardId) {
        await removeCard(se.cardId);
      }
    }

    const keptStepElements = stepElements.filter((se) => keptStepIds.has(se.stepId));

    // Recalculate chain anchor: last crystallized element up to stepIndex, else root
    let newAnchor = rootCardId;
    for (let i = 0; i <= stepIndex; i++) {
      const el = keptStepElements.find((se) => se.stepId === truncatedSteps[i].id);
      if (el) newAnchor = el.cardId;
    }

    set((s) => {
      const truncatedHistory = s.chatHistory.slice(0, target.messageCount);
      const lastAssistantMsg = [...truncatedHistory].reverse().find((m) => m.role === 'assistant');
      const restoredQuestions = lastAssistantMsg?.metadata?.questions || [];

      return {
        steps: truncatedSteps,
        currentStepIndex: stepIndex,
        chatHistory: truncatedHistory,
        currentQuestions: restoredQuestions,
        stepElements: keptStepElements,
        anchorCardId: newAnchor,
        phase: target.phase === 'final' ? 'questions' : target.phase,
        currentRefinement: '',
        isThinking: false,
        error: null,
      };
    });
  },

  resetSession: () =>
    set({
      phase: 'idle',
      originalIdea: '',
      currentRefinement: '',
      chatHistory: [],
      currentQuestions: [],
      userAnswers: {},
      isThinking: false,
      error: null,
      historyStack: [],
      steps: [],
      currentStepIndex: -1,
      anchorCardId: null,
      rootCardId: null,
      stepElements: [],
      isSummarizing: false,
    }),

  loadHistory: (messages, phase, refinement) =>
    set({
      chatHistory: messages,
      phase,
      currentRefinement: refinement,
      currentQuestions: [],
      userAnswers: {},
      isThinking: false,
      error: null,
      steps: [],
      currentStepIndex: -1,
      anchorCardId: null,
      rootCardId: null,
      stepElements: [],
      isSummarizing: false,
    }),
}));
