import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges, MarkerType, type Node, type Edge, type OnNodesChange, type OnEdgesChange, type Connection } from '@xyflow/react';
import type { IdeaCard, CardVersion, CardNodeData, ChatMessage, CardKind } from '../types';
import { getDb } from '../db/dexie';
import { useSyncStore } from './useSyncStore';
import { nanoid } from 'nanoid';

const markWorkspaceDirty = () => useSyncStore.getState().markDirty();

const DEFAULT_EDGE_COLOR = '#a78bfa';
const MAX_UNDO_STACK = 50;

/** Build a directional tree edge with consistent styling (stable id, arrow, parent color). */
function buildEdge(sourceNodeId: string, targetNodeId: string, color = DEFAULT_EDGE_COLOR): Edge {
  return {
    id: `e-${sourceNodeId}-${targetNodeId}`,
    source: sourceNodeId,
    target: targetNodeId,
    type: 'default',
    animated: true,
    interactionWidth: 20,
    style: { stroke: color, strokeWidth: 2, cursor: 'pointer' },
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
  };
}

type CanvasUndoEntry =
  | { type: 'connect'; sourceCardId: string; targetCardId: string }
  | { type: 'disconnect'; sourceCardId: string; targetCardId: string }
  | { type: 'addCard'; cardId: string }
  | {
      type: 'removeCard';
      card: IdeaCard;
      versions: CardVersion[];
      peerConnectionPatches: Array<{ cardId: string; connections: string[] }>;
    };

interface CanvasState {
  nodes: Node<CardNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;
  subCanvasStack: string[];
  currentParentId: string | null;
  fitViewCounter: number;
  undoStack: CanvasUndoEntry[];

  // Actions
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;

  addCard: (title: string, content: string, summary: string, chatHistory: ChatMessage[], tags: string[], color?: string, position?: { x: number; y: number }, kind?: CardKind) => Promise<string>;
  addChildElement: (parentCardId: string | null, payload: { title: string; content: string; summary: string; tags: string[]; color?: string; chatHistory?: ChatMessage[] }, kind?: CardKind) => Promise<string>;
  removeCard: (cardId: string) => Promise<void>;
  selectCard: (cardId: string | null) => void;
  updateCard: (cardId: string, updates: { title?: string; content?: string; summary?: string; tags?: string[]; color?: string }) => Promise<void>;
  connectCards: (sourceCardId: string, targetCardId: string) => void;
  disconnectCards: (sourceCardId: string, targetCardId: string) => void;
  canvasUndo: () => Promise<void>;

  addVersion: (cardId: string, title: string, content: string, summary: string, chatHistory: ChatMessage[], parentVersionId?: string) => Promise<string>;
  switchVersion: (cardId: string, versionId: string) => void;
  enterSubCanvas: (cardId: string) => void;
  exitSubCanvas: () => void;
  requestFitView: () => void;

  loadFromDB: () => Promise<void>;
  exportCanvas: () => Promise<string>;
  importCanvas: (json: string) => Promise<void>;
  resetCanvas: () => void;
}

const positionWriteTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useCanvasStore = create<CanvasState>((set, get) => {
  const pushUndo = (entry: CanvasUndoEntry) => {
    set((s) => ({
      undoStack: [...s.undoStack, entry].slice(-MAX_UNDO_STACK),
    }));
  };

  const popUndo = (): CanvasUndoEntry | undefined => {
    const { undoStack } = get();
    if (undoStack.length === 0) return undefined;
    const entry = undoStack[undoStack.length - 1];
    set({ undoStack: undoStack.slice(0, -1) });
    return entry;
  };

  /** Remove connection without recording undo (used by undo/redo internals). */
  const disconnectCardsInternal = (sourceCardId: string, targetCardId: string) => {
    if (sourceCardId === targetCardId) return;
    const { edges } = get();
    const edgeId = `e-${sourceCardId}-${targetCardId}`;
    const altId = `e-${targetCardId}-${sourceCardId}`;
    const exists = edges.some((e) => e.id === edgeId || e.id === altId);
    if (!exists) return;

    set((s) => ({
      edges: s.edges.filter((e) => e.id !== edgeId && e.id !== altId),
    }));

    getDb().cards.get(sourceCardId).then((card) => {
      if (card) {
        getDb().cards.update(sourceCardId, {
          connections: card.connections.filter((c) => c !== targetCardId),
          updatedAt: Date.now(),
        });
      }
    });
  };

  /** Add connection without recording undo (used by undo internals). */
  const connectCardsInternal = (sourceCardId: string, targetCardId: string) => {
    if (sourceCardId === targetCardId) return;
    const { nodes, edges } = get();
    const exists = edges.some(
      (e) =>
        (e.source === sourceCardId && e.target === targetCardId) ||
        (e.source === targetCardId && e.target === sourceCardId),
    );
    if (exists) return;

    const sourceNode = nodes.find((n) => n.id === sourceCardId);
    if (!sourceNode) return;
    const color = (sourceNode.data as CardNodeData).color || DEFAULT_EDGE_COLOR;
    const newEdge = buildEdge(sourceCardId, targetCardId, color);

    set((s) => ({ edges: [...s.edges, newEdge] }));

    getDb().cards.get(sourceCardId).then((card) => {
      if (card && !card.connections.includes(targetCardId)) {
        getDb().cards.update(sourceCardId, {
          connections: [...card.connections, targetCardId],
          updatedAt: Date.now(),
        });
      }
    });
  };

  const removeCardInternal = async (cardId: string) => {
    await getDb().cards.delete(cardId);
    await getDb().versions.where('cardId').equals(cardId).delete();

    const allCards = await getDb().cards.toArray();
    for (const c of allCards) {
      if (c.connections.includes(cardId)) {
        await getDb().cards.update(c.id, {
          connections: c.connections.filter((conn) => conn !== cardId),
          updatedAt: Date.now(),
        });
      }
    }

    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== cardId),
      edges: s.edges.filter((e) => e.source !== cardId && e.target !== cardId),
      selectedNodeId: s.selectedNodeId === cardId ? null : s.selectedNodeId,
    }));
  };

  return {
  nodes: [],
  edges: [],
  selectedNodeId: null,
  subCanvasStack: [],
  currentParentId: null,
  fitViewCounter: 0,
  undoStack: [],

  onNodesChange: (changes) => {
    set((s) => {
      const updated = applyNodeChanges(changes, s.nodes);
      // Persist position changes
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          const node = updated.find((n) => n.id === change.id);
          const cardId = (node?.data as CardNodeData)?.cardId;
          if (cardId) {
            const existing = positionWriteTimers.get(cardId);
            if (existing) clearTimeout(existing);
            positionWriteTimers.set(cardId, setTimeout(() => {
              getDb().cards.update(cardId, {
                position: change.position,
                updatedAt: Date.now(),
              });
              markWorkspaceDirty();
            }, 300));
          }
        }
      }
      return { nodes: updated as Node<CardNodeData>[] };
    });
  },

  onEdgesChange: (changes) => {
    for (const change of changes) {
      if (change.type === 'remove') {
        const removed = get().edges.find((e) => e.id === change.id);
        if (removed) {
          pushUndo({ type: 'disconnect', sourceCardId: removed.source, targetCardId: removed.target });
          getDb().cards.get(removed.source).then((card) => {
            if (card) {
              getDb().cards.update(removed.source, {
                connections: card.connections.filter((c) => c !== removed.target),
                updatedAt: Date.now(),
              });
            }
          });
        }
      }
    }
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) }));
    if (changes.some((c) => c.type === 'remove')) {
      markWorkspaceDirty();
    }
  },

  onConnect: (connection) => {
    const { source, target } = connection;
    if (!source || !target || source === target) return;
    get().connectCards(source, target);
  },

  addCard: async (title, content, summary, chatHistory, tags, color, position, kind) => {
    const cardId = nanoid();
    const versionId = nanoid();
    const cardColor = color || '#00d4ff';

    const card: IdeaCard = {
      id: cardId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      position: position || { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 },
      parentId: get().currentParentId,
      connections: [],
      tags,
      currentVersionId: versionId,
      color: cardColor,
      kind: kind || 'element',
    };

    const version: CardVersion = {
      id: versionId,
      cardId,
      parentVersionId: null,
      title,
      content,
      summary,
      chatHistory,
      createdAt: Date.now(),
    };

    await getDb().cards.put(card);
    await getDb().versions.put(version);

    const node: Node<CardNodeData> = {
      id: cardId,
      type: 'cardNode',
      position: card.position,
      data: {
        cardId,
        title,
        summary,
        versionCount: 1,
        tags,
        parentId: card.parentId,
        color: cardColor,
        kind: card.kind,
      },
    };

    set((s) => ({ nodes: [...s.nodes, node], fitViewCounter: s.fitViewCounter + 1 }));
    pushUndo({ type: 'addCard', cardId });
    markWorkspaceDirty();
    return cardId;
  },

  addChildElement: async (parentCardId, payload, kind) => {
    const { nodes } = get();
    // Position the new element near its parent (offset down-right), fanned out by sibling count
    let position: { x: number; y: number } | undefined;
    if (parentCardId) {
      const parentNode = nodes.find((n) => n.id === parentCardId);
      if (parentNode) {
        const parentCard = await getDb().cards.get(parentCardId);
        const childCount = parentCard?.connections.length || 0;
        position = {
          x: parentNode.position.x + 320,
          y: parentNode.position.y + (childCount - 0.5) * 180,
        };
      }
    }

    // Inherit parent color so the sub-tree stays visually coherent
    let color = payload.color;
    if (!color && parentCardId) {
      const parentNode = nodes.find((n) => n.id === parentCardId);
      color = (parentNode?.data as CardNodeData | undefined)?.color;
    }

    const cardId = await get().addCard(
      payload.title,
      payload.content,
      payload.summary,
      payload.chatHistory || [],
      payload.tags,
      color,
      position,
      kind || 'element',
    );

    if (parentCardId) {
      get().connectCards(parentCardId, cardId);
    }

    return cardId;
  },

  removeCard: async (cardId) => {
    const card = await getDb().cards.get(cardId);
    if (!card) return;

    const versions = await getDb().versions.where('cardId').equals(cardId).toArray();
    const allCards = await getDb().cards.toArray();
    const peerConnectionPatches = allCards
      .filter((c) => c.connections.includes(cardId))
      .map((c) => ({ cardId: c.id, connections: [...c.connections] }));

    pushUndo({ type: 'removeCard', card, versions, peerConnectionPatches });
    await removeCardInternal(cardId);
    markWorkspaceDirty();
  },

  selectCard: (cardId) => set({ selectedNodeId: cardId }),

  updateCard: async (cardId, updates) => {
    const card = await getDb().cards.get(cardId);
    if (!card) return;

    const dbUpdates: Partial<IdeaCard> = { updatedAt: Date.now() };
    if (updates.tags) dbUpdates.tags = updates.tags;
    if (updates.color) dbUpdates.color = updates.color;
    await getDb().cards.update(cardId, dbUpdates);

    // If title/content/summary changed, create a new version
    if (updates.title || updates.content || updates.summary) {
      const currentVersion = await getDb().versions.get(card.currentVersionId);
      if (currentVersion) {
        const versionId = nanoid();
        const newVersion: CardVersion = {
          id: versionId,
          cardId,
          parentVersionId: card.currentVersionId,
          title: updates.title || currentVersion.title,
          content: updates.content !== undefined ? updates.content : currentVersion.content,
          summary: updates.summary || currentVersion.summary,
          chatHistory: currentVersion.chatHistory,
          createdAt: Date.now(),
        };
        await getDb().versions.put(newVersion);
        await getDb().cards.update(cardId, { currentVersionId: versionId, updatedAt: Date.now() });
      }
    }

    // Update node display
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id === cardId) {
          const data = { ...n.data as CardNodeData };
          if (updates.title) data.title = updates.title;
          if (updates.summary) data.summary = updates.summary;
          if (updates.tags) data.tags = updates.tags;
          if (updates.color) data.color = updates.color;
          if (updates.title || updates.content || updates.summary) {
            data.versionCount = (data.versionCount || 0) + 1;
          }
          return { ...n, data };
        }
        return n;
      }),
      // Recolor outgoing tree edges to match the (new) parent color
      edges: updates.color
        ? s.edges.map((e) =>
            e.source === cardId
              ? {
                  ...e,
                  style: { ...e.style, stroke: updates.color },
                  markerEnd: { type: MarkerType.ArrowClosed, color: updates.color, width: 18, height: 18 },
                }
              : e,
          )
        : s.edges,
    }));
    markWorkspaceDirty();
  },

  connectCards: (sourceCardId, targetCardId) => {
    if (sourceCardId === targetCardId) return;
    const { nodes, edges } = get();
    const sourceNode = nodes.find((n) => (n.data as CardNodeData).cardId === sourceCardId);
    const targetNode = nodes.find((n) => (n.data as CardNodeData).cardId === targetCardId);
    if (!sourceNode || !targetNode) return;

    const exists = edges.some(
      (e) =>
        (e.source === sourceNode.id && e.target === targetNode.id) ||
        (e.source === targetNode.id && e.target === sourceNode.id),
    );
    if (exists) return;

    connectCardsInternal(sourceCardId, targetCardId);
    pushUndo({ type: 'connect', sourceCardId, targetCardId });
    markWorkspaceDirty();
  },

  disconnectCards: (sourceCardId, targetCardId) => {
    const { edges } = get();
    const edgeId = `e-${sourceCardId}-${targetCardId}`;
    const altId = `e-${targetCardId}-${sourceCardId}`;
    const edge = edges.find((e) => e.id === edgeId || e.id === altId);
    if (!edge) return;

    pushUndo({ type: 'disconnect', sourceCardId: edge.source, targetCardId: edge.target });
    disconnectCardsInternal(edge.source, edge.target);
    markWorkspaceDirty();
  },

  canvasUndo: async () => {
    const entry = popUndo();
    if (!entry) return;

    switch (entry.type) {
      case 'connect':
        disconnectCardsInternal(entry.sourceCardId, entry.targetCardId);
        break;
      case 'disconnect':
        connectCardsInternal(entry.sourceCardId, entry.targetCardId);
        break;
      case 'addCard':
        await removeCardInternal(entry.cardId);
        break;
      case 'removeCard': {
        await getDb().cards.put(entry.card);
        await getDb().versions.bulkPut(entry.versions);

        for (const patch of entry.peerConnectionPatches) {
          await getDb().cards.update(patch.cardId, {
            connections: patch.connections,
            updatedAt: Date.now(),
          });
        }

        const version = entry.versions.find((v) => v.id === entry.card.currentVersionId)
          || entry.versions[entry.versions.length - 1];
        const versionCount = entry.versions.length;

        const node: Node<CardNodeData> = {
          id: entry.card.id,
          type: 'cardNode',
          position: entry.card.position,
          data: {
            cardId: entry.card.id,
            title: version?.title || '未命名',
            summary: version?.summary || '',
            versionCount,
            tags: entry.card.tags,
            parentId: entry.card.parentId,
            color: entry.card.color || '#00d4ff',
            kind: entry.card.kind || 'element',
          },
        };

        const restoredEdges: Edge[] = [];
        for (const connId of entry.card.connections) {
          const targetExists = await getDb().cards.get(connId);
          if (targetExists) {
            restoredEdges.push(
              buildEdge(entry.card.id, connId, entry.card.color || DEFAULT_EDGE_COLOR),
            );
          }
        }
        for (const patch of entry.peerConnectionPatches) {
          if (patch.connections.includes(entry.card.id)) {
            const peer = await getDb().cards.get(patch.cardId);
            if (peer) {
              restoredEdges.push(
                buildEdge(patch.cardId, entry.card.id, peer.color || DEFAULT_EDGE_COLOR),
              );
            }
          }
        }

        const edgeById = new Map<string, Edge>();
        for (const e of restoredEdges) edgeById.set(e.id, e);

        set((s) => ({
          nodes: [...s.nodes, node],
          edges: [...s.edges, ...Array.from(edgeById.values())],
        }));
        break;
      }
    }
    markWorkspaceDirty();
  },

  requestFitView: () => set((s) => ({ fitViewCounter: s.fitViewCounter + 1 })),


  addVersion: async (cardId, title, content, summary, chatHistory, parentVersionId) => {
    const card = await getDb().cards.get(cardId);
    if (!card) throw new Error('卡片不存在');

    const versionId = nanoid();
    const version: CardVersion = {
      id: versionId,
      cardId,
      parentVersionId: parentVersionId || card.currentVersionId,
      title,
      content,
      summary,
      chatHistory,
      createdAt: Date.now(),
    };

    await getDb().versions.put(version);
    await getDb().cards.update(cardId, {
      currentVersionId: versionId,
      updatedAt: Date.now(),
    });

    // Update node display
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id === cardId) {
          const data = n.data as CardNodeData;
          const versionCount = data.versionCount + 1;
          return {
            ...n,
            data: { ...data, title, summary, versionCount },
          };
        }
        return n;
      }),
    }));

    markWorkspaceDirty();
    return versionId;
  },

  switchVersion: (cardId, versionId) => {
    getDb().versions.get(versionId).then((version) => {
      if (version) {
        set((s) => ({
          nodes: s.nodes.map((n) => {
            if (n.id === cardId) {
              const data = n.data as CardNodeData;
              return {
                ...n,
                data: { ...data, title: version.title, summary: version.summary },
              };
            }
            return n;
          }),
        }));
        getDb().cards.update(cardId, { currentVersionId: versionId, updatedAt: Date.now() });
        markWorkspaceDirty();
      }
    });
  },

  enterSubCanvas: (cardId) => {
    set((s) => ({
      subCanvasStack: [...s.subCanvasStack, s.currentParentId || 'root'],
      currentParentId: cardId,
    }));
  },

  exitSubCanvas: () => {
    set((s) => {
      const stack = [...s.subCanvasStack];
      const parentId = stack.pop() || null;
      return {
        subCanvasStack: stack,
        currentParentId: parentId === 'root' ? null : parentId,
      };
    });
  },

  loadFromDB: async () => {
    const cards = await getDb().cards.toArray();
    const nodes: Node<CardNodeData>[] = [];
    const edges: Edge[] = [];

    for (const card of cards) {
      const currentVersion = await getDb().versions.get(card.currentVersionId);
      const versionCount = await getDb().versions.where('cardId').equals(card.id).count();

      nodes.push({
        id: card.id,
        type: 'cardNode',
        position: card.position,
        data: {
          cardId: card.id,
          title: currentVersion?.title || '未命名',
          summary: currentVersion?.summary || '',
          versionCount,
          tags: card.tags,
          parentId: card.parentId,
          color: card.color || '#00d4ff',
          kind: card.kind || 'element',
        },
      });
    }

    // Build edges after all nodes exist (so we can skip dangling references and color by parent)
    const cardById = new Map(cards.map((c) => [c.id, c]));
    const seen = new Set<string>();
    for (const card of cards) {
      for (const connId of card.connections) {
        if (!cardById.has(connId)) continue; // skip dangling
        const key = `${card.id}->${connId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push(buildEdge(card.id, connId, card.color || DEFAULT_EDGE_COLOR));
      }
    }

    set({ nodes, edges, undoStack: [] });
  },

  exportCanvas: async () => {
    const cards = await getDb().cards.toArray();
    const versions = await getDb().versions.toArray();
    return JSON.stringify({ cards, versions }, null, 2);
  },

  importCanvas: async (json: string) => {
    const data = JSON.parse(json);
    await getDb().cards.clear();
    await getDb().versions.clear();
    if (data.cards) await getDb().cards.bulkPut(data.cards);
    if (data.versions) await getDb().versions.bulkPut(data.versions);
    set({ undoStack: [] });
    await get().loadFromDB();
    markWorkspaceDirty();
  },

  resetCanvas: () => {
    positionWriteTimers.forEach((timer) => clearTimeout(timer));
    positionWriteTimers.clear();
    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      subCanvasStack: [],
      currentParentId: null,
      fitViewCounter: 0,
      undoStack: [],
    });
  },
  };
});
