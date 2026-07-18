// src/pages/Preview/PreviewSession.tsx

import { X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import AIChatDrawer from '../../components/AIChatDrawer';
import { usePreviewSession } from '../../hooks/usePreviewSession';
import { usePreviewStore } from '../../stores/previewStore';
import FAQView from './FAQView';
import KnowledgeCardView from './KnowledgeCardView';
import PracticeView from './PracticeView';
import PreviewSummary from './PreviewSummary';

export default function PreviewSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { setPhase, skipCard, completeKp } = usePreviewStore();

  const {
    session,
    currentKp,
    currentCard,
    currentQuestions,
    questionsLoading,
    isJunior,
    progress,
  } = usePreviewSession(sessionId ?? '');

  // The session does not exist because the session ID is invalid.
  if (!session || !currentKp) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-text-dim">预习记录不存在或已过期</p>
          <button
            onClick={() => navigate('/preview')}
            className="px-6 py-2 bg-accent text-bg rounded-xl"
          >
            重新选择
          </button>
        </div>
      </div>
    );
  }

  // Summary page.
  if (session.phase === 'summary') {
    return <PreviewSummary session={session} isJunior={isJunior} />;
  }

  const gradeNum = currentKp.gradeNum;

  return (
    <div className="min-h-screen bg-bg pt-14">
      {/* Top progress bar. */}
      <div className="fixed top-14 left-0 right-0 z-30 bg-surface/90 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between px-4 py-2 max-w-2xl mx-auto">
          <div>
            <p className="text-xs text-text-dim">
              知识点 {progress.current}/{progress.total} · {currentKp.name}
            </p>
            <p className="text-xs text-text-dim mt-0.5">
              {session.phase === 'card' && '📖 学习知识卡'}
              {session.phase === 'practice' && `✏️ 配套练习（${currentQuestions.length} 题）`}
              {session.phase === 'faq' && '💬 常见问题'}
            </p>
          </div>
          <button
            onClick={() => navigate('/preview')}
            className="text-text-dim hover:text-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        {/* Progress bar. */}
        <div className="h-0.5 bg-border">
          <div
            className="h-full bg-accent transition-all duration-500"
            style={{ width: `${(progress.current / progress.total) * 100}%` }}
          />
        </div>
      </div>

      {/* Main content area. */}
      <div className="max-w-2xl mx-auto px-4 pt-20 pb-24">
        {session.phase === 'card' && (
          <KnowledgeCardView
            kp={currentKp}
            card={currentCard}
            isJunior={isJunior}
            fontSize={isJunior ? 'text-lg' : 'text-base'}
            onStart={() => setPhase(session.sessionId, 'practice')}
            onSkip={() => skipCard(session.sessionId)}
          />
        )}

        {session.phase === 'practice' && questionsLoading && (
          <div className="bg-surface rounded-2xl border border-border p-6 text-center">
            <p className="text-text-dim text-sm">正在加载配套练习…</p>
          </div>
        )}

        {session.phase === 'practice' && !questionsLoading && (
          <PracticeView
            sessionId={session.sessionId}
            questions={currentQuestions}
            isJunior={isJunior}
            onComplete={() => setPhase(session.sessionId, 'faq')}
          />
        )}

        {session.phase === 'faq' && (
          <FAQView
            sessionId={session.sessionId}
            kpId={currentKp.id}
            card={currentCard}
            onContinue={() => completeKp(session.sessionId)}
          />
        )}
      </div>

      {/* AI chat overlay. */}
      <AIChatDrawer
        kpId={currentKp.id}
        kpName={currentKp.name}
        gradeNum={gradeNum}
        explanation={currentCard?.explanation}
      />
    </div>
  );
}
