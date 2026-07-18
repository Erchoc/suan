// src/components/Mascot/index.tsx
import { motion, AnimatePresence } from 'framer-motion';

export type MascotState = 'idle' | 'speaking' | 'correct' | 'wrong';

interface MascotProps {
  state: MascotState;
  bubble?: string;  // 气泡文字，undefined 时不显示气泡
}

const MASCOT_EMOJI: Record<MascotState, string> = {
  idle: '🧮',
  speaking: '💬',
  correct: '🌟',
  wrong: '💪',
};

export default function Mascot({ state, bubble }: MascotProps) {
  return (
    <div className="fixed bottom-24 right-4 z-40 flex flex-col items-end gap-2 pointer-events-none">
      {/* 气泡 */}
      <AnimatePresence>
        {bubble && (
          <motion.div
            key={bubble}
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="max-w-48 bg-surface2 border border-border rounded-2xl rounded-br-none px-3 py-2 text-sm text-text shadow-lg"
          >
            {bubble}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 吉祥物图标 */}
      <motion.div
        animate={state === 'speaking' ? { rotate: [0, -5, 5, -5, 0] } : { rotate: 0 }}
        transition={{ duration: 0.5, repeat: state === 'speaking' ? Infinity : 0, repeatDelay: 1 }}
        className="w-14 h-14 bg-surface2 border-2 border-accent/40 rounded-full flex items-center justify-center text-2xl shadow-lg select-none"
      >
        {MASCOT_EMOJI[state]}
      </motion.div>
    </div>
  );
}
