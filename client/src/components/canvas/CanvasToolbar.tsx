import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCanvasStore } from '../../store/useCanvasStore';
import { getDb } from '../../db/dexie';
import { CARD_COLORS } from '../../types';
import type { CardNodeData } from '../../types';

interface Props {
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function CanvasToolbar({ onShowToast }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);
  const [cardTitle, setCardTitle] = useState('');
  const [cardContent, setCardContent] = useState('');
  const [cardColor, setCardColor] = useState('#00d4ff');
  const {
    exportCanvas,
    importCanvas,
    loadFromDB,
    addCard,
    currentParentId,
    exitSubCanvas,
    nodes,
    canvasUndo,
    undoStack,
  } = useCanvasStore();

  const handleExport = async () => {
    try {
      const json = await exportCanvas();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `linggan-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      onShowToast('画布数据已导出');
    } catch (e: any) {
      onShowToast('导出失败: ' + e.message, 'error');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const text = await file.text();
      await importCanvas(text);
      await loadFromDB();
      onShowToast('画布数据已导入');
    } catch (e: any) {
      onShowToast('导入失败: ' + e.message, 'error');
    }
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAutoLayout = async () => {
    const { nodes: allNodes, currentParentId: pid } = useCanvasStore.getState();
    const nodes = pid
      ? allNodes.filter((n) => (n.data as CardNodeData).parentId === pid)
      : allNodes.filter((n) => !(n.data as CardNodeData).parentId);
    if (nodes.length <= 1) {
      onShowToast('至少需要 2 个卡片才能自动布局', 'error');
      return;
    }
    const centerX = 500;
    const centerY = 400;
    const radius = Math.max(250, nodes.length * 60);
    for (const node of nodes) {
      const idx = nodes.indexOf(node);
      const angle = (2 * Math.PI * idx) / nodes.length - Math.PI / 2;
      node.position = { x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) };
      const cardId = (node.data as any)?.cardId;
      if (cardId) {
        await getDb().cards.update(cardId, { position: node.position, updatedAt: Date.now() });
      }
    }
    useCanvasStore.setState({ nodes: [...allNodes] });
    onShowToast('已应用自动布局');
  };

  const handleAddCard = async () => {
    const title = cardTitle.trim() || '新卡片';
    const content = cardContent.trim() || title;
    await addCard(title, content, content.slice(0, 80), [], [], cardColor);
    onShowToast('卡片已添加');
    setShowAddCard(false);
    setCardTitle('');
    setCardContent('');
    setCardColor('#00d4ff');
  };

  return (
    <>
      {/* Sub-canvas breadcrumb */}
      {currentParentId && (
        <motion.div
          className="absolute top-4 left-4 z-10 flex items-center gap-2"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button
            onClick={() => { exitSubCanvas(); onShowToast('已返回上级画布'); }}
            className="px-3 py-1.5 rounded-lg text-xs glass-hover glass text-[#a78bfa] hover:text-white transition-colors border border-[#a78bfa]/30"
          >
            ← 返回上级画布
          </button>
          <span className="text-xs text-gray-500">
            子画布 · {nodes.filter((n) => (n.data as CardNodeData).parentId === currentParentId).length} 个卡片
          </span>
        </motion.div>
      )}

      <motion.div
        className="absolute top-4 right-4 z-10 flex gap-1.5"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <button
          onClick={async () => {
            await canvasUndo();
            onShowToast('已撤回上一步操作');
          }}
          disabled={undoStack.length === 0}
          className="px-3 py-1.5 rounded-lg text-xs glass-hover glass text-gray-300 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="撤回 (Ctrl+Z)"
        >
          ↩ 撤回
        </button>
        <button
          onClick={() => setShowAddCard(true)}
          className="px-3 py-1.5 rounded-lg text-xs glass-hover glass text-[#00d4ff] hover:text-white transition-colors border border-[#00d4ff]/30"
          title="添加卡片"
        >
          ＋ 卡片
        </button>
        <button
          onClick={handleAutoLayout}
          className="px-3 py-1.5 rounded-lg text-xs glass-hover glass text-gray-300 hover:text-white transition-colors"
          title="自动排版"
        >
          🔄 排版
        </button>
        <button
          onClick={handleExport}
          className="px-3 py-1.5 rounded-lg text-xs glass-hover glass text-gray-300 hover:text-white transition-colors"
          title="导出 JSON"
        >
          📥 导出
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg text-xs glass-hover glass text-gray-300 hover:text-white transition-colors disabled:opacity-50"
          title="导入 JSON"
        >
          {loading ? '⏳' : '📤'} 导入
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          className="hidden"
        />
      </motion.div>

      {/* Add card form */}
      <AnimatePresence>
        {showAddCard && (
          <motion.div
            className="absolute top-16 right-4 z-20 glass p-4 w-[300px] space-y-3"
            initial={{ opacity: 0, scale: 0.9, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">添加卡片</h3>
              <button
                onClick={() => setShowAddCard(false)}
                className="text-gray-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
            <input
              type="text"
              value={cardTitle}
              onChange={(e) => setCardTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCard()}
              placeholder="卡片标题"
              autoFocus
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00d4ff] transition-colors"
            />
            <textarea
              value={cardContent}
              onChange={(e) => setCardContent(e.target.value)}
              placeholder="卡片内容（可选）"
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00d4ff] transition-colors resize-none scrollbar-thin"
            />
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">主题色</label>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                {CARD_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setCardColor(c.value)}
                    className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110"
                    style={{
                      backgroundColor: c.value,
                      borderColor: cardColor === c.value ? '#fff' : 'transparent',
                      boxShadow: cardColor === c.value ? `0 0 8px ${c.value}80` : 'none',
                    }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={handleAddCard}
              className="w-full py-2 rounded-lg bg-gradient-to-r from-[#00d4ff] to-[#a78bfa] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              添加到画布
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
