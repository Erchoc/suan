import { useRef, useEffect, useCallback, useState } from 'react';
import { SkipForward, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Flag, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import type { Question, QuestionType } from '../../types';
import { stripLatex } from '../../utils/latex';

interface CustomKeyboardConfig {
  /** 是否启用自定义键盘（禁用原生 input） */
  enabled: boolean;
  /** 当前聚焦的空的索引（null = 无聚焦） */
  focusedBlankIndex: number | null;
  /** 点击某个空时通知外部 */
  onBlankFocus: (index: number) => void;
}

interface QuestionCardProps {
  question: Question;
  index: number;
  answers: string[];
  choiceAnswer?: string;
  isBookmarked: boolean;
  issueReport?: string;
  hasAnsweredAll: boolean;
  blankCount: number;
  totalQuestions: number;
  onAnswerChange: (blanksIndex: number, value: string) => void;
  onChoiceChange?: (label: string) => void;
  onIssueReport?: (reason: string) => void;
  onSkip: () => void;
  onBookmark: () => void;
  onNext: () => void;
  onPrev: () => void;
  defaultShowHint?: boolean;
  /** 是否允许显示解题提示入口（考试模式传 false） */
  allowHint?: boolean;
  /** 自定义键盘配置（移动端低年级专属） */
  customKeyboard?: CustomKeyboardConfig;
}

const difficultyLabel = { easy: '简单', medium: '中等', hard: '困难' };
const difficultyColor = { easy: '#10b981', medium: '#f59e0b', hard: '#ef4444' };
const typeLabel: Record<QuestionType, string> = { fill_blank: '填空', choice: '选择', mixed: '综合' };
const typeColor: Record<QuestionType, string> = { fill_blank: '#6366f1', choice: '#06b6d4', mixed: '#8b5cf6' };

function renderFillBlanks(
  text: string = '',
  answers: string[],
  onChange: (i: number, v: string) => void,
  firstInputRef: React.RefObject<HTMLInputElement | null>,
  customKeyboard?: CustomKeyboardConfig,
) {
  const parts = stripLatex(text).split('____');
  return (
    <span className="leading-loose text-lg font-serif text-text">
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            customKeyboard?.enabled ? (
              // 自定义键盘模式：固定高度 div，禁用系统键盘，点击唤起键盘
              <span
                role="button"
                tabIndex={0}
                onPointerDown={e => {
                  e.preventDefault();
                  customKeyboard.onBlankFocus(i);
                }}
                className="
                  inline-flex items-center justify-center
                  w-28 h-[34px] mx-1 px-2
                  rounded border-b-2 transition-all select-none
                  align-middle
                "
                style={{
                  background: 'var(--surface2)',
                  borderColor: customKeyboard.focusedBlankIndex === i
                    ? 'var(--accent)'
                    : 'var(--border)',
                  boxShadow: customKeyboard.focusedBlankIndex === i
                    ? '0 0 0 2px rgba(255,137,6,0.25)'
                    : 'none',
                  color: answers[i] ? 'var(--text)' : 'var(--text-dim)',
                  fontFamily: 'monospace',
                  fontSize: '1rem',
                }}
              >
                {answers[i] || (
                  <span style={{ opacity: 0.3, fontSize: '0.7rem' }}>
                    {customKeyboard.focusedBlankIndex === i ? '●' : '点击输入'}
                  </span>
                )}
              </span>
            ) : (
              // 普通模式：原生 input
              <input
                ref={i === 0 ? (firstInputRef as React.RefObject<HTMLInputElement>) : undefined}
                type="text"
                value={answers[i] ?? ''}
                onChange={(e) => onChange(i, e.target.value.replace(/\s/g, ''))}
                className="
                  inline-block w-28 mx-1 px-2 py-1
                  bg-surface2 border-b-2 border-accent
                  text-text text-center rounded
                  focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30
                  transition-all
                "
                placeholder=""
              />
            )
          )}
        </span>
      ))}
    </span>
  );
}

