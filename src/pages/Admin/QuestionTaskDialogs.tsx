import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Square,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Dialog from '../../components/ui/Dialog';
import Select, { type SelectOption } from '../../components/ui/Select';
import type {
  GenerateQuestionTaskParams,
  QualityQuestionTaskParams,
  QuestionTask,
  QuestionTaskParams,
  QuestionTaskType,
} from '../../data/adminQuestionBank';
import { kpMap } from '../../data/kpIndex';

const GRADE_OPTIONS = ['一', '二', '三', '四', '五', '六'].map((grade, index) => ({
  value: String(index + 1),
  label: `${grade}年级`,
})) satisfies SelectOption[];
const OPTIONAL_GRADE_OPTIONS = [{ value: '', label: '全部年级' }, ...GRADE_OPTIONS];
const SEMESTER_OPTIONS = [
  { value: '', label: '全部学期' },
  { value: '上', label: '上学期' },
  { value: '下', label: '下学期' },
] satisfies SelectOption[];
const TYPE_MODE_OPTIONS = [
  { value: 'auto', label: '智能混合题型' },
  { value: 'fill_blank', label: '仅填空题' },
  { value: 'choice', label: '仅选择题' },
  { value: 'mixed', label: '仅综合题' },
] satisfies SelectOption[];
const OPTIONAL_TYPE_OPTIONS = [
  { value: '', label: '全部题型' },
  { value: 'fill_blank', label: '填空题' },
  { value: 'choice', label: '选择题' },
  { value: 'mixed', label: '综合题' },
] satisfies SelectOption[];
const COUNT_OPTIONS = [
  { value: '3', label: '每个知识点 3 道' },
  { value: '5', label: '每个知识点 5 道' },
] satisfies SelectOption[];
const QUALITY_SCOPE_OPTIONS = [
  { value: 'all', label: '全部题目' },
  { value: 'enabled', label: '当前启用题目' },
  { value: 'disabled', label: '当前停用题目' },
  { value: 'reported', label: '有用户反馈的题目' },
] satisfies SelectOption[];
const QUALITY_LIMIT_OPTIONS = [
  { value: 'all', label: '全部' },
  ...[20, 50, 100, 200].map(limit => ({
    value: String(limit),
    label: `最多 ${limit} 道`,
  })),
] satisfies SelectOption[];

const STATUS_LABELS: Record<QuestionTask['status'], string> = {
  queued: '等待执行',
  running: '运行中',
  completed: '已完成',
  failed: '执行失败',
  cancelled: '已停止',
};

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

function statusTone(status: QuestionTask['status']): string {
  if (status === 'completed') return 'text-green';
  if (status === 'failed') return 'text-red-500';
  if (status === 'cancelled') return 'text-amber-500';
  if (status === 'running') return 'text-accent';
  return 'text-text-dim';
}

function taskProgress(task: QuestionTask): number {
  if (task.status === 'completed') return 100;
  if (!task.progressTotal) return 0;
  return Math.min(100, Math.round((task.progressCurrent / task.progressTotal) * 100));
}

function taskTypeLabel(type: QuestionTaskType): string {
  return type === 'generate' ? '生成题库' : 'AI 质检';
}

function taskParamsSummary(type: QuestionTaskType, params: QuestionTaskParams): string {
  if (type === 'generate') {
    const generation = params as GenerateQuestionTaskParams;
    const grade = GRADE_OPTIONS.find(option => option.value === String(generation.grade))?.label;
    const semester = generation.semester ? `${generation.semester}学期` : '全部学期';
    const scope = generation.kpId ? `知识点 ${generation.kpId}` : '所选范围全部知识点';
    return `${grade ?? `${generation.grade}年级`} · ${semester} · ${scope} · 每知识点 ${generation.countPerKnowledgePoint} 道`;
  }
  const quality = params as QualityQuestionTaskParams;
  const scope = QUALITY_SCOPE_OPTIONS.find(option => option.value === quality.scope)?.label;
  const grade = GRADE_OPTIONS.find(option => option.value === String(quality.grade))?.label;
  const limit = quality.limit === 'all' ? '全部题目' : `最多 ${quality.limit} 道`;
  return `${scope} · ${quality.grade ? (grade ?? `${quality.grade}年级`) : '全部年级'} · ${limit}`;
}

interface TaskLauncherDialogProps {
  type: QuestionTaskType | null;
  busy: boolean;
  onClose: () => void;
  onStart: (type: QuestionTaskType, params: QuestionTaskParams) => Promise<void>;
}

