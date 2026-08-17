import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  message: string;
  type: 'success' | 'error';
}

export default function Toast({ message, type }: Props) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg"
        style={{
          background: type === 'success' ? 'rgba(0, 200, 100, 0.2)' : 'rgba(255, 60, 60, 0.2)',
          border: `1px solid ${type === 'success' ? 'rgba(0, 200, 100, 0.4)' : 'rgba(255, 60, 60, 0.4)'}`,
          color: type === 'success' ? '#00e676' : '#ff5252',
          backdropFilter: 'blur(12px)',
        }}
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
      >
        {message}
      </motion.div>
    </AnimatePresence>
  );
}
