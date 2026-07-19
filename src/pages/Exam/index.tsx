import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Clock, Keyboard, Menu, Play, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CustomKeyboard from '../../components/CustomKeyboard/CustomKeyboard';
import QuestionCard from '../../components/QuestionCard/QuestionCard';
import Button from '../../components/ui/Button';
import { submitQuestionReport } from '../../data/questionReports';
import { useExamStore } from '../../stores/examStore';
import type { DifficultyLevel, QuestionType } from '../../types';

function formatTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type Status = 'unanswered' | 'answered' | 'skipped' | 'current';

function QuestionStatus({ status, num }: { status: Status; num: number }) {
  const base =
    'w-8 h-8 rounded-lg text-xs flex items-center justify-center font-mono transition-all border-2';
  const classes = {
    current: `${base} bg-accent text-white font-bold border-accent ring-2 ring-accent/30`,
    answered: `${base} bg-green-500/30 text-green-600 border-green-500`,
    skipped: `${base} bg-amber-400/30 text-amber-700 border-amber-500`,
    unanswered: `${base} bg-surface2 text-text-dim border-border`,
  };
  return <div className={classes[status]}>{num}</div>;
}

const difficultyLabelMap: Record<DifficultyLevel, string> = {
  basic: '基础模式',
  random: '随机模式',
  challenge: '困难模式',
};

