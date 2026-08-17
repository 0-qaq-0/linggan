import type { AgentAction, CardNodeData } from '../types';
import { useCanvasStore } from '../store/useCanvasStore';
import { useSessionStore } from '../store/useSessionStore';

/** Resolve a card id from a (possibly fuzzy) title using the current canvas nodes. */
function findCardIdByTitle(title?: string): string | null {
  if (!title) return null;
  const nodes = useCanvasStore.getState().nodes;
  const exact = nodes.find((n) => (n.data as CardNodeData).title === title);
  if (exact) return exact.id;
  const partial = nodes.find((n) => {
    const t = (n.data as CardNodeData).title || '';
    return t.includes(title) || title.includes(t);
  });
  return partial ? partial.id : null;
}

/**
 * Single source of truth for executing a canvas/session action.
 * Used by the AI agent (after user confirmation) and reusable by manual UI.
 * Returns a short human-readable result for feedback.
 */
export async function dispatchAction(action: AgentAction): Promise<string> {
  const canvas = useCanvasStore.getState();
  const session = useSessionStore.getState();

  switch (action.type) {
    case 'createElement': {
      const parentId = findCardIdByTitle(action.parentTitle);
      const cardId = await canvas.addChildElement(parentId, {
        title: action.title,
        content: action.content || action.summary || action.title,
        summary: action.summary || (action.content || '').slice(0, 60),
        tags: action.tags || [],
        color: action.color,
      });
      return cardId
        ? `已创建元素「${action.title}」${parentId ? '并连接到父节点' : ''}`
        : `创建元素「${action.title}」失败`;
    }

    case 'connect': {
      const sourceId = findCardIdByTitle(action.sourceTitle);
      const targetId = findCardIdByTitle(action.targetTitle);
      if (!sourceId || !targetId) return `连接失败：找不到「${action.sourceTitle}」或「${action.targetTitle}」`;
      canvas.connectCards(sourceId, targetId);
      return `已连接「${action.sourceTitle}」→「${action.targetTitle}」`;
    }

    case 'recolor': {
      const cardId = findCardIdByTitle(action.cardTitle);
      if (!cardId) return `改色失败：找不到「${action.cardTitle}」`;
      await canvas.updateCard(cardId, { color: action.color });
      return `已将「${action.cardTitle}」改为 ${action.color}`;
    }

    case 'rename': {
      const cardId = findCardIdByTitle(action.cardTitle);
      if (!cardId) return `重命名失败：找不到「${action.cardTitle}」`;
      await canvas.updateCard(cardId, { title: action.title });
      return `已将「${action.cardTitle}」重命名为「${action.title}」`;
    }

    case 'delete': {
      const cardId = findCardIdByTitle(action.cardTitle);
      if (!cardId) return `删除失败：找不到「${action.cardTitle}」`;
      await canvas.removeCard(cardId);
      return `已删除「${action.cardTitle}」`;
    }

    case 'summarize': {
      const parentId = findCardIdByTitle(action.parentTitle);
      const cardId = await session.summarizeToElement({
        focus: action.focus,
        ...(action.parentTitle ? { parentId: parentId ?? undefined } : {}),
      });
      return cardId ? '已把当前对话总结为元素' : '总结失败（可能没有可总结的对话）';
    }

    case 'startQuestioning': {
      if (action.fromTitle) {
        const cardId = findCardIdByTitle(action.fromTitle);
        if (!cardId) return `开启提问失败：找不到「${action.fromTitle}」`;
        await session.startFromCard(cardId);
        return `已从「${action.fromTitle}」开启提问分支`;
      }
      if (action.idea) {
        await session.submitIdea(action.idea);
        return `已就「${action.idea}」开启引导式提问`;
      }
      return '开启提问失败：缺少 idea 或 fromTitle';
    }

    case 'setAnchor': {
      const cardId = findCardIdByTitle(action.cardTitle);
      if (!cardId) return `设置锚点失败：找不到「${action.cardTitle}」`;
      session.setAnchor(cardId);
      return `已将总结挂载点设为「${action.cardTitle}」`;
    }

    default:
      return '未知动作';
  }
}

/** Short human-readable label for a pending action (for the confirmation card). */
export function describeAction(action: AgentAction): string {
  switch (action.type) {
    case 'createElement':
      return `创建元素「${action.title}」${action.parentTitle ? ` → 连接「${action.parentTitle}」` : ''}`;
    case 'connect':
      return `连接「${action.sourceTitle}」→「${action.targetTitle}」`;
    case 'recolor':
      return `「${action.cardTitle}」改色为 ${action.color}`;
    case 'rename':
      return `「${action.cardTitle}」重命名为「${action.title}」`;
    case 'delete':
      return `删除「${action.cardTitle}」`;
    case 'summarize':
      return `总结当前对话为元素${action.focus ? `（聚焦：${action.focus}）` : ''}`;
    case 'startQuestioning':
      return action.fromTitle ? `从「${action.fromTitle}」开启提问` : `就「${action.idea}」开启提问`;
    case 'setAnchor':
      return `设置挂载点为「${action.cardTitle}」`;
    default:
      return '未知动作';
  }
}
