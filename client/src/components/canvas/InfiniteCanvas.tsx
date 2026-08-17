import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCanvasStore } from '../../store/useCanvasStore';
import { useSessionStore } from '../../store/useSessionStore';
import CardNode from './CardNode';
import CanvasToolbar from './CanvasToolbar';
import type { CardNodeData } from '../../types';

interface Props {
  onCardClick: (cardId: string) => void;
  onVersionClick: (cardId: string) => void;
  onRecommendClick: (cardId: string) => void;
  onDeleteCard: (cardId: string) => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

const nodeTypes = { cardNode: CardNode };

function FitViewController() {
  const { fitView } = useReactFlow();
  const fitViewCounter = useCanvasStore((s) => s.fitViewCounter);

  useEffect(() => {
    if (fitViewCounter > 0) {
      const timer = setTimeout(() => {
        fitView({ padding: 0.3, duration: 400 });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [fitViewCounter, fitView]);

  return null;
}

export default function InfiniteCanvas({
  onCardClick,
  onVersionClick,
  onRecommendClick,
  onDeleteCard,
  onShowToast,
}: Props) {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    selectCard,
    currentParentId,
    enterSubCanvas,
    connectCards,
    disconnectCards,
    canvasUndo,
  } = useCanvasStore();

  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const cardId = node.data.cardId as string;

      // If in connect mode and clicking a different card, create the connection
      if (connectSourceId && cardId !== connectSourceId) {
        connectCards(connectSourceId, cardId);
        onShowToast('连线已创建');
        setConnectSourceId(null);
        return;
      }

      // Otherwise, normal selection
      selectCard(cardId);
      onCardClick(cardId);
      setConnectSourceId(null);
      setSelectedEdgeId(null);
    },
    [selectCard, onCardClick, connectSourceId, connectCards, onShowToast],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      onConnect(connection);
      onShowToast('连线已创建');
    },
    [onConnect, onShowToast],
  );

  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      if (selectedEdgeId === edge.id) {
        disconnectCards(edge.source, edge.target);
        setSelectedEdgeId(null);
        onShowToast('连线已删除');
      } else {
        setSelectedEdgeId(edge.id);
        onShowToast('连线已选中，再次点击删除');
      }
    },
    [selectedEdgeId, disconnectCards, onShowToast],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        const active = document.activeElement;
        if (
          active &&
          (active.tagName === 'INPUT' ||
            active.tagName === 'TEXTAREA' ||
            (active as HTMLElement).isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        const { undoStack } = useCanvasStore.getState();
        if (undoStack.length > 0) {
          canvasUndo().then(() => onShowToast('已撤回上一步操作'));
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canvasUndo, onShowToast]);

  // Filter nodes by current parent level
  const filteredNodes = currentParentId
    ? nodes.filter((n) => (n.data as CardNodeData).parentId === currentParentId)
    : nodes.filter((n) => !(n.data as CardNodeData).parentId);

  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter(
    (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target),
  );

  const displayEdges = filteredEdges.map((e) => {
    const isSelected = e.id === selectedEdgeId;
    const baseColor = (e.style?.stroke as string) || '#a78bfa';
    return {
      ...e,
      selected: isSelected,
      animated: !isSelected && e.animated,
      style: isSelected
        ? { ...e.style, stroke: '#f87171', strokeWidth: 3, cursor: 'pointer' }
        : { ...e.style, stroke: baseColor, strokeWidth: 2, cursor: 'pointer' },
      markerEnd: isSelected
        ? { type: MarkerType.ArrowClosed, color: '#f87171', width: 18, height: 18 }
        : e.markerEnd,
    };
  });

  const displayNodes = filteredNodes.map((n) => ({
    ...n,
    data: {
      ...n.data,
      onVersionClick,
      onRecommendClick,
      onEnterSubCanvas: (cardId: string) => {
        enterSubCanvas(cardId);
        onShowToast('已进入子画布');
      },
      onDeleteClick: (cardId: string) => {
        onDeleteCard(cardId);
      },
      onConnectClick: (cardId: string) => {
        setConnectSourceId(cardId);
        onShowToast('请点击目标卡片完成连线（点击空白取消）');
      },
      onBranchClick: (cardId: string) => {
        useSessionStore.getState().startFromCard(cardId);
        onShowToast('已从该节点引出新提问，请在左侧对话继续');
      },
    },
    style: connectSourceId && (n.data as CardNodeData).cardId === connectSourceId
      ? {
          border: '2px solid #facc15',
          boxShadow: '0 0 20px rgba(250, 204, 21, 0.4)',
          zIndex: 100,
        }
      : undefined,
  }));

  const handlePaneClick = useCallback(() => {
    if (connectSourceId) {
      setConnectSourceId(null);
      onShowToast('已取消连线模式');
    }
    if (selectedEdgeId) {
      setSelectedEdgeId(null);
    }
  }, [connectSourceId, selectedEdgeId, onShowToast]);

  return (
    <div className="absolute inset-0">
      <CanvasToolbar onShowToast={onShowToast} />

      {/* Connect mode indicator */}
      {connectSourceId && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full glass text-xs text-yellow-300 border border-yellow-500/30 animate-pulse">
          连线模式：请点击目标卡片 (Esc 取消)
        </div>
      )}

      {selectedEdgeId && !connectSourceId && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full glass text-xs text-red-300 border border-red-500/30">
          连线已选中，再次点击该连线可删除（点击空白取消）
        </div>
      )}

