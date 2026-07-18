import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { useReviewStore } from '../../stores/reviewStore';
import Button from '../../components/ui/Button';

export default function ReviewSummary() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { getSession } = useReviewStore();

  const session = sessionId ? getSession(sessionId) : null;
  if (!session) { navigate('/review'); return null; }

  const total    = session.questions.length;
  const correct  = Object.values(session.results).filter(r => r === 'correct').length;
  const wrong    = Object.values(session.results).filter(r => r === 'wrong').length;
  const duration = session.completedAt
    ? Math.floor((session.completedAt - session.startedAt) / 1000 / 60)
    : 0;

  return (
    <div className="min-h-screen pt-14 flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full">
        <div className="text-center mb-8">
          <p className="text-5xl mb-3">&#127881;</p>
          <h1 className="font-brush text-3xl text-accent mb-2">复习完成</h1>
          <p className="text-text-dim">用时 {duration} 分钟</p>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-6 mb-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-text">{total}</p>
              <p className="text-xs text-text-dim mt-1">本次题目</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-400">{correct}</p>
              <p className="text-xs text-text-dim mt-1">答对</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-400">{wrong}</p>
              <p className="text-xs text-text-dim mt-1">答错</p>
            </div>
          </div>
          {total > 0 && (
            <div className="mt-4 h-2 bg-surface2 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: `${(correct / total) * 100}%` }} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Button variant="secondary" onClick={() => navigate('/review')} className="w-full flex items-center justify-center gap-2">
            <RotateCcw size={15} /> 继续复习其他内容
          </Button>
          <Button variant="primary" onClick={() => navigate('/assessment')} className="w-full">
            去摸底考试检验一下
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