function isQuestionAnswered(
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

export default function ExamPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const {
    getSession,
    setAnswer,
    setChoiceAnswer,
    setIssueReport,
    toggleBookmark,
    submitSession,
    startSession,
    saveQuestionIndex,
  } = useExamStore();
  const [currentIndex, setCurrentIndex] = useState(() => {
    const s = sessionId ? getSession(sessionId) : null;
    return s?.lastQuestionIndex ?? 0;
  });
  const [elapsed, setElapsed] = useState(0);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Custom keyboard state for every grade on mobile.
  const [isNarrowScreen, setIsNarrowScreen] = useState(() => window.innerWidth <= 1024);
  // focusedBlankIndex is null when closed, otherwise it identifies the focused blank.
  const [focusedBlankIndex, setFocusedBlankIndex] = useState<number | null>(null);

  useEffect(() => {
    const handler = () => setIsNarrowScreen(window.innerWidth <= 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const session = sessionId ? getSession(sessionId) : null;

  const timeLimitMs = session?.config.timeLimitMinutes
    ? session.config.timeLimitMinutes * 60 * 1000
    : 0;

  useEffect(() => {
    if (!session?.startedAt) return;
    const startedAt = session.startedAt;
    const updateElapsed = () => setElapsed(Date.now() - startedAt);
    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [session?.startedAt]);

  // Close the mobile sidebar and persist progress when changing questions.
  useEffect(() => {
    setSidebarOpen(false);
    if (sessionId) saveQuestionIndex(sessionId, currentIndex);
  }, [currentIndex, sessionId, saveQuestionIndex]);

  // Enable the custom keyboard for every grade on mobile.
  const gradeNum = session?.config.gradeNum ?? 0;
  const useCustomKeyboard = isNarrowScreen && gradeNum >= 1;

  // Focus the first blank automatically after changing questions.
  const currentQId = session?.questions[currentIndex]?.id ?? '';
  const currentQType: QuestionType = (session?.questions[currentIndex]?.type ??
    'fill_blank') as QuestionType;
  // biome-ignore lint/correctness/useExhaustiveDependencies: The question ID intentionally resets focus between same-type questions.
  useEffect(() => {
    if (!useCustomKeyboard) {
      setFocusedBlankIndex(null);
      return;
    }
    if (currentQType === 'fill_blank' || currentQType === 'mixed') {
      setFocusedBlankIndex(0);
    } else {
      setFocusedBlankIndex(null);
    }
  }, [currentQId, useCustomKeyboard, currentQType]);

  if (!session) {
    return (
      <div className="h-screen flex items-center justify-center flex-col gap-4">
        <AlertCircle size={48} className="text-red-500" />
        <p className="text-gray-500">找不到考试记录</p>
        <Button onClick={() => navigate('/assessment')}>返回配置</Button>
      </div>
    );
  }

  if (session.questions.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center flex-col gap-4">
        <AlertCircle size={48} className="text-red-500" />
        <p className="text-lg font-semibold">题库暂无题目</p>
        <p className="text-gray-500 text-sm">请先运行 pnpm run gen:questions 生成题目</p>
        <Button onClick={() => navigate('/assessment/exam')}>返回配置</Button>
      </div>
    );
  }

  // Start gate.
  if (!session.startedAt) {
    const cfg = session.config;
    return (
      <div className="h-screen pt-14 flex items-center justify-center bg-bg px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full"
        >
          <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-6">
              <Play size={28} className="text-accent ml-1" />
            </div>
            <h1 className="font-serif text-2xl font-semibold mb-2">准备好了吗？</h1>
            <p className="text-text-dim text-sm mb-6">点击下方按钮开始挑战</p>

            <div className="bg-surface2 rounded-xl p-4 mb-6 text-left">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-text-dim text-xs">题目数量</p>
                  <p className="font-medium">{session.questions.length} 题</p>
                </div>
                <div>
                  <p className="text-text-dim text-xs">考试时长</p>
                  <p className="font-medium">
                    {cfg.timeLimitMinutes === 0 ? '不限时' : `${cfg.timeLimitMinutes} 分钟`}
                  </p>
                </div>
                <div>
                  <p className="text-text-dim text-xs">难度模式</p>
                  <p className="font-medium">{difficultyLabelMap[cfg.difficulty]}</p>
                </div>
                <div>
                  <p className="text-text-dim text-xs">建议</p>
                  <p className="font-medium text-text-dim">遇到不会的可以跳过</p>
                </div>
              </div>
            </div>

            <Button
              variant="primary"
              size="lg"
              className="w-full text-lg py-3"
              onClick={() => startSession(sessionId!)}
            >
              开始挑战！
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Exam interface.
  const questions = session.questions;
  const currentQ = questions[currentIndex];
  const qType: QuestionType = currentQ.type || 'fill_blank';
  const answers = session.answers[currentQ.id] ?? [];
  const choiceAnswer = session.choiceAnswers?.[currentQ.id];
  const isBookmarked = session.bookmarks?.has(currentQ.id) ?? false;
  const issueReport = session.issueReports?.[currentQ.id];

  const blankCount = (currentQ.question.match(/____/g) || []).length;
  const hasAnsweredAll = isQuestionAnswered(qType, blankCount, answers, choiceAnswer);

  // Custom keyboard handlers remain plain functions because they follow the early return.
  const handleKbInput = (char: string) => {
    if (focusedBlankIndex === null) return;
    const current = session.answers[currentQ.id]?.[focusedBlankIndex] ?? '';
    const newAnswers = [...(session.answers[currentQ.id] ?? [])];
    newAnswers[focusedBlankIndex] = current + char;
    setAnswer(sessionId!, currentQ.id, newAnswers);
  };

  const handleKbBackspace = () => {
    if (focusedBlankIndex === null) return;
    const current = session.answers[currentQ.id]?.[focusedBlankIndex] ?? '';
    const newAnswers = [...(session.answers[currentQ.id] ?? [])];
    newAnswers[focusedBlankIndex] = current.slice(0, -1);
    setAnswer(sessionId!, currentQ.id, newAnswers);
  };

  const handleKbNext = () => {
    if (focusedBlankIndex === null) return;
    const next = focusedBlankIndex + 1;
    if (next < blankCount) {
      setFocusedBlankIndex(next);
    } else {
      setFocusedBlankIndex(null);
    }
  };

  const answeredCount = questions.filter(q => {
    const qt: QuestionType = q.type || 'fill_blank';
    const bc = (q.question.match(/____/g) || []).length;
    const ans = session.answers[q.id] ?? [];
    const ca = session.choiceAnswers?.[q.id];
    return isQuestionAnswered(qt, bc, ans, ca);
  }).length;

  const bookmarkedCount = session.bookmarks?.size ?? 0;

  const remaining = timeLimitMs > 0 ? Math.max(0, timeLimitMs - elapsed) : 0;
  const showTimer = timeLimitMs > 0;

  const getStatus = (idx: number): Status => {
    const q = questions[idx];
    const isCurrent = idx === currentIndex;
    const qt: QuestionType = q.type || 'fill_blank';
    const bc = (q.question.match(/____/g) || []).length;
    const ans = session.answers[q.id] ?? [];
    const ca = session.choiceAnswers?.[q.id];
    const qAnswered = isQuestionAnswered(qt, bc, ans, ca);
    const qSkipped = skipped.has(q.id);

    if (isCurrent) return 'current';
    if (qAnswered) return 'answered';
    if (qSkipped) return 'skipped';
    return 'unanswered';
  };

  const handleAnswerChange = (blankIndex: number, value: string) => {
    const newAnswers = [...(session.answers[currentQ.id] ?? [])];
    newAnswers[blankIndex] = value;
    setAnswer(sessionId!, currentQ.id, newAnswers);
  };

  const handleChoiceChange = (label: string) => {
    setChoiceAnswer(sessionId!, currentQ.id, label);
  };

  const handleIssueReport = async (reason: string) => {
    const publishedRevision = currentQ.publishedRevision ?? session.questionBankVersion;
    if (!publishedRevision) throw new Error('这份旧试卷缺少题库版本，请重新生成后反馈');
    await submitQuestionReport({
      questionId: currentQ.id,
      publishedRevision,
      reason,
      source: 'exam',
      sessionId: sessionId!,
    });
    setIssueReport(sessionId!, currentQ.id, reason);
  };

  const handleSkip = () => {
    setSkipped(prev => new Set([...prev, currentQ.id]));
    if (currentIndex < questions.length - 1) setCurrentIndex(i => i + 1);
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) setCurrentIndex(i => i + 1);
    else setShowSubmitConfirm(true);
  };

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  };

  const handleBookmark = () => toggleBookmark(sessionId!, currentQ.id);

  const handleSubmit = () => {
    submitSession(sessionId!);
    navigate(`/report/${sessionId}`);
  };

  // Sidebar content shared by desktop and mobile.
  const sidebarContent = (
    <>
      <div className="p-4 border-b border-border">
        {showTimer ? (
          <div
            className={`flex items-center gap-2 text-sm mb-3 ${remaining < 600000 ? 'text-red-500' : 'text-text-dim'}`}
          >
            <Clock size={14} />
            <span className="font-medium">剩余时间：{formatTime(remaining)}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm mb-3 text-text-dim">
            <Clock size={14} />
            <span className="font-medium">已用时：{formatTime(elapsed)}</span>
          </div>
        )}
        <div className="h-2 bg-surface2 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-300"
            style={{ width: `${(answeredCount / questions.length) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-text-dim mt-2">
          <span>
            已答 {answeredCount}/{questions.length}
          </span>
          <span>收藏 {bookmarkedCount}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-5 gap-2">
          {questions.map((q, i) => (
            <button key={q.id} onClick={() => setCurrentIndex(i)} title={`第${i + 1}题`}>
              <QuestionStatus status={getStatus(i)} num={i + 1} />
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 border-t border-border">
        <Button
          variant="danger"
          size="sm"
          className="w-full"
          onClick={() => setShowSubmitConfirm(true)}
        >
          提交试卷
        </Button>
      </div>
    </>
  );

  return (
    <div className="h-[calc(100dvh_-_var(--tab-bar-h))] pt-14 flex overflow-hidden bg-bg">
      {/* Desktop sidebar. */}
      <aside className="hidden md:flex w-72 flex-shrink-0 bg-surface border-r border-border flex-col">
        {sidebarContent}
      </aside>

      {/* Mobile backdrop and sidebar. */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed top-14 inset-x-0 bg-black/50 z-40 md:hidden"
              style={{ bottom: 'var(--tab-bar-h)' }}
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -288 }}
              animate={{ x: 0 }}
              exit={{ x: -288 }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="fixed left-0 top-14 w-72 bg-surface border-r border-border flex flex-col z-50 md:hidden"
              style={{ bottom: 'var(--tab-bar-h)' }}
            >
              <div className="flex items-center justify-between px-4 pt-3 pb-0">
                <span className="text-sm font-medium">题目列表</span>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-1 text-text-dim hover:text-text"
                >
                  <X size={18} />
                </button>
              </div>
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main exam area. */}
      <main className="flex-1 overflow-y-auto bg-bg">
        {/* Mobile header with menu and compact progress. */}
        <div className="flex md:hidden items-center gap-3 px-4 py-2 border-b border-border bg-surface sticky top-0 z-[45]">
          <button
            onClick={() => {
              setFocusedBlankIndex(null);
              setSidebarOpen(true);
            }}
            className="p-1.5 rounded-lg bg-surface2 text-text-dim hover:text-text"
          >
            <Menu size={18} />
          </button>
          <div className="flex-1">
            <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{ width: `${(answeredCount / questions.length) * 100}%` }}
              />
            </div>
          </div>
          <span className="text-xs text-text-dim whitespace-nowrap">
            {answeredCount}/{questions.length}
          </span>
          {showTimer && (
            <span
              className={`text-xs whitespace-nowrap ${remaining < 600000 ? 'text-red-500' : 'text-text-dim'}`}
            >
              {formatTime(remaining)}
            </span>
          )}
        </div>

        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
          <motion.div
            key={currentQ.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <QuestionCard
              question={currentQ}
              index={currentIndex}
              answers={answers}
              choiceAnswer={choiceAnswer}
              isBookmarked={isBookmarked}
              issueReport={issueReport}
              hasAnsweredAll={hasAnsweredAll}
              blankCount={blankCount}
              onAnswerChange={handleAnswerChange}
              onChoiceChange={handleChoiceChange}
              onIssueReport={handleIssueReport}
              onSkip={handleSkip}
              onBookmark={handleBookmark}
              onNext={handleNext}
              onPrev={handlePrev}
              totalQuestions={questions.length}
              allowHint={false}
              customKeyboard={
                useCustomKeyboard
                  ? {
                      enabled: true,
                      focusedBlankIndex,
                      onBlankFocus: setFocusedBlankIndex,
                    }
                  : undefined
              }
            />
          </motion.div>
        </div>
      </main>

      {/* Custom keyboard on mobile. */}
      {useCustomKeyboard && (
        <>
          {/* Floating keyboard button shown while the keyboard is closed. */}
          {focusedBlankIndex === null && blankCount > 0 && (
            <button
              onPointerDown={e => {
                e.preventDefault();
                setFocusedBlankIndex(0);
              }}
              className="
                fixed right-4 z-40
                w-12 h-12 rounded-full shadow-lg
                flex items-center justify-center
                bg-accent text-white
                active:scale-95 transition-transform
              "
              style={{ bottom: 'calc(var(--tab-bar-h) + 1.5rem)' }}
              aria-label="打开键盘"
              title="打开数字键盘"
            >
              <Keyboard size={20} />
            </button>
          )}

          <CustomKeyboard
            visible={focusedBlankIndex !== null}
            mode="number"
            currentValue={focusedBlankIndex !== null ? (answers[focusedBlankIndex] ?? '') : ''}
            isLast={focusedBlankIndex !== null && focusedBlankIndex >= blankCount - 1}
            blankIndex={focusedBlankIndex ?? 0}
            totalBlanks={blankCount}
            onInput={handleKbInput}
            onBackspace={handleKbBackspace}
            onNext={handleKbNext}
            onClose={() => setFocusedBlankIndex(null)}
          />
        </>
      )}

      {/* Submission confirmation dialog. */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 sm:p-6">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-surface border border-border rounded-2xl p-6 max-w-md w-full"
          >
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle2 size={24} className="text-green-500" />
              <h3 className="font-semibold text-lg">确认提交？</h3>
            </div>
            <p className="text-text-dim text-sm mb-2">
              已完成 <strong className="text-text">{answeredCount}</strong> 道题， 未答{' '}
              <strong className="text-text">{questions.length - answeredCount}</strong> 道。
            </p>
            <p className="text-text-dim text-sm mb-6">提交后将生成诊断报告。</p>
            <div className="flex gap-3">
              <Button variant="primary" onClick={handleSubmit}>
                确认提交
              </Button>
              <Button variant="secondary" onClick={() => setShowSubmitConfirm(false)}>
                继续作答
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
