// src/pages/Preview/PreviewSummary.tsx

import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { kpMap } from '../../data/kpIndex';
import type { PreviewSession } from '../../types';

interface PreviewSummaryProps {
  session: PreviewSession;
  isJunior: boolean;
}

export default function PreviewSummary({ session, isJunior }: PreviewSummaryProps) {
  const navigate = useNavigate();
  const results = Object.values(session.results);
  const correct = results.filter(r => r === 'correct').length;
  const total = results.length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : null;

  return (
    <div className="min-h-screen bg-bg pt-16 pb-8 px-4 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full space-y-6"
      >
        {/* Celebration animation for younger grades. */}
        {isJunior && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.2, 1] }}
            transition={{ duration: 0.5 }}
            className="text-center text-6xl"
          >
            🎉
          </motion.div>
        )}

        <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
          <h2 className="text-2xl font-bold text-text text-center">
            {isJunior ? '🌟 预习完成！' : '预习完成'}
          </h2>

          {/* Statistics summary. */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-surface2 rounded-xl p-3">
              <p className="text-2xl font-bold text-accent">{session.kpIds.length}</p>
              <p className="text-xs text-text-dim mt-1">知识点</p>
            </div>
            <div className="bg-surface2 rounded-xl p-3">
              <p className="text-2xl font-bold text-text">{total}</p>
              <p className="text-xs text-text-dim mt-1">练习题</p>
            </div>
            <div className="bg-surface2 rounded-xl p-3">
              <p className="text-2xl font-bold text-green">
                {total > 0 ? `${correct}/${total}` : '—'}
              </p>
              <p className="text-xs text-text-dim mt-1">答对{pct !== null ? `（${pct}%）` : ''}</p>
            </div>
          </div>

          {/* Knowledge point list. */}
          <div className="space-y-1">
            {session.kpIds.map(kpId => {
              const kp = kpMap.get(kpId);
              return (
                <div key={kpId} className="flex items-center gap-2 text-sm">
                  <span className="text-green">✅</span>
                  <span className="text-text">{kp?.name ?? kpId}</span>
                  <span className="text-text-dim text-xs ml-auto">{kp?.gradeName}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action buttons. */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate('/preview')}
            className="py-3 border border-border rounded-xl text-text-dim text-sm hover:border-accent/40 hover:text-text transition-colors"
          >
            继续预习
          </button>
          <button
            onClick={() => navigate('/assessment')}
            className="py-3 bg-accent text-bg rounded-xl font-medium text-sm hover:bg-accent/90 transition-colors"
          >
            去摸底考试
          </button>
        </div>
      </motion.div>
    </div>
  );
}
