import { motion } from 'framer-motion';

interface Props {
  content: string;
  note?: string;
  tags?: string[];
  onPackage: () => void;
}

export default function RefinementResult({ content, note, tags, onPackage }: Props) {
  return (
    <motion.div
      className="glass p-4 space-y-3"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 20 }}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm">✨</span>
        <span className="text-xs font-medium text-[#a78bfa]">精炼结果</span>
      </div>

      <p className="text-sm text-white leading-relaxed">{content}</p>

      {note && (
        <p className="text-xs text-gray-400">{note}</p>
      )}

      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded-full text-xs bg-white/5 border border-white/10 text-gray-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <motion.button
        onClick={onPackage}
        className="w-full py-2 rounded-lg bg-gradient-to-r from-[#00d4ff] to-[#a78bfa] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        📦 打包为画布元素
      </motion.button>
    </motion.div>
  );
}
