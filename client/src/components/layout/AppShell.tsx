import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface Props {
  chatPanel: ReactNode;
  canvas: ReactNode;
}

export default function AppShell({ chatPanel, canvas }: Props) {
  return (
    <div className="flex-1 flex overflow-hidden">
      <motion.div
        className="w-[380px] min-w-[320px] border-r border-white/5 flex flex-col bg-[#0a0a1a]/80"
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {chatPanel}
      </motion.div>
      <div className="flex-1 relative canvas-grid">
        {canvas}
      </div>
    </div>
  );
}
