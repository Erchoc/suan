import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  List,
  RotateCcw,
  Route,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { getFullDepsChain, kpMap } from '../../data/kpIndex';
import { useExamStore } from '../../stores/examStore';
import { useReportStore } from '../../stores/reportStore';
import type { ExamSession, KPStat, Question, QuestionType } from '../../types';
import { stripLatex } from '../../utils/latex';

const TABS = [
  { id: 'detail', label: '答题详情', Icon: List },
  { id: 'weak', label: '薄弱知识点', Icon: AlertTriangle },
  { id: 'path', label: '学习路径建议', Icon: Route },
];

function formatDuration(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}小时${m}分钟`;
  return `${m}分钟`;
}

const renderSolution = stripLatex;

/** Calculates a percentage score with equal question weights and partial credit per blank. */
function calcScore(session: ExamSession): number {
  const questions: Question[] = session.questions ?? [];
  if (questions.length === 0) return 0;
  const pointsPerQ = 100 / questions.length;
  let total = 0;
  questions.forEach(q => {
    const qType: QuestionType = q.type || 'fill_blank';
    const userAnswers: string[] = session.answers?.[q.id] ?? [];
    const choiceAnswer: string | undefined = session.choiceAnswers?.[q.id];
    if (qType === 'fill_blank') {
      const blanks = q.blanks.length || 1;
      const correct = userAnswers.filter((a, i) => a.trim() === (q.blanks[i] ?? '').trim()).length;
      total += (correct / blanks) * pointsPerQ;
    } else if (qType === 'choice') {
      if (choiceAnswer === q.correctChoice) total += pointsPerQ;
    } else {
      const half = pointsPerQ / 2;
      if (choiceAnswer === q.correctChoice) total += half;
      const blanks = q.blanks.length || 1;
      const correct = userAnswers.filter((a, i) => a.trim() === (q.blanks[i] ?? '').trim()).length;
      total += (correct / blanks) * half;
    }
  });
  return Math.round(total * 10) / 10;
}

function ScoreCircle({ score }: { score: number }) {
  const radius = 52;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - Math.min(score / 100, 1));
  const color =
    score >= 90 ? '#10b981' : score >= 75 ? '#f59e0b' : score >= 60 ? '#f97316' : '#ef4444';
  const label = score >= 90 ? '优秀' : score >= 75 ? '良好' : score >= 60 ? '及格' : '继续加油';
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-32 h-32">
        <svg
          width="128"
          height="128"
          viewBox="0 0 128 128"
          role="img"
          aria-label={`得分 ${score} 分`}
        >
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke="var(--surface2)"
            strokeWidth="10"
          />
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            transform="rotate(-90 64 64)"
            style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold leading-none" style={{ color }}>
            {score}
          </span>
          <span className="text-xs text-text-dim mt-0.5">分</span>
        </div>
      </div>
      <span className="text-sm font-semibold" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

function WeakKPRow({
  stat,
  examGradeNum,
  examSemester,
}: {
  stat: KPStat;
  examGradeNum: number;
  examSemester: '上' | '下';
}) {
  const [expanded, setExpanded] = useState(false);
  // Trace content up to one year before the exam grade and semester.
  const minGrade = examSemester === '下' ? examGradeNum - 1 : examGradeNum - 1;
  const allDeps = getFullDepsChain(stat.kpId);
  const deps = allDeps.filter(d => d.gradeNum >= minGrade);
  const errorCount = stat.total - stat.correct;
  const isAllWrong = stat.correct === 0;

  // Distinguish fully incorrect from partially correct answers.
  const reasonText = isAllWrong
    ? `出了 ${stat.total} 道题，全错`
    : `出了 ${stat.total} 道题，答错 ${errorCount} 道`;

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-medium">{stat.kpName}</span>
            <Badge color="#a7a9be">{stat.grade}</Badge>
          </div>
          {/* Plain-language summary. */}
          <p
            className="text-sm font-medium mb-1.5"
            style={{ color: isAllWrong ? '#e63946' : '#f4a261' }}
          >
            {isAllWrong ? '⚠️ ' : '📌 '}
            {reasonText}
          </p>
          {/* Progress bar. */}
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5">
              {Array.from({ length: stat.total }).map((_, i) => (
                <div
                  key={i}
                  className="w-4 h-4 rounded-sm text-xs flex items-center justify-center font-bold"
                  style={{
                    background:
                      i < errorCount ? `${isAllWrong ? '#e63946' : '#f4a261'}33` : '#10b98120',
                    color: i < errorCount ? (isAllWrong ? '#e63946' : '#f4a261') : '#10b981',
                    fontSize: '9px',
                  }}
                >
                  {i < errorCount ? '✗' : '✓'}
                </div>
              ))}
            </div>
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
              {(stat.errorRate * 100).toFixed(0)}% 错误率
            </span>
          </div>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-text-dim hover:text-text transition-colors text-sm flex items-center gap-1 mt-0.5 flex-shrink-0"
        >
          追溯原因
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border">
          {deps.length > 0 ? (
            <>
              <p className="text-xs text-text-dim mt-3 mb-2">以下前置知识点可能是根因：</p>
              <div className="flex flex-col gap-1">
                {deps.map(d => (
                  <div
                    key={d.id}
                    className="flex items-center gap-2 text-sm px-2 py-1.5 bg-surface2 rounded-lg"
                  >
                    <span style={{ color: d.gradeColor }}>●</span>
                    <span>{d.name}</span>
                    <Badge color={d.gradeColor} className="ml-auto">
                      {d.gradeName}
                    </Badge>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-text-dim mt-3">该知识点无前置依赖，是基础知识点。</p>
          )}
        </div>
      )}
    </div>
  );
}

function PathTab({
  weakStats,
  examGradeNum,
  examSemester,
}: {
  weakStats: KPStat[];
  examGradeNum: number;
  examSemester: '上' | '下';
}) {
  const navigate = useNavigate();
  const minGrade = examSemester === '下' ? examGradeNum - 1 : examGradeNum - 1;
  const rootCauses = new Map<
    string,
    { kpId: string; kpName: string; grade: string; gradeColor: string; reason: string }
  >();

  weakStats.forEach(stat => {
    const deps = getFullDepsChain(stat.kpId).filter(d => d.gradeNum >= minGrade);
    deps.forEach(d => {
      if (!rootCauses.has(d.id)) {
        rootCauses.set(d.id, {
          kpId: d.id,
          kpName: d.name,
          grade: d.gradeName,
          gradeColor: d.gradeColor,
          reason: `是「${stat.kpName}」的前置知识点，补充此处可以夯实根基`,
        });
      }
    });
  });

  const prioritized = Array.from(rootCauses.values()).slice(0, 5);
  if (prioritized.length === 0 && weakStats.length > 0) {
    weakStats.slice(0, 5).forEach(s => {
      prioritized.push({
        kpId: s.kpId,
        kpName: s.kpName,
        grade: s.grade,
        gradeColor: kpMap.get(s.kpId)?.gradeColor ?? '#a7a9be',
        reason: '直接薄弱点，需要针对性练习',
      });
    });
  }

  if (prioritized.length === 0) {
    return <p className="text-text-dim text-sm">暂无数据，完成考试后查看。</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-text-dim text-sm mb-2">建议按以下顺序补习（优先度从高到低）：</p>
      {prioritized.map((item, i) => (
        <div
          key={item.kpId}
          className="flex items-start gap-4 bg-surface border border-border rounded-xl p-4"
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{ background: `${item.gradeColor}22`, color: item.gradeColor }}
          >
            {i + 1}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">{item.kpName}</span>
              <Badge color={item.gradeColor}>{item.grade}</Badge>
            </div>
            <p className="text-text-dim text-sm">{item.reason}</p>
          </div>
          <button
            onClick={() => navigate(`/preview?kp=${item.kpId}`)}
            className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg flex-shrink-0 transition-colors"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <BookOpen size={12} />
            去学习
          </button>
        </div>
      ))}
    </div>
  );
}

/** Formats a choice label and its content, for example "B: answer". */
function formatChoiceAnswer(
  label: string | undefined,
  choices: { label: string; content: string }[] | undefined,
): string {
  if (!label) return '（未作答）';
  if (!choices?.length) return label;
  const opt = choices.find(c => c.label === label);
  return opt ? `${label}：${opt.content}` : label;
}

/** Builds the query string that carries answers to the question detail page. */
function buildQuestionLink(choiceAnswer?: string, userAnswers?: string[]): string {
  const params = new URLSearchParams();
  if (choiceAnswer) params.set('ua', choiceAnswer);
  const blanks = (userAnswers ?? []).filter(a => a?.trim());
  if (blanks.length > 0) params.set('ub', blanks.join(','));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Detail row for one question. */
function QuestionRow({
  q,
  session,
  expandedIds,
  toggle,
}: {
  q: Question;
  session: ExamSession;
  expandedIds: Set<string>;
  toggle: (id: string) => void;
}) {
  const qType: QuestionType = q.type || 'fill_blank';
  const userAnswers = session.answers[q.id] ?? [];
  const choiceAnswer = session.choiceAnswers?.[q.id];
  const blanksCorrect =
    userAnswers.length === q.blanks.length &&
    userAnswers.every((a: string, j: number) => a.trim() === q.blanks[j]?.trim());
  const choiceCorrect = !!choiceAnswer && choiceAnswer === q.correctChoice;
  const isCorrect =
    qType === 'fill_blank'
      ? blanksCorrect
      : qType === 'choice'
        ? choiceCorrect
        : blanksCorrect && choiceCorrect;
  const isExpanded = expandedIds.has(q.id);

  const userChoiceDisplay = formatChoiceAnswer(choiceAnswer, q.choices);
  const correctChoiceDisplay = formatChoiceAnswer(q.correctChoice, q.choices);
  const userFillDisplay = userAnswers.length ? userAnswers.join('、') : '（未作答）';
  const correctFillDisplay = q.blanks.length ? q.blanks.join('、') : '—';

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-start gap-3 px-4 py-3">
        <span
          className={`w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5 ${isCorrect ? 'bg-green/20 text-green' : 'bg-accent2/20 text-accent2'}`}
        >
          {isCorrect ? '✓' : '✗'}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm mb-1">{q.question}</p>
          <div className="flex flex-col gap-1 mt-1.5 text-xs">
            {(qType === 'choice' || qType === 'mixed') && (
              <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                <span style={{ color: 'var(--text-dim)' }}>
                  你的选择：
                  <span
                    style={{
                      color:
                        isCorrect || choiceAnswer === q.correctChoice
                          ? 'var(--green)'
                          : 'var(--accent2)',
                    }}
                  >
                    {userChoiceDisplay}
                  </span>
                </span>
                {choiceAnswer !== q.correctChoice && (
                  <span style={{ color: 'var(--text-dim)' }}>
                    正确选项：<span style={{ color: 'var(--green)' }}>{correctChoiceDisplay}</span>
                  </span>
                )}
              </div>
            )}
            {(qType === 'fill_blank' || qType === 'mixed') && (
              <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                <span style={{ color: 'var(--text-dim)' }}>
                  你的答案：
                  <span style={{ color: isCorrect ? 'var(--green)' : 'var(--accent2)' }}>
                    {userFillDisplay}
                  </span>
                </span>
                {!isCorrect && (
                  <span style={{ color: 'var(--text-dim)' }}>
                    正确答案：<span style={{ color: 'var(--green)' }}>{correctFillDisplay}</span>
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 mt-2">
            <Link
              to={`/question/${q.id}${buildQuestionLink(choiceAnswer, userAnswers)}`}
              className="flex items-center gap-1 text-xs font-mono transition-colors hover:underline"
              style={{ color: 'var(--blue)' }}
            >
              #{q.id}
              <ExternalLink size={10} />
            </Link>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <Link
            to={`/question/${q.id}${buildQuestionLink(choiceAnswer, userAnswers)}`}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}
          >
            <Eye size={11} />
            查看
          </Link>
          <button
            onClick={() => toggle(q.id)}
            className="text-text-dim hover:text-text text-xs flex items-center gap-0.5"
          >
            解析 {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>
      {isExpanded && (
        <div className="px-4 pb-4 ml-8">
          <div className="bg-surface2 rounded-xl p-3 text-sm text-text-dim">
            <p className="font-medium text-text mb-1">解题过程</p>
            <p className="leading-relaxed whitespace-pre-wrap">{renderSolution(q.solution)}</p>
            {q.common_mistake && (
              <p className="mt-2 text-accent2 text-xs">
                ⚠️ 常见错误：{renderSolution(q.common_mistake)}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function isQuestionCorrect(q: Question, session: ExamSession): boolean {
  const qType: QuestionType = q.type || 'fill_blank';
  const userAnswers = session.answers[q.id] ?? [];
  const choiceAnswer = session.choiceAnswers?.[q.id];
  const blanksCorrect =
    userAnswers.length === q.blanks.length &&
    userAnswers.every((a: string, j: number) => a.trim() === q.blanks[j]?.trim());
  const choiceCorrect = !!choiceAnswer && choiceAnswer === q.correctChoice;
  if (qType === 'fill_blank') return blanksCorrect;
  if (qType === 'choice') return choiceCorrect;
  return blanksCorrect && choiceCorrect;
}

function DetailTab({ session }: { session: ExamSession }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [groupByKP, setGroupByKP] = useState(false);
  // Track expanded groups in knowledge-point grouping mode.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (kpId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(kpId)) next.delete(kpId);
      else next.add(kpId);
      return next;
    });
  };

  const allQuestions: Question[] = session.questions ?? [];
  const filtered = onlyWrong
    ? allQuestions.filter(q => !isQuestionCorrect(q, session))
    : allQuestions;

  // Toggle component.
  const ToggleSwitch = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: boolean;
    onChange: () => void;
  }) => (
    <div className="flex items-center gap-2">
      <span className="text-sm text-text-dim">{label}</span>
      <button
        onClick={onChange}
        className="relative w-10 h-5 rounded-full transition-colors"
        style={{ background: value ? 'var(--accent2)' : 'var(--border)' }}
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm"
          style={{ left: value ? '22px' : '2px' }}
        />
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Filters. */}
      <div className="flex items-center justify-end gap-4 flex-wrap">
        <ToggleSwitch label="只看错题" value={onlyWrong} onChange={() => setOnlyWrong(v => !v)} />
        <ToggleSwitch
          label="按知识点分类"
          value={groupByKP}
          onChange={() => setGroupByKP(v => !v)}
        />
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-text-dim">
          <p className="text-4xl mb-3">🎉</p>
          <p>{onlyWrong ? '没有错题，全部答对！' : '暂无答题记录。'}</p>
        </div>
      )}

      {/* Exam order, used by default. */}
      {!groupByKP && filtered.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="flex flex-col">
            {filtered.map(q => (
              <QuestionRow
                key={q.id}
                q={q}
                session={session}
                expandedIds={expandedIds}
                toggle={toggle}
              />
            ))}
          </div>
        </div>
      )}

      {/* Group by knowledge point. */}
      {groupByKP &&
        filtered.length > 0 &&
        (() => {
          const groups = new Map<string, { kpName: string; questions: Question[] }>();
          filtered.forEach(q => {
            const g = groups.get(q.kp_id) ?? { kpName: q.kp_name, questions: [] };
            g.questions.push(q);
            groups.set(q.kp_id, g);
          });

          return Array.from(groups.entries()).map(([kpId, grp]) => {
            const isGroupOpen = expandedGroups.has(kpId);
            return (
              <div
                key={kpId}
                className="bg-surface border border-border rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => toggleGroup(kpId)}
                  className="w-full px-4 py-3 border-b border-border bg-surface2 flex items-center gap-2 hover:bg-surface2/80 transition-colors text-left"
                >
                  {isGroupOpen ? (
                    <ChevronUp size={14} className="text-text-dim" />
                  ) : (
                    <ChevronDown size={14} className="text-text-dim" />
                  )}
                  <span className="font-medium text-sm">{grp.kpName}</span>
                  <span className="text-text-dim text-xs">{grp.questions.length} 题</span>
                </button>
                {isGroupOpen && (
                  <div className="flex flex-col">
                    {grp.questions.map(q => (
                      <QuestionRow
                        key={q.id}
                        q={q}
                        session={session}
                        expandedIds={expandedIds}
                        toggle={toggle}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          });
        })()}
    </div>
  );
}

export default function ReportPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { getSession } = useExamStore();
  const { buildReport, getReport } = useReportStore();

  // Drive tab state from the URL hash; detail is the hash-free default.
  const hashTab = location.hash.replace('#', '');
  const activeTab = hashTab === 'weak' || hashTab === 'path' ? hashTab : 'detail';
  const setActiveTab = useCallback(
    (id: string) => {
      navigate({ hash: id === 'detail' ? '' : `#${id}` }, { replace: true });
    },
    [navigate],
  );

  const session = sessionId ? getSession(sessionId) : null;
  const report = session ? (getReport(sessionId!) ?? buildReport(session)) : null;

  if (!session || !report) {
    return (
      <div className="h-screen flex items-center justify-center flex-col gap-4">
        <p className="text-text-dim">找不到报告数据</p>
        <Button onClick={() => navigate('/assessment')}>返回首页</Button>
      </div>
    );
  }

  const score = calcScore(session);
  const correctRate =
    report.totalQuestions > 0
      ? ((report.correctCount / report.totalQuestions) * 100).toFixed(1)
      : '0';
  const weakStats = report.kpStats
    .filter(s => s.errorRate > 0.5)
    .sort((a, b) => b.errorRate - a.errorRate);

  return (
    <div className="min-h-screen pt-20 px-4 sm:px-6 py-10">
      <div className="max-w-3xl mx-auto">
        {/* Header label. */}
        <div className="flex items-center gap-2 mb-6">
          <span className="text-xs px-2 py-1 rounded-full bg-green/10 border border-green/30 text-green">
            数据来源：平台智能考试（高置信度）
          </span>
        </div>

        {/* Circular score and summary. */}
        <div className="bg-surface border border-border rounded-2xl p-6 mb-6 flex flex-col sm:flex-row items-center gap-6">
          <ScoreCircle score={score} />
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
            {[
              { label: '总题数', value: report.totalQuestions },
              { label: '答对题数', value: report.correctCount },
              { label: '答对率', value: `${correctRate}%` },
              {
                label: '完成时长',
                value: report.duration > 0 ? formatDuration(report.duration) : '—',
              },
              { label: '覆盖知识点', value: `${report.kpStats.length} 个` },
              { label: '薄弱知识点', value: `${weakStats.length} 个` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-surface2 rounded-xl px-4 py-3">
                <p className="text-text-dim text-xs mb-0.5">{label}</p>
                <p className="text-lg font-semibold text-text">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Retry incorrect questions. */}
        <Button
          variant="primary"
          size="lg"
          className="w-full mb-6 py-4 text-base"
          onClick={() => navigate(`/review?session=${sessionId}`)}
        >
          <RotateCcw size={18} />
          错题重做
        </Button>

        {/* Tab navigation. */}
        <div className="flex gap-1 bg-surface border border-border rounded-xl p-1 mb-6">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`
                flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm transition-colors
                ${activeTab === id ? 'bg-surface2 text-text font-medium' : 'text-text-dim hover:text-text'}
              `}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === 'weak' && (
              <div className="flex flex-col gap-3">
                {weakStats.length === 0 ? (
                  <div className="text-center py-12 text-text-dim">
                    <p className="text-4xl mb-3">🎉</p>
                    <p>没有明显薄弱点，学得不错！</p>
                  </div>
                ) : (
                  weakStats.map(stat => (
                    <WeakKPRow
                      key={stat.kpId}
                      stat={stat}
                      examGradeNum={session.config.gradeNum ?? 6}
                      examSemester={session.config.semester ?? '下'}
                    />
                  ))
                )}
              </div>
            )}

            {activeTab === 'path' && (
              <PathTab
                weakStats={weakStats}
                examGradeNum={session.config.gradeNum ?? 6}
                examSemester={session.config.semester ?? '下'}
              />
            )}

            {activeTab === 'detail' && <DetailTab session={session} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
