import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, ChevronLeft, ChevronRight, Menu, X, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import QuestionCard from '../../components/QuestionCard/QuestionCard';
import Button from '../../components/ui/Button';
import { submitQuestionReport } from '../../data/questionReports';
import { useReviewStore } from '../../stores/reviewStore';
import type { QuestionType, ReviewResult } from '../../types';

function isAnswered(
  qType: QuestionType,
  blankCount: number,
  answers: string[],
  choiceAnswer: string | undefined,
): boolean {
  const hasBlanks =
    blankCount > 0 &&
    answers.length >= blankCount &&
    answers.slice(0, blankCount).every(a => a?.trim());
  const hasChoice = !!choiceAnswer;
  switch (qType) {
    case 'fill_blank':
      return hasBlanks;
    case 'choice':
      return hasChoice;
    case 'mixed':
      return hasBlanks && hasChoice;
    default:
      return hasBlanks;
  }
}

type CellStatus = 'current' | 'correct' | 'wrong' | 'answered' | 'unanswered';

function ProgressCell({
  status,
  num,
  onClick,
}: {
  status: CellStatus;
  num: number;
  onClick: () => void;
}) {
  const base =
    'w-8 h-8 rounded-lg text-xs flex items-center justify-center font-mono transition-all border-2 cursor-pointer';
  const cls: Record<CellStatus, string> = {
    current: `${base} bg-accent text-white font-bold border-accent ring-2 ring-accent/30`,
    correct: `${base} bg-green-500/30 text-green-400 border-green-500`,
    wrong: `${base} bg-red-500/30 text-red-400 border-red-500`,
    answered: `${base} bg-blue-500/20 text-blue-400 border-blue-500`,
    unanswered: `${base} bg-surface2 text-text-dim border-border`,
  };
  return (
    <button type="button" className={cls[status]} onClick={onClick}>
      {num}
    </button>
  );
}

interface SidebarProps {
  questions: Array<{ id: string }>;
  currentIndex: number;
  results: Record<string, ReviewResult>;
  answers: Record<string, string[]>;
  choiceAnswers: Record<string, string>;
  onSelect: (i: number) => void;
  onExit: () => void;
}

function Sidebar({
  questions,
  currentIndex,
  results,
  answers,
  choiceAnswers,
  onSelect,
  onExit,
}: SidebarProps) {
  return (
    <>
      <div className="p-4 border-b border-border">
        <p className="text-xs text-text-dim mb-1">复习进度</p>
        <p className="text-sm font-medium">
          {currentIndex + 1} / {questions.length}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-wrap gap-1.5">
          {questions.map((q, i) => {
            const r = results[q.id];
            const status: CellStatus =
              i === currentIndex
                ? 'current'
                : r === 'correct'
                  ? 'correct'
                  : r === 'wrong'
                    ? 'wrong'
                    : answers[q.id]?.some(a => a?.trim()) || choiceAnswers[q.id]
                      ? 'answered'
                      : 'unanswered';
            return (
              <ProgressCell key={q.id} status={status} num={i + 1} onClick={() => onSelect(i)} />
            );
          })}
        </div>
      </div>
      <div className="p-3 border-t border-border">
        <Button variant="ghost" size="sm" className="w-full" onClick={onExit}>
          结束复习
        </Button>
      </div>
    </>
  );
}

