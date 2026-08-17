import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getDb } from '../../db/dexie';
import { useCanvasStore } from '../../store/useCanvasStore';
import { CARD_COLORS } from '../../types';
import type { IdeaCard, CardVersion } from '../../types';

interface Props {
  cardId: string;
  onClose: () => void;
  onVersionClick: (cardId: string) => void;
  onRecommendClick: (cardId: string) => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function CardDetail({
  cardId,
  onClose,
  onVersionClick,
  onRecommendClick,
  onShowToast,
}: Props) {
  const [card, setCard] = useState<IdeaCard | null>(null);
  const [currentVersion, setCurrentVersion] = useState<CardVersion | null>(null);
  const [versionCount, setVersionCount] = useState(0);

  // Editable fields
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editColor, setEditColor] = useState('#00d4ff');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  const removeCard = useCanvasStore((s) => s.removeCard);
  const updateCard = useCanvasStore((s) => s.updateCard);

  useEffect(() => {
    (async () => {
      const c = await getDb().cards.get(cardId);
      if (c) {
        setCard(c);
        setEditColor(c.color || '#00d4ff');
        setEditTags([...c.tags]);
        const v = await getDb().versions.get(c.currentVersionId);
        if (v) {
          setCurrentVersion(v);
          setEditTitle(v.title);
          setEditContent(v.content);
        }
        const count = await getDb().versions.where('cardId').equals(cardId).count();
        setVersionCount(count);
      }
    })();
  }, [cardId]);

  // Track dirty state
  useEffect(() => {
    if (!currentVersion || !card) return;
    const titleChanged = editTitle !== currentVersion.title;
    const contentChanged = editContent !== currentVersion.content;
    const colorChanged = editColor !== (card.color || '#00d4ff');
    const tagsChanged = JSON.stringify(editTags.sort()) !== JSON.stringify([...card.tags].sort());
    setIsDirty(titleChanged || contentChanged || colorChanged || tagsChanged);
  }, [editTitle, editContent, editColor, editTags, currentVersion, card]);

  const handleSave = async () => {
    if (!isDirty || !currentVersion) return;
    const titleChanged = editTitle !== currentVersion.title;
    const contentChanged = editContent !== currentVersion.content;
    await updateCard(cardId, {
      title: titleChanged ? editTitle : undefined,
      content: contentChanged ? editContent : undefined,
      summary: (titleChanged || contentChanged) ? editContent.slice(0, 80) : undefined,
      tags: editTags,
      color: editColor,
    });
    onShowToast('卡片已更新');

    // Refresh local state
    const c = await getDb().cards.get(cardId);
    if (c) {
      setCard(c);
      const v = await getDb().versions.get(c.currentVersionId);
      if (v) setCurrentVersion(v);
      const count = await getDb().versions.where('cardId').equals(cardId).count();
      setVersionCount(count);
    }
  };

  const handleDelete = async () => {
    await removeCard(cardId);
    onShowToast('卡片已删除');
    onClose();
  };

  const addTag = () => {
    const tag = newTag.trim();
    if (!tag || editTags.includes(tag)) return;
    setEditTags([...editTags, tag]);
    setNewTag('');
  };

  const removeTag = (tag: string) => {
    setEditTags(editTags.filter((t) => t !== tag));
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed right-0 top-12 bottom-0 w-[360px] glass border-l border-white/10 z-40 overflow-y-auto scrollbar-thin"
        initial={{ x: 360 }}
        animate={{ x: 0 }}
        exit={{ x: 360 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      >
        <div className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">卡片详情</h2>
            <div className="flex items-center gap-2">
              {isDirty && (
                <button
                  onClick={handleSave}
                  className="px-3 py-1 rounded-lg text-xs bg-[#00d4ff]/20 border border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/30 transition-all"
                >
                  保存
                </button>
              )}
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white text-lg"
              >
                ✕
              </button>
            </div>
          </div>

          {currentVersion && (
            <>
              {/* Title — editable */}
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">标题</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#00d4ff] transition-colors"
                />
              </div>

              {/* Content — editable */}
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">内容</label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={6}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-sm leading-relaxed focus:outline-none focus:border-[#00d4ff] transition-colors resize-none scrollbar-thin"
                />
              </div>

              {/* Color picker */}
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">主题色</label>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {CARD_COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setEditColor(c.value)}
                      className="w-8 h-8 rounded-full border-2 transition-all hover:scale-110"
                      style={{
                        backgroundColor: c.value,
                        borderColor: editColor === c.value ? '#fff' : 'transparent',
                        boxShadow: editColor === c.value ? `0 0 10px ${c.value}80` : 'none',
                      }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              {/* Tags management */}
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">标签</label>
                <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
                  {editTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                      style={{
                        background: `${editColor}20`,
                        border: `1px solid ${editColor}40`,
                        color: editColor,
                      }}
                    >
                      {tag}
                      <button
                        onClick={() => removeTag(tag)}
                        className="text-current opacity-60 hover:opacity-100"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTag()}
                    placeholder="添加标签..."
                    className="flex-1 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-[#00d4ff] transition-colors"
                  />
                  <button
                    onClick={addTag}
                    className="px-3 py-1 rounded-lg text-xs bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Metadata */}
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>版本 {versionCount}</span>
                <span>·</span>
                <span>{new Date(card?.updatedAt || Date.now()).toLocaleString('zh-CN')}</span>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <button
                  onClick={() => onVersionClick(cardId)}
                  className="w-full py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-300 hover:border-[#a78bfa]/30 hover:text-[#a78bfa] transition-all"
                >
                  📋 查看版本历史
                </button>
                <button
                  onClick={() => onRecommendClick(cardId)}
                  className="w-full py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-300 hover:border-[#00d4ff]/30 hover:text-[#00d4ff] transition-all"
                >
                  💡 AI 推荐相关问题
                </button>
                <button
                  onClick={handleDelete}
                  className="w-full py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 hover:bg-red-500/20 transition-all"
                >
                  🗑 删除卡片
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