export function TaskLauncherDialog({ type, busy, onClose, onStart }: TaskLauncherDialogProps) {
  const [grade, setGrade] = useState('1');
  const [semester, setSemester] = useState('');
  const [kpId, setKpId] = useState('');
  const [typeMode, setTypeMode] = useState('auto');
  const [count, setCount] = useState('3');
  const [qualityScope, setQualityScope] = useState('enabled');
  const [qualityGrade, setQualityGrade] = useState('');
  const [qualitySemester, setQualitySemester] = useState('');
  const [qualityType, setQualityType] = useState('');
  const [qualityLimit, setQualityLimit] = useState('50');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!type) return;
    setError(null);
  }, [type]);

  const matchingKnowledgePoints = useMemo(
    () =>
      [...kpMap.values()]
        .filter(kp => kp.gradeNum === Number(grade) && (!semester || kp.unitSemester === semester))
        .sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true })),
    [grade, semester],
  );
  const knowledgePointOptions = useMemo(
    () => [
      { value: '', label: `全部知识点（${matchingKnowledgePoints.length} 个）` },
      ...matchingKnowledgePoints.map(kp => ({ value: kp.id, label: `${kp.id} · ${kp.name}` })),
    ],
    [matchingKnowledgePoints],
  );
  const estimatedKnowledgePoints = kpId ? 1 : matchingKnowledgePoints.length;
  const estimatedQuestions = estimatedKnowledgePoints * Number(count);

  const submit = async () => {
    if (!type) return;
    setError(null);
    try {
      if (type === 'generate') {
        await onStart(type, {
          grade: Number(grade),
          ...(semester ? { semester: semester as '上' | '下' } : {}),
          ...(kpId ? { kpId } : {}),
          typeMode: typeMode as GenerateQuestionTaskParams['typeMode'],
          countPerKnowledgePoint: Number(count) as 3 | 5,
        });
      } else {
        await onStart(type, {
          scope: qualityScope as QualityQuestionTaskParams['scope'],
          ...(qualityGrade ? { grade: Number(qualityGrade) } : {}),
          ...(qualitySemester ? { semester: qualitySemester as '上' | '下' } : {}),
          ...(qualityType ? { type: qualityType as QualityQuestionTaskParams['type'] } : {}),
          limit: qualityLimit === 'all' ? 'all' : (Number(qualityLimit) as 20 | 50 | 100 | 200),
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '任务启动失败');
    }
  };

  return (
    <Dialog
      open={type !== null}
      title={type === 'generate' ? '生成题库' : 'AI 题目质检'}
      description={
        type === 'generate'
          ? 'AI 会按知识点分批生成，新题先进入待质检状态，不会直接给学生使用。'
          : 'AI 会逐批检查答案、题意和年级匹配；待检新题合格后启用，问题题自动停用，人工停用不会被自动恢复。'
      }
      dismissible={!busy}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>
            {busy ? (
              <LoaderCircle size={15} className="animate-spin" />
            ) : type === 'generate' ? (
              <Sparkles size={15} />
            ) : (
              <ShieldCheck size={15} />
            )}
            {busy ? '正在启动…' : '确认开始'}
          </Button>
        </>
      }
    >
      {type === 'generate' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="年级"
            value={grade}
            options={GRADE_OPTIONS}
            onChange={value => {
              setGrade(value);
              setKpId('');
            }}
          />
          <Select
            label="学期"
            value={semester}
            options={SEMESTER_OPTIONS}
            onChange={value => {
              setSemester(value);
              setKpId('');
            }}
          />
          <Select
            className="sm:col-span-2"
            label="知识点范围"
            value={kpId}
            options={knowledgePointOptions}
            onChange={setKpId}
            searchable
            searchPlaceholder="搜索知识点 ID 或名称"
            emptyText="没有匹配的知识点"
          />
          <Select
            label="题型"
            value={typeMode}
            options={TYPE_MODE_OPTIONS}
            onChange={setTypeMode}
          />
          <Select label="生成数量" value={count} options={COUNT_OPTIONS} onChange={setCount} />
          <div className="sm:col-span-2 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3">
            <p className="text-sm font-medium text-text">预计生成约 {estimatedQuestions} 道</p>
            <p className="mt-1 text-xs leading-relaxed text-text-dim">
              覆盖 {estimatedKnowledgePoints} 个知识点。任务在后台运行，关闭页面后也会继续。
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            className="sm:col-span-2"
            label="质检范围"
            value={qualityScope}
            options={QUALITY_SCOPE_OPTIONS}
            onChange={setQualityScope}
          />
          <Select
            label="年级"
            value={qualityGrade}
            options={OPTIONAL_GRADE_OPTIONS}
            onChange={setQualityGrade}
          />
          <Select
            label="学期"
            value={qualitySemester}
            options={SEMESTER_OPTIONS}
            onChange={setQualitySemester}
          />
          <Select
            label="题型"
            value={qualityType}
            options={OPTIONAL_TYPE_OPTIONS}
            onChange={setQualityType}
          />
          <Select
            label="本次上限"
            value={qualityLimit}
            options={QUALITY_LIMIT_OPTIONS}
            onChange={setQualityLimit}
          />
          <div className="sm:col-span-2 rounded-xl border border-green/20 bg-green/5 px-4 py-3">
            <p className="text-sm font-medium text-text">每批检查 5 道题</p>
            <p className="mt-1 text-xs leading-relaxed text-text-dim">
              {qualityLimit === 'all'
                ? '将检查当前筛选范围内的全部题目，可关闭页面等待后台完成。'
                : '每批结果都会写入 D1 并同步给后续新建的作答，历史试卷仍保留原题面。'}
            </p>
          </div>
        </div>
      )}
      {error && (
        <p className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>
      )}
    </Dialog>
  );
}

