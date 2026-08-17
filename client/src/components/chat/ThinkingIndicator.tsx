import { motion } from 'framer-motion';

export default function ThinkingIndicator() {
  return (
    <motion.div
      className="flex items-center gap-3 px-4 py-3"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className="flex items-center gap-1.5">
        <div
          className="w-2 h-2 rounded-full typing-dot"
          style={{ background: 'var(--primary)' }}
        />
        <div
          className="w-2 h-2 rounded-full typing-dot"
          style={{ background: 'var(--accent)' }}
        />
        <div
          className="w-2 h-2 rounded-full typing-dot"
          style={{ background: 'var(--primary)' }}
        />
      </div>
      <span className="text-sm text-gray-400">AI 正在思考...</span>
    </motion.div>
  );
}
