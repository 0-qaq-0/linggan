import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getDb } from '../../db/dexie';
import { useCanvasStore } from '../../store/useCanvasStore';
import { useSessionStore } from '../../store/useSessionStore';
import { getRecommendations } from '../../services/aiService';
import type { AIRecommendation } from '../../types';
import ThinkingIndicator from '../chat/ThinkingIndicator';

interface Props {
  cardId: string;
  onClose: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function RecommendPanel({ cardId, onClose, onShowToast }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const addChildElement = useCanvasStore((s) => s.addChildElement);
  const submitIdea = useSessionStore((s) => s.submitIdea);
  const provider = useSessionStore((s) => s.provider);
  const model = useSessionStore((s) => s.model);
  const apiKey = useSessionStore((s) => s.apiKey);
  const baseURL = useSessionStore((s) => s.baseURL);

  useEffect(() => {
    (async () => {
      try {
        const version = await getDb().versions.get(
          (await getDb().cards.get(cardId))?.currentVersionId || '',
        );
        if (!version) {
          setError('找不到卡片内容');
          setLoading(false);
          return;
        }

        // Get nearby card summaries as context
        const nearbyIds = (await getDb().cards.get(cardId))?.connections || [];
        const nearbySummaries: string[] = [];
        for (const nid of nearbyIds.slice(0, 5)) {
          const v = await getDb().versions.get((await getDb().cards.get(nid))?.currentVersionId || '');
          if (v) nearbySummaries.push(`${v.title}: ${v.summary}`);
        }

        if (!apiKey) {
          setError('请先在设置中配置 API 密钥');
          setLoading(false);
          return;
        }

        const recs = await getRecommendations({
          cardTitle: version.title,
          cardContent: version.content,
          canvasContext: nearbySummaries.join('; '),
          provider,
          model,
          apiKey,
          baseURL: baseURL || undefined,
        });

        setRecommendations(recs);
      } catch (e: any) {
        setError(e.message);
      }
      setLoading(false);
    })();
  }, [cardId, provider, model, apiKey, baseURL]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateCards = async () => {
    setCreating(true);
    try {
      for (const rec of recommendations) {
        if (selectedIds.has(rec.question)) {
          await addChildElement(cardId, {
            title: rec.title,
            content: rec.question,
            summary: rec.question.slice(0, 80),
            tags: rec.tags,
          });
        }
      }

      onShowToast('已创建相关探索卡片并连接到源节点');
      onClose();
    } catch (e: any) {
      onShowToast('创建失败: ' + e.message, 'error');
    }
    setCreating(false);
  };

  const handleExplore = (rec: AIRecommendation) => {
    submitIdea(rec.question);
    onClose();
    onShowToast('已在新对话中打开');
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
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">AI 推荐</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
          </div>

          {loading && <ThinkingIndicator />}

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          {!loading && !error && recommendations.length === 0 && (
            <p className="text-sm text-gray-500">暂无可推荐的探索方向</p>
          )}

          {!loading &&
            recommendations.map((rec, idx) => (
              <motion.div
                key={rec.question}
                className={`p-3 rounded-xl cursor-pointer transition-all ${
                  selectedIds.has(rec.question)
                    ? 'bg-[#00d4ff]/10 border border-[#00d4ff]/30'
                    : 'bg-white/5 border border-white/5 hover:border-white/15'
                }`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.08 }}
                onClick={() => toggleSelect(rec.question)}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    <div
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                        selectedIds.has(rec.question)
                          ? 'bg-[#00d4ff] border-[#00d4ff]'
                          : 'border-gray-500'
                      }`}
                    >
                      {selectedIds.has(rec.question) && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-white mb-1">{rec.title}</h4>
                    <p className="text-xs text-gray-400">{rec.question}</p>
                    {rec.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {rec.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 border border-white/10 text-gray-500"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExplore(rec);
                      }}
                      className="mt-2 text-[10px] px-2 py-1 rounded bg-[#00d4ff]/10 border border-[#00d4ff]/20 text-[#00d4ff] hover:bg-[#00d4ff]/20 transition-colors"
                    >
                      在新对话中探索
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}

          {recommendations.length > 0 && (
            <button
              onClick={handleCreateCards}
              disabled={selectedIds.size === 0 || creating}
              className="w-full py-2 rounded-lg bg-gradient-to-r from-[#00d4ff] to-[#a78bfa] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {creating ? '创建中...' : `将 ${selectedIds.size} 个推荐创建为卡片`}
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
