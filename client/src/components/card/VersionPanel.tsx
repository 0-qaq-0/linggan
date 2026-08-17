import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getDb } from '../../db/dexie';
import { useCanvasStore } from '../../store/useCanvasStore';
import { useSessionStore } from '../../store/useSessionStore';
import type { CardVersion } from '../../types';

interface Props {
  cardId: string;
  onClose: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}


export default function VersionPanel({ cardId, onClose, onShowToast }: Props) {
  const [versions, setVersions] = useState<CardVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const switchVersion = useCanvasStore((s) => s.switchVersion);
  const loadHistory = useSessionStore((s) => s.loadHistory);

  useEffect(() => {
    (async () => {
      const allVersions = await getDb().versions
        .where('cardId')
        .equals(cardId)
        .toArray();
      allVersions.sort((a, b) => a.createdAt - b.createdAt);
      setVersions(allVersions);

    })();
  }, [cardId]);


  const handleSwitch = (version: CardVersion) => {
    switchVersion(cardId, version.id);
    setSelectedVersionId(version.id);
    onShowToast(`已切换到版本 ${version.title.slice(0, 20)}`);
  };

  const handleBranch = (version: CardVersion) => {
    // Load this version's chat history into session for continued editing
    loadHistory(version.chatHistory, 'final', version.content);
    onClose();
    onShowToast('已加载版本对话历史，可继续编辑');
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
            <h2 className="text-base font-semibold text-white">版本历史</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
          </div>

          {versions.length === 0 ? (
            <p className="text-sm text-gray-500">暂无版本记录</p>
          ) : (
            <div className="space-y-1">
              {versions.map((version, idx) => {
                const isSelected = selectedVersionId === version.id;
                return (
                  <motion.div
                    key={version.id}
                    className={`p-3 rounded-xl cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#00d4ff]/10 border border-[#00d4ff]/30'
                        : 'bg-white/5 border border-white/5 hover:border-white/15'
                    }`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={() => handleSwitch(version)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-white truncate">
                        {version.title}
                      </span>
                      <span className="text-[10px] text-gray-600 font-mono">
                        v{idx + 1}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-2 mb-2">
                      {version.summary}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-600">
                        {new Date(version.createdAt).toLocaleString('zh-CN')}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBranch(version);
                        }}
                        className="text-[10px] px-2 py-0.5 rounded bg-[#a78bfa]/15 border border-[#a78bfa]/20 text-[#a78bfa] hover:bg-[#a78bfa]/25 transition-colors"
                      >
                        🌿 分支编辑
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
