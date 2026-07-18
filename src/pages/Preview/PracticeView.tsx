// src/pages/Preview/PracticeView.tsx

import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreviewStore } from '../../stores/previewStore';
import type { Question } from '../../types';

// Lightweight question renderer for preview mode.
interface PreviewQuestionItemProps {
  question: Question;
  answers: string[];
  choiceAnswer?: string;
  submitted: boolean;
  result?: 'correct' | 'wrong';
  onAnswerChange: (index: number, value: string) => void;
  onChoiceChange: (label: string) => void;
  onSubmit: () => void;
}

function PreviewQuestionItem({
  question,
  answers,
  choiceAnswer,
  submitted,
  result,
  onAnswerChange,
  onChoiceChange,
  onSubmit,
}: PreviewQuestionItemProps) {
  const qType = question.type ?? 'fill_blank';

  const renderFillBlanks = () => {
    const parts = question.question.split('____');
    return (
      <p className="text-text text-base leading-loose font-serif">
        {parts.map((part, i) => (
          <span key={i}>
            {part}
            {i < parts.length - 1 && (
              <input
                type="text"
                value={answers[i] ?? ''}
                onChange={e => onAnswerChange(i, e.target.value.replace(/\s/g, ''))}
                disabled={submitted}
                className="inline-block w-24 mx-1 px-2 py-0.5 bg-surface2 border-b-2 border-accent text-text text-center rounded focus:outline-none focus:ring-1 focus:ring-accent/30 disabled:opacity-60"
              />
            )}
          </span>
        ))}
      </p>
    );
  };

  const renderChoices = () => (
    <div className="grid grid-cols-2 gap-2 mt-3">
      {(question.choices ?? []).map(c => (
        <button
          key={c.label}
          onClick={() => !submitted && onChoiceChange(c.label)}
          disabled={submitted}
          className={`p-3 rounded-xl border text-sm text-left transition-colors ${
            choiceAnswer === c.label
              ? submitted
                ? result === 'correct'
                  ? 'border-green bg-green/10 text-green'
                  : 'border-accent2 bg-accent2/10 text-accent2'
                : 'border-accent bg-accent/10 text-accent'
              : submitted && question.correctChoice === c.label
                ? 'border-green bg-green/10 text-green'
                : 'border-border hover:border-accent/40'
          }`}
        >
          <span className="font-bold mr-2">{c.label}.</span>
          {c.content}
        </button>
      ))}
    </div>
  );

  const hasAnsweredAll = (() => {
    if (qType === 'fill_blank')
      return answers.every(a => a.trim() !== '') && answers.length === question.blanks.length;
    if (qType === 'choice') return !!choiceAnswer;
    return (
      !!choiceAnswer &&
      answers.every(a => a.trim() !== '') &&
      answers.length === question.blanks.length
    );
  })();

  return (
    <div className="bg-surface rounded-xl border border-border p-4 space-y-3">
      {/* Question content. */}
      <div>
        {(qType === 'fill_blank' || qType === 'mixed') && renderFillBlanks()}
        {qType === 'choice' && (
          <p className="text-text text-base leading-relaxed">{question.question}</p>
        )}
        {(qType === 'choice' || qType === 'mixed') && renderChoices()}
      </div>

      {/* Hint, expanded by default. */}
      {question.hint && (
        <p className="text-xs text-text-dim border-l-2 border-accent/40 pl-2">{question.hint}</p>
      )}

      {/* Submit button. */}
      {!submitted && (
        <button
          onClick={onSubmit}
          disabled={!hasAnsweredAll}
          className="w-full py-2 bg-accent text-bg rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-40 transition-colors"
        >
          提交答案
        </button>
      )}

      {/* Result feedback. */}
      {submitted && (
        <div
          className={`text-sm font-medium ${result === 'correct' ? 'text-green' : 'text-accent2'}`}
        >
          {result === 'correct' ? '✓ 回答正确！' : '✗ 回答有误'}
        </div>
      )}

      {/* Show the explanation after an incorrect answer. */}
      {submitted && result === 'wrong' && (
        <div className="p-3 bg-surface2 rounded-lg border border-border text-sm text-text-dim">
          <p className="font-medium text-text mb-1">解题过程：</p>
          <p>{question.solution}</p>
          {question.common_mistake && (
            <p className="mt-1 text-accent2 text-xs">⚠ 常见错误：{question.common_mistake}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PracticeView ─────────────────────────────────────────────────────────────
interface PracticeViewProps {
  sessionId: string;
  questions: Question[];
  isJunior: boolean;
  onComplete: () => void;
}

export default function PracticeView({
  sessionId,
  questions,
  isJunior,
  onComplete,
}: PracticeViewProps) {
  const { setAnswer, setChoiceAnswer, submitAnswer } = usePreviewStore();
  const session = usePreviewStore(s => s.getSession(sessionId));
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(currentIndex);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());

  const handleSubmit = useCallback(
    (q: Question) => {
      if (submittedIds.has(q.id)) return;
      submitAnswer(sessionId, q.id);
      setSubmittedIds(prev => new Set([...prev, q.id]));

      if (isJunior) {
        setTimeout(() => {
          const latestIndex = currentIndexRef.current;
          if (latestIndex < questions.length - 1) {
            setCurrentIndex(latestIndex + 1);
          } else {
            onComplete();
          }
        }, 1200);
      }
    },
    [submittedIds, sessionId, isJunior, questions.length, submitAnswer, onComplete],
  );

  // Fallback when no questions are available.
  if (questions.length === 0) {
    return (
      <div className="bg-surface rounded-2xl border border-border p-6 text-center space-y-4">
        <p className="text-3xl">📝</p>
        <p className="text-text-dim text-sm">暂时没有配套练习题，内容还在生成中。</p>
        <button
          onClick={onComplete}
          className="px-6 py-2 bg-accent text-bg rounded-xl font-medium hover:bg-accent/90 transition-colors"
        >
          继续 →
        </button>
      </div>
    );
  }

  const current = questions[currentIndex];
  const allDone = questions.every(q => submittedIds.has(q.id));

  // Grades 4-6 use a list layout.
  if (!isJunior) {
    return (
      <div className="space-y-4">
        {questions.map((q, idx) => (
          <div key={q.id}>
            <p className="text-xs text-text-dim mb-1">第 {idx + 1} 题</p>
            <PreviewQuestionItem
              question={q}
              answers={session?.answers[q.id] ?? Array(q.blanks.length).fill('')}
              choiceAnswer={session?.choiceAnswers[q.id]}
              submitted={submittedIds.has(q.id)}
              result={session?.results[q.id]}
              onAnswerChange={(i, v) => {
                const curr = session?.answers[q.id] ?? Array(q.blanks.length).fill('');
                const next = [...curr];
                next[i] = v;
                setAnswer(sessionId, q.id, next);
              }}
              onChoiceChange={label => setChoiceAnswer(sessionId, q.id, label)}
              onSubmit={() => handleSubmit(q)}
            />
          </div>
        ))}
        <button
          onClick={onComplete}
          disabled={!allDone}
          className="w-full py-3 bg-accent text-bg rounded-xl font-medium hover:bg-accent/90 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
        >
          <CheckCircle size={16} />
          完成练习
        </button>
      </div>
    );
  }

  // Grades 1-3 show one question per page.
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-text-dim">
        <span>
          练习 {currentIndex + 1} / {questions.length}
        </span>
        <div className="flex gap-1">
          {questions.map((q, i) => (
            <div
              key={q.id}
              className={`w-2 h-2 rounded-full ${
                session?.results[q.id] === 'correct'
                  ? 'bg-green'
                  : session?.results[q.id] === 'wrong'
                    ? 'bg-accent2'
                    : i === currentIndex
                      ? 'bg-accent'
                      : 'bg-border'
              }`}
            />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          <PreviewQuestionItem
            question={current}
            answers={session?.answers[current.id] ?? Array(current.blanks.length).fill('')}
            choiceAnswer={session?.choiceAnswers[current.id]}
            submitted={submittedIds.has(current.id)}
            result={session?.results[current.id]}
            onAnswerChange={(i, v) => {
              const curr = session?.answers[current.id] ?? Array(current.blanks.length).fill('');
              const next = [...curr];
              next[i] = v;
              setAnswer(sessionId, current.id, next);
            }}
            onChoiceChange={label => setChoiceAnswer(sessionId, current.id, label)}
            onSubmit={() => handleSubmit(current)}
          />
        </motion.div>
      </AnimatePresence>

      {/* Manual navigation shown after submission. */}
      {submittedIds.has(current.id) && !isJunior && (
        <div className="flex gap-3">
          {currentIndex > 0 && (
            <button
              onClick={() => setCurrentIndex(i => i - 1)}
              className="flex items-center gap-1 px-4 py-2 border border-border rounded-xl text-text-dim text-sm hover:border-accent/40 transition-colors"
            >
              <ChevronLeft size={14} /> 上一题
            </button>
          )}
          <button
            onClick={() =>
              currentIndex < questions.length - 1 ? setCurrentIndex(i => i + 1) : onComplete()
            }
            className="flex-1 px-4 py-2 bg-accent text-bg rounded-xl text-sm font-medium hover:bg-accent/90 transition-colors flex items-center justify-center gap-1"
          >
            {currentIndex < questions.length - 1 ? '下一题' : '完成练习'}
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
