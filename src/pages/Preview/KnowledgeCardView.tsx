// src/pages/Preview/KnowledgeCardView.tsx
import ReactMarkdown from 'react-markdown';
import { BookOpen, ChevronRight, SkipForward } from 'lucide-react';
import type { KnowledgeCard } from '../../types';
import type { KPWithContext } from '../../data/kpIndex';

interface KnowledgeCardViewProps {
  kp: KPWithContext;
  card: KnowledgeCard | null;  // null → fallback
  isJunior: boolean;
  fontSize: string;
  onStart: () => void;   // 「我学会了，开始练习」
  onSkip: () => void;    // 「跳过，直接练习」
}

export default function KnowledgeCardView({
  kp, card, isJunior, fontSize, onStart, onSkip,
}: KnowledgeCardViewProps) {
  // fallback：没有知识卡时
  if (!card) {
    return (
      <div className="bg-surface rounded-2xl border border-border p-6 text-center space-y-4">
        <p className="text-4xl">📖</p>
        <p className="text-text font-medium">{kp.name}</p>
        <p className="text-text-dim text-sm">
          这个知识点的讲解内容还在准备中。<br />
          你可以先看课本，再来做练习。
        </p>
        <button
          onClick={onSkip}
          className="px-6 py-2 bg-accent text-bg rounded-xl font-medium hover:bg-accent/90 transition-colors"
        >
          直接开始练习 →
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${fontSize}`}>
      {/* 知识卡主体 */}
      <div
        className={`rounded-2xl border border-border p-5 ${isJunior ? 'text-lg' : 'text-base'}`}
        style={isJunior ? {
          background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface2) 100%)',
          boxShadow: `inset 4px 0 0 ${kp.gradeColor}`,
        } : { background: 'var(--surface)' }}
      >
        {/* 标题区 */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-text-dim mb-1">
              {kp.gradeName} · {kp.unitSemester}学期 · {kp.domainName}
            </p>
            <h2 className="text-xl font-bold text-text">{kp.name}</h2>
          </div>
          {!isJunior && card.textbook_ref && (
            <div className="flex items-center gap-1 text-xs text-text-dim flex-shrink-0 ml-4">
              <BookOpen size={12} />
              <span>{card.textbook_ref}</span>
            </div>
          )}
        </div>

        {/* 讲解内容（Markdown） */}
        <div className="prose prose-sm prose-invert max-w-none">
          <ReactMarkdown>{card.explanation}</ReactMarkdown>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-3">
        <button
          onClick={onSkip}
          className="flex-1 py-2.5 border border-border rounded-xl text-text-dim text-sm hover:border-accent/40 hover:text-text transition-colors flex items-center justify-center gap-1"
        >
          <SkipForward size={14} />
          {isJunior ? '跳过，直接做题' : '跳过，直接练习'}
        </button>
        <button
          onClick={onStart}
          className="flex-1 py-2.5 bg-accent text-bg rounded-xl font-medium text-sm hover:bg-accent/90 transition-colors flex items-center justify-center gap-1"
        >
          {isJunior ? '我学会了！' : '开始练习'}
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