      {/* Debug panel */}
      <div className="absolute top-16 left-4 z-20 glass p-2 text-[10px] font-mono text-gray-400 space-y-0.5">
        <div>store.nodes: {nodes.length}</div>
        <div>filtered: {filteredNodes.length}</div>
        <div>display: {displayNodes.length}</div>
        <div>edges: {edges.length}</div>
        <div>currentParentId: {String(currentParentId)}</div>
      </div>

      {/* Empty state hint */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="text-center space-y-3">
            <span className="text-5xl">🪄</span>
            <p className="text-gray-500 text-sm">画布为空</p>
            <p className="text-gray-600 text-xs">
              点击右上角「＋ 卡片」创建第一个想法，或在左侧对话中生成
            </p>
          </div>
        </div>
      )}

      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onEdgeClick={handleEdgeClick}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        edgesFocusable
        nodeTypes={nodeTypes}
        defaultViewport={{ x: 100, y: 100, zoom: 1 }}
        fitView
        fitViewOptions={{ padding: 0.3, duration: 400 }}
        minZoom={0.1}
        maxZoom={2}
        style={{ width: '100%', height: '100%' }}
        defaultEdgeOptions={{
          type: 'default',
          animated: true,
          interactionWidth: 20,
          style: { stroke: '#a78bfa', strokeWidth: 2, cursor: 'pointer' },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#a78bfa', width: 18, height: 18 },
        }}
        proOptions={{ hideAttribution: true }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            if (connectSourceId) {
              setConnectSourceId(null);
              onShowToast('已取消连线模式');
            } else if (selectedEdgeId) {
              setSelectedEdgeId(null);
              onShowToast('已取消连线选中');
            }
          }
        }}
      >
        <Background color="rgba(255, 255, 255, 0.15)" gap={32} size={1.5} />
        <Controls
          className="!bg-white/10 !border-white/10 !rounded-xl [&_button]:!bg-white/10 [&_button]:!border-white/10 [&_button]:!text-white/70 [&_button:hover]:!bg-white/20 [&_button:hover]:!text-white [&_svg]:!fill-white/70"
          style={{
            background: 'rgba(15, 15, 40, 0.75)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '12px',
            backdropFilter: 'blur(12px)',
          }}
        />
        <MiniMap
          nodeStrokeColor="#a78bfa"
          nodeColor="rgba(0, 212, 255, 0.3)"
          maskColor="rgba(0,0,0,0.7)"
          style={{
            background: 'rgba(15, 15, 40, 0.85)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        />
        <FitViewController />
      </ReactFlow>
    </div>
  );
}
