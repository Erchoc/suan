import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, BookOpen, CheckCircle2, XCircle, Lightbulb, Hash } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import type { Question, QuestionType } from '../../types';
import { stripLatex } from '../../utils/latex';

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const difficultyLabel = { easy: '简单', medium: '中等', hard: '困难' };
const difficultyColor = { easy: '#10b981', medium: '#f59e0b', hard: '#ef4444' };
const typeLabel: Record<QuestionType, string> = { fill_blank: '填空', choice: '选择', mixed: '综合' };
const typeColor: Record<QuestionType, string> = { fill_blank: '#6366f1', choice: '#06b6d4', mixed: '#8b5cf6' };

// ─── 填空题正文：复用考试输入框样式，只读展示 ────────────────────────────────

function ReadonlyFillBlanks({ question, userBlanks }: { question: Question; userBlanks?: string[] }) {
  const parts = stripLatex(question.question).split('____');
  return (
    <span className="leading-loose text-lg font-serif text-text">
      {parts.map((part, i) => {
        const correctAns = (question.blanks[i] ?? '').trim();
        const userAns = (userBlanks?.[i] ?? '').trim();
        const hasUser = userAns !== '';
        const isRight = hasUser && userAns === correctAns;
        const isWrong = hasUser && !isRight;

        return (
          <span key={i}>
            {part}
            {i < parts.length - 1 && (
              <span className="inline-flex flex-col items-center mx-1 gap-0.5 align-middle">
                {/* 输入框（只读，颜色表示对错） */}
                <span
                  className="inline-flex items-center justify-center w-28 h-[34px] px-2 rounded border-b-2 font-mono text-base text-center transition-all"
                  style={{
                    background: isRight
                      ? 'rgba(16,185,129,0.10)'
                      : isWrong
                        ? 'rgba(239,68,68,0.10)'
                        : 'var(--surface2)',
                    borderColor: isRight
                      ? '#10b981'
                      : isWrong
                        ? '#ef4444'
                        : 'var(--accent)',
                    color: isRight
                      ? '#10b981'
                      : isWrong
                        ? '#ef4444'
                        : 'var(--text-dim)',
                    fontSize: '1rem',
                  }}
                >
                  {hasUser
                    ? userAns
                    : <span style={{ opacity: 0.3, fontSize: '0.7rem' }}>未填</span>
                  }
                </span>
                {/* 正确答案提示（仅填错时显示在框下方） */}
                {isWrong && (
                  <span
                    className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-mono font-semibold"
                    style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}
                  >
                    <CheckCircle2 size={10} />
                    {correctAns}
                  </span>
                )}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

// ─── 选择题选项 ───────────────────────────────────────────────────────────────
// 三种模式：
//   interactive=true, userChoice 无值 → 可点击，考试同款悬停效果
//   userChoice 有值，revealed=false   → 黄色高亮用户所选，不展示对错
//   userChoice 有值，revealed=true    → 黄色高亮用户所选 + 对错标签 + 绿色高亮正确答案

// revealed=true 时展示对错标签（有用户作答记录）；正确答案始终绿色高亮
function ReadonlyChoices({
  question,
  userChoice,
  revealed = false,
}: {
  question: Question;
  userChoice?: string;
  revealed?: boolean;
}) {
  if (!question.choices || question.choices.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
      {question.choices.map(c => {
        const isCorrect = c.label === question.correctChoice;
        const isUserChoice = c.label === userChoice;
        const isUserRight = isUserChoice && isCorrect;
        const isUserWrong = isUserChoice && !isCorrect;
        // 正确但未被用户选中（或根本没有用户作答）→ 绿色
        const showAsCorrect = isCorrect && !isUserChoice;

        // 容器样式
        let containerCls = 'bg-surface border border-border';
        let containerStyle: React.CSSProperties = {};
        if (isUserChoice) {
          containerCls = 'bg-accent/15 border-accent ring-1 ring-accent/30';
        } else if (showAsCorrect) {
          containerCls = 'border';
          containerStyle = {
            background: 'rgba(42, 157, 143, 0.15)',
            borderColor: 'var(--green)',
            boxShadow: '0 0 0 1px rgba(42, 157, 143, 0.3)',
          };
        }

        // 圆圈样式
        let circleCls = 'bg-surface2 text-text-dim';
        let circleStyle: React.CSSProperties = {};
        if (isUserChoice) {
          circleCls = 'bg-accent text-white';
        } else if (showAsCorrect) {
          circleCls = 'text-white';
          circleStyle = { background: 'var(--green)' };
        }

        const textCls = (isUserChoice || showAsCorrect) ? 'text-text font-medium' : 'text-text-dim';

        let tag: React.ReactNode = null;
        if (revealed) {
          if (isUserRight) {
            tag = <span className="flex items-center gap-0.5 text-xs font-medium mt-1" style={{ color: 'var(--green)' }}><CheckCircle2 size={11} />你答对了</span>;
          } else if (isUserWrong) {
            tag = <span className="flex items-center gap-0.5 text-xs text-red-400 font-medium mt-1"><XCircle size={11} />你选错了</span>;
          } else if (showAsCorrect) {
            tag = <span className="flex items-center gap-0.5 text-xs font-medium mt-1" style={{ color: 'var(--green)' }}><CheckCircle2 size={11} />正确答案</span>;
          }
        }

        return (
          <div
            key={c.label}
            className={`flex items-start gap-3 p-4 rounded-xl transition-all ${containerCls}`}
            style={containerStyle}
          >
            <span
              className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-all ${circleCls}`}
              style={circleStyle}
            >
              {c.label}
            </span>
            <div className="flex flex-col flex-1 min-w-0">
              <span className={`text-sm leading-relaxed ${textCls}`}>{stripLatex(c.content)}</span>
              {tag}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── 信息块 ───────────────────────────────────────────────────────────────────

function InfoBlock({ icon, label, children }: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface2 rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs text-text-dim mb-2">
        {icon}
        <span className="font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-sm text-text leading-relaxed">{children}</div>
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────

export default function QuestionDetailPage() {
  const { questionId } = useParams<{ questionId: string }>();
  const [searchParams] = useSearchParams();
  const [question, setQuestion] = useState<Question | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  // 从 URL 读取用户作答：ua = 选择题选项，ub = 填空答案（逗号分隔）
  const userChoice = searchParams.get('ua') ?? undefined;
  const userBlanks: string[] | undefined = searchParams.has('ub')
    ? searchParams.get('ub')!.split(',')
    : undefined;

  useEffect(() => {
    if (!questionId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    fetch('/questions.json')
      .then(r => r.json())
      .then((data: Question[]) => {
        const found = data.find(q => q.id === questionId);
        if (found) setQuestion(found);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [questionId]);

  if (loading) {
    return (
      <div className="pt-14 min-h-screen flex items-center justify-center text-text-dim text-sm">
        加载中…
      </div>
    );
  }

  if (notFound || !question) {
    return (
      <div className="pt-14 min-h-screen flex flex-col items-center justify-center gap-3">
        <XCircle size={40} className="text-red-500" />
        <p className="text-text font-medium">
          {questionId ? `找不到题目 ${questionId}` : '请在 URL 中指定题目 ID'}
        </p>
      </div>
    );
  }

  const qType: QuestionType = question.type || 'fill_blank';
  const hasUrlUserData = !!userChoice || (userBlanks && userBlanks.length > 0);

  return (
    <div className="pt-14 min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* 争议提示 */}
        {question.enable === false && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 text-sm mb-6">
            <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
            <div>
              <p>此题目存在争议，正在由平台核实，仅供参考。</p>
              {question.checkMessage && (
                <p className="mt-1 text-amber-300/80">平台标注原因：{question.checkMessage}</p>
              )}
            </div>
          </div>
        )}

        {/* 题目 ID */}
        <div className="flex items-center gap-1.5 text-xs text-text-dim mb-4 font-mono">
          <Hash size={12} />
          {question.id}
        </div>

        {/* 元信息徽章 */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <Badge color={difficultyColor[question.difficulty]}>
            {difficultyLabel[question.difficulty]}
          </Badge>
          <Badge color={typeColor[qType]}>
            {typeLabel[qType]}
          </Badge>
          <Badge color="#7b2d8b">{question.kp_name}</Badge>
          <Badge color="#3b82f6">{question.grade}</Badge>
          {question.semester && (
            <Badge color="#64748b">{question.semester}</Badge>
          )}
          {question.enable === false && (
            <Badge color="#ef4444">已禁用</Badge>
          )}
          {hasUrlUserData && (
            <Badge color="#6366f1">含作答记录</Badge>
          )}
        </div>

        {/* 题目正文 + 选项 */}
        <div className="bg-surface2 rounded-xl p-5 sm:p-6 mb-6">
          {(qType === 'fill_blank' || qType === 'mixed') ? (
            <div className="flex items-start flex-wrap">
              <ReadonlyFillBlanks question={question} userBlanks={userBlanks} />
            </div>
          ) : (
            <p className="text-lg font-serif text-text leading-relaxed">{stripLatex(question.question)}</p>
          )}
          {(qType === 'choice' || qType === 'mixed') && (
            <ReadonlyChoices
              question={question}
              userChoice={userChoice}
              revealed={hasUrlUserData}
            />
          )}
        </div>

        {/* 解析区（始终显示） */}
        <div className="flex flex-col gap-3">
          {question.solution && (
            <InfoBlock icon={<BookOpen size={12} />} label="解题过程">
              {stripLatex(question.solution)}
            </InfoBlock>
          )}
          {question.common_mistake && (
            <InfoBlock icon={<XCircle size={12} />} label="常见错误">
              <span className="text-red-400">{stripLatex(question.common_mistake)}</span>
            </InfoBlock>
          )}
          {question.hint && (
            <InfoBlock icon={<Lightbulb size={12} />} label="解题提示">
              <span className="text-text-dim">{stripLatex(question.hint)}</span>
            </InfoBlock>
          )}
        </div>

      </div>
    </div>
  );
}