function ChoiceOptions({
  choices,
  selected,
  onChange,
}: {
  choices: Question['choices'];
  selected?: string;
  onChange: (label: string) => void;
}) {
  if (!choices || choices.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
      {choices.map(c => {
        const active = selected === c.label;
        return (
          <button
            key={c.label}
            onClick={() => onChange(c.label)}
            className={`
              flex items-start gap-3 p-4 rounded-xl text-left transition-all
              ${active
                ? 'bg-accent/15 border-accent ring-1 ring-accent/30'
                : 'bg-surface border-border hover:border-text-dim'
              }
              border
            `}
          >
            <span
              className={`
                flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold
                ${active ? 'bg-accent text-white' : 'bg-surface2 text-text-dim'}
                transition-all
              `}
            >
              {c.label}
            </span>
            <span className={`text-sm leading-relaxed ${active ? 'text-text' : 'text-text-dim'}`}>
              {stripLatex(c.content)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function QuestionCard({
  question,
  index,
  answers,
  choiceAnswer,
  isBookmarked,
  issueReport,
  hasAnsweredAll,
  blankCount,
  totalQuestions,
  onAnswerChange,
  onChoiceChange,
  onIssueReport,
  onSkip,
  onBookmark,
  onNext,
  onPrev,
  defaultShowHint = false,
  allowHint = true,
  customKeyboard,
}: QuestionCardProps) {
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const qType: QuestionType = question.type || 'fill_blank';
  const [showIssueInput, setShowIssueInput] = useState(false);
  const [issueText, setIssueText] = useState(issueReport ?? '');
  const [showHint, setShowHint] = useState(defaultShowHint);

  // 切题时重置异常面板状态
  useEffect(() => {
    setShowIssueInput(!!issueReport);
    setIssueText(issueReport ?? '');
  }, [question.id, issueReport]);

  // 切题时重置 hint 展开状态
  useEffect(() => {
    setShowHint(defaultShowHint);
  }, [question.id, defaultShowHint]);

  useEffect(() => {
    if (qType !== 'choice') {
      firstInputRef.current?.focus();
    }
  }, [question.id, qType]);

  // 键盘快捷键 A/B/C/D 选择
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (qType === 'fill_blank' || !onChoiceChange) return;
    const key = e.key.toUpperCase();
    if (['A', 'B', 'C', 'D'].includes(key) && question.choices?.some(c => c.label === key)) {
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        onChoiceChange(key);
      }
    }
  }, [qType, onChoiceChange, question.choices]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const filledCount = answers.filter(a => a?.trim()).length;
  const hasIssue = !!issueReport;

  return (
    <div className="flex flex-col gap-6">
      {/* 进度提示 */}
      <div className="flex items-center justify-between text-sm text-text-dim">
        <span>
          第 <span className="text-accent font-semibold">{index + 1}</span> / {totalQuestions} 题
          {qType === 'fill_blank' && blankCount > 1 && (
            <span className="ml-2 text-xs">
              （{filledCount}/{blankCount} 空已填）
            </span>
          )}
        </span>
        <span>{isBookmarked ? '★ 已收藏' : ''}</span>
      </div>

      {/* 题目元信息 */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge color={difficultyColor[question.difficulty]}>
          {difficultyLabel[question.difficulty]}
        </Badge>
        <Badge color={typeColor[qType]}>
          {typeLabel[qType]}
        </Badge>
        <Badge color="#7b2d8b">{question.kp_name}</Badge>
        <Badge color="#3b82f6">{question.grade}</Badge>
      </div>

      {/* 争议题目提示（enable=false） */}
      {question.enable === false && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 text-sm">
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
          <span>此题目存在争议，正在由平台核实。如有疑问，请按您的理解作答，或点击「跳过」。</span>
        </div>
      )}

      {/* 题目正文 */}
      <div className="bg-surface2 rounded-xl p-4 sm:p-6 min-h-24">
        {(qType === 'fill_blank' || qType === 'mixed') ? (
          <div className="flex items-center flex-wrap">
            {renderFillBlanks(question.question, answers, onAnswerChange, firstInputRef, customKeyboard)}
          </div>
        ) : (
          <p className="text-lg font-serif text-text leading-relaxed">{stripLatex(question.question)}</p>
        )}

        {(qType === 'choice' || qType === 'mixed') && (
          <ChoiceOptions
            choices={question.choices}
            selected={choiceAnswer}
            onChange={onChoiceChange ?? (() => {})}
          />
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Button
          variant="secondary"
          onClick={onPrev}
          disabled={index === 0}
          className="h-10"
        >
          <ChevronLeft size={16} />
          <span className="hidden sm:inline">上一题</span>
        </Button>

        <Button
          variant="primary"
          onClick={onNext}
          disabled={!hasAnsweredAll}
          title={hasAnsweredAll ? '进入下一题' : '请完成本题所有作答'}
          className="h-10"
        >
          {index < totalQuestions - 1 ? '下一题' : '提交'}
          <ChevronRight size={16} />
        </Button>

        <Button variant="ghost" onClick={onSkip}>
          <SkipForward size={15} />
          <span className="hidden sm:inline">跳过</span>
        </Button>

        <Button
          variant="ghost"
          onClick={onBookmark}
          className={isBookmarked ? 'text-amber-500' : 'text-text-dim'}
        >
          {isBookmarked ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
          <span className="hidden sm:inline">{isBookmarked ? '已收藏' : '收藏'}</span>
        </Button>

        <Button
          variant="ghost"
          onClick={() => setShowIssueInput(v => !v)}
          className={hasIssue ? 'text-red-500' : 'text-text-dim'}
        >
          <Flag size={15} />
          <span className="hidden sm:inline">{hasIssue ? '已标记异常' : '异常题目'}</span>
        </Button>
      </div>

      {/* 异常题目输入框 */}
      <AnimatePresence>
        {showIssueInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
              <p className="text-xs text-red-400 mb-2">我认为这个题目不太正常，原因是：</p>
              <textarea
                value={issueText}
                onChange={e => setIssueText(e.target.value)}
                onBlur={() => onIssueReport?.(issueText)}
                placeholder="例如：答案有误 / 题目表述不清 / 超出知识范围..."
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-dim/50 focus:outline-none focus:border-red-500/50 resize-none"
                rows={2}
              />
              {issueText.trim() && (
                <p className="text-xs text-green mt-2 leading-relaxed">
                  已记录，请先按您的理解继续答题。如后台核实为异常题目，我们将为您的账户提供更多福利额度。
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 提示 */}
      {!hasAnsweredAll && (
        <p className="text-xs text-text-dim">
          {qType === 'fill_blank' && blankCount > 0 && (
            <>提示：需全部填写后才能进入下一题，点击「跳过」可先做其他题</>
          )}
          {qType === 'choice' && (
            <>提示：请选择一个答案（可按键盘 A/B/C/D 快捷选择），或点击「跳过」</>
          )}
          {qType === 'mixed' && (
            <>提示：此题需要选择答案并填写所有空格，或点击「跳过」</>
          )}
        </p>
      )}

      {/* 解题提示（复习/预习模式显示，考试模式隐藏） */}
      {allowHint && question.hint && (
        <div>
          <button
            onClick={() => setShowHint(v => !v)}
            className="flex items-center gap-1.5 text-xs text-text-dim hover:text-text transition-colors"
          >
            <span>{showHint ? '▾' : '▸'}</span>
            解题提示
          </button>
          <AnimatePresence>
            {showHint && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-2 px-3 py-2 rounded-lg bg-surface2 text-sm text-text-dim border-l-2 border-accent/40">
                  {question.hint}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