export function TaskProgressCard({ task, onOpen }: { task: QuestionTask; onOpen: () => void }) {
  const progress = taskProgress(task);
  const active = task.status === 'queued' || task.status === 'running';
  const showProgress = active && task.progressTotal > 0;
  return (
    <Card className="mt-4 overflow-hidden">
      <button
        type="button"
        onClick={onOpen}
        className="w-full px-4 py-3 text-left hover:bg-surface2/40"
      >
        <div className="flex items-center gap-3">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${active ? 'bg-accent/10 text-accent' : task.status === 'completed' ? 'bg-green/10 text-green' : task.status === 'cancelled' ? 'bg-amber-500/10 text-amber-500' : 'bg-red-500/10 text-red-500'}`}
          >
            {active ? (
              <LoaderCircle size={18} className={task.status === 'running' ? 'animate-spin' : ''} />
            ) : task.status === 'completed' ? (
              <CheckCircle2 size={18} />
            ) : (
              <AlertTriangle size={18} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-text">最近任务 · {taskTypeLabel(task.type)}</p>
              <span className={`text-xs font-semibold ${statusTone(task.status)}`}>
                {STATUS_LABELS[task.status]}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-text-dim">{task.stage}</p>
          </div>
          {showProgress && (
            <span className="shrink-0 text-sm font-semibold text-text">{progress}%</span>
          )}
        </div>
        {showProgress && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface2">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </button>
    </Card>
  );
}

export function TaskProgressDialog({
  task,
  stopping,
  onClose,
  onStop,
}: {
  task: QuestionTask | null;
  stopping: boolean;
  onClose: () => void;
  onStop: () => Promise<void>;
}) {
  if (!task) return null;
  const progress = taskProgress(task);
  const active = task.status === 'queued' || task.status === 'running';
  const showProgress = active && task.progressTotal > 0;
  const statEntries = Object.entries(task.stats);
  return (
    <Dialog
      open
      title={`${taskTypeLabel(task.type)}进度`}
      description={taskParamsSummary(task.type, task.params)}
      panelClassName="max-w-2xl"
      dismissible={!stopping}
      onClose={onClose}
      footer={
        <>
          {active && (
            <Button variant="danger" onClick={() => void onStop()} disabled={stopping}>
              <Square size={14} />
              {stopping ? '正在停止…' : '停止任务'}
            </Button>
          )}
          <Button onClick={onClose} disabled={stopping}>
            关闭
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={`text-sm font-semibold ${statusTone(task.status)}`}>
                {STATUS_LABELS[task.status]}
              </p>
              <p className="mt-1 text-sm text-text">{task.stage}</p>
            </div>
            {showProgress && <span className="text-2xl font-semibold text-text">{progress}%</span>}
          </div>
          {showProgress && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface2">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          <p className="mt-2 text-xs text-text-dim">
            {active
              ? `${task.progressCurrent} / ${task.progressTotal || '-'} · 开始于 ${formatDate(task.startedAt ?? task.createdAt)}`
              : `完成于 ${formatDate(task.completedAt ?? task.updatedAt)}`}
          </p>
        </div>

        {statEntries.length > 0 && (
          <div className={`grid gap-2 ${statEntries.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {statEntries.map(([key, value]) => (
              <div key={key} className="rounded-xl bg-surface2 px-3 py-2.5 text-center">
                <p className="text-lg font-semibold text-text">{value}</p>
                <p className="mt-0.5 text-[11px] text-text-dim">
                  {{
                    knowledgePoints: '知识点',
                    inserted: '新增题目',
                    checked: '已检查',
                    passed: '合格',
                    failed: '停用',
                  }[key] ?? key}
                </p>
              </div>
            ))}
          </div>
        )}

        {task.errorMessage && (
          <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {task.errorMessage}
          </p>
        )}

        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text">
            <Clock3 size={15} />
            运行记录
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {task.events?.length ? (
              task.events.map(event => (
                <div
                  key={event.id}
                  className="flex gap-3 rounded-xl border border-border px-3 py-2.5"
                >
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${event.level === 'error' ? 'bg-red-500' : event.level === 'warning' ? 'bg-amber-500' : event.level === 'success' ? 'bg-green' : 'bg-text-dim'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed text-text">{event.message}</p>
                    <p className="mt-0.5 text-[11px] text-text-dim">
                      {formatDate(event.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-text-dim">等待任务记录…</p>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