export default function ReviewSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const {
    getSession,
    setAnswer,
    setChoiceAnswer,
    submitAnswer,
    toggleBookmark,
    setIssueReport,
    completeSession,
  } = useReviewStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const session = sessionId ? getSession(sessionId) : null;

  if (!session) {
    navigate('/review');
    return null;
  }

  const { questions, answers, choiceAnswers, results, bookmarks, issueReports } = session;
  const q = questions[currentIndex];
  if (!q) return null;

  const qType: QuestionType = q.type || 'fill_blank';
  const blankCount = (q.question.match(/____/g) ?? []).length;
  const currentAnswers = answers[q.id] ?? [];
  const currentChoice = choiceAnswers[q.id];
  // Read persisted results directly from the store so refreshes retain state.
  const hasSubmitted = q.id in results;
  const submitResult = results[q.id];
  const filled = isAnswered(qType, blankCount, currentAnswers, currentChoice);

  const handleSubmit = () => {
    if (!sessionId || hasSubmitted) return;
    submitAnswer(sessionId, q.id);
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSidebarOpen(false);
    } else {
      if (sessionId) completeSession(sessionId);
      navigate(`/review/${sessionId}/summary`);
    }
  };

  const sidebarProps: SidebarProps = {
    questions,
    currentIndex,
    results,
    answers,
    choiceAnswers,
    onSelect: (i: number) => {
      setCurrentIndex(i);
      setSidebarOpen(false);
    },
    onExit: () => navigate('/review'),
  };

  return (
    <div
      className="h-[calc(100dvh_-_var(--tab-bar-h))] pt-14 flex flex-col overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      {/* Progress bar. */}
      <div className="flex-shrink-0 h-1 bg-surface2">
        <motion.div
          className="h-full bg-accent"
          animate={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Desktop sidebar. */}
        <aside className="flex-shrink-0 w-56 border-r border-border bg-surface/50 hidden md:flex flex-col">
          <Sidebar {...sidebarProps} />
        </aside>

        {/* Mobile sidebar drawer. */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed top-14 left-0 w-60 z-30 bg-surface border-r border-border flex flex-col"
              style={{ bottom: 'var(--tab-bar-h)' }}
            >
              <div className="flex items-center justify-between p-4 border-b border-border">
                <span className="text-sm font-medium">题目列表</span>
                <button onClick={() => setSidebarOpen(false)}>
                  <X size={18} className="text-text-dim" />
                </button>
              </div>
              <Sidebar {...sidebarProps} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main area. */}
        <main className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-6 max-w-2xl mx-auto w-full">
          {/* Mobile header. */}
          <div className="md:hidden flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center gap-1.5 text-text-dim hover:text-text"
            >
              <Menu size={18} />
              <span className="text-sm">
                {currentIndex + 1}/{questions.length}
              </span>
            </button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/review')}>
              结束复习
            </Button>
          </div>

          {/* Question card. */}
          <AnimatePresence mode="wait">
            <motion.div
              key={q.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <QuestionCard
                question={q}
                index={currentIndex}
                answers={currentAnswers}
                choiceAnswer={currentChoice}
                isBookmarked={bookmarks.includes(q.id)}
                issueReport={issueReports[q.id]}
                hasAnsweredAll={filled}
                blankCount={blankCount}
                totalQuestions={questions.length}
                defaultShowHint={false}
                onAnswerChange={(i, v) => {
                  if (!sessionId || hasSubmitted) return;
                  const arr = [...(answers[q.id] ?? [])];
                  arr[i] = v;
                  setAnswer(sessionId, q.id, arr);
                }}
                onChoiceChange={label => {
                  if (!sessionId || hasSubmitted) return;
                  setChoiceAnswer(sessionId, q.id, label);
                }}
                onSkip={handleNext}
                onBookmark={() => sessionId && toggleBookmark(sessionId, q.id)}
                onIssueReport={async reason => {
                  if (!sessionId) return;
                  const publishedRevision = q.publishedRevision ?? session.questionBankVersion;
                  if (!publishedRevision) {
                    throw new Error('这份旧复习记录缺少题库版本，请重新创建后反馈');
                  }
                  await submitQuestionReport({
                    questionId: q.id,
                    publishedRevision,
                    reason,
                    source: 'review',
                    sessionId,
                  });
                  setIssueReport(sessionId, q.id, reason);
                }}
                onNext={handleNext}
                onPrev={() => {
                  if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
                }}
              />
            </motion.div>
          </AnimatePresence>

          {/* Submit button and immediate feedback. */}
          <div className="flex flex-col gap-3">
            {!hasSubmitted ? (
              <Button
                variant="primary"
                disabled={!filled}
                onClick={handleSubmit}
                className="w-full"
              >
                提交答案
              </Button>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl p-4 border ${
                  submitResult === 'correct'
                    ? 'bg-green-500/10 border-green-500/30'
                    : 'bg-red-500/10 border-red-500/30'
                }`}
              >
                <div className="flex items-center gap-2 mb-3">
                  {submitResult === 'correct' ? (
                    <>
                      <CheckCircle2 size={18} className="text-green-400" />
                      <span className="font-medium text-green-400">回答正确</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={18} className="text-red-400" />
                      <span className="font-medium text-red-400">答错了</span>
                    </>
                  )}
                </div>
                {submitResult === 'wrong' && (
                  <div className="mb-3 text-sm">
                    <span className="text-text-dim">正确答案：</span>
                    <span className="text-text font-medium ml-1">
                      {q.correctChoice
                        ? `选项 ${q.correctChoice}（${q.choices?.find(c => c.label === q.correctChoice)?.content}）`
                        : q.blanks.join('，')}
                    </span>
                  </div>
                )}
                <p className="text-sm font-medium text-text mb-1">解析</p>
                <p className="text-sm text-text-dim leading-relaxed">{q.solution}</p>
                {q.common_mistake && (
                  <p className="mt-2 text-sm text-amber-400/80">常见错误：{q.common_mistake}</p>
                )}
              </motion.div>
            )}

            {hasSubmitted && (
              <div className="flex gap-3">
                {currentIndex > 0 && (
                  <Button
                    variant="secondary"
                    onClick={() => setCurrentIndex(currentIndex - 1)}
                    className="flex items-center gap-1"
                  >
                    <ChevronLeft size={15} /> 上一题
                  </Button>
                )}
                <Button
                  variant="primary"
                  onClick={handleNext}
                  className="flex-1 flex items-center justify-center gap-1"
                >
                  {currentIndex < questions.length - 1 ? '下一题' : '查看总结'}
                  <ChevronRight size={15} />
                </Button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
