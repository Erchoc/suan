import {
  Archive,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  Flag,
  KeyRound,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Dialog from '../../components/ui/Dialog';
import Select, { type SelectOption } from '../../components/ui/Select';
import {
  AdminApiError,
  type AdminQuestion,
  type AdminQuestionFilters,
  type AdminQuestionList,
  batchSetAdminQuestionStatus,
  dismissAdminQuestionReports,
  type GenerateQuestionTaskParams,
  getAdminSession,
  getQuestionTask,
  listAdminQuestionReports,
  listAdminQuestions,
  listQuestionTasks,
  loginAdmin,
  type QualityQuestionTaskParams,
  type QuestionReportEntry,
  type QuestionTask,
  type QuestionTaskParams,
  type QuestionTaskType,
  startQuestionTask,
  stopQuestionTask,
  updateAdminQuestion,
} from '../../data/adminQuestionBank';
import QuestionEditor from './QuestionEditor';
import QuestionPreviewDialog from './QuestionPreviewDialog';
import QuestionStatusBadge from './QuestionStatusBadge';
import { TaskLauncherDialog, TaskProgressCard, TaskProgressDialog } from './QuestionTaskDialogs';

const DEFAULT_FILTERS: AdminQuestionFilters = { page: 1, pageSize: 30 };
const GRADE_OPTIONS = [
  { value: '', label: '全部' },
  ...['一', '二', '三', '四', '五', '六'].map(grade => ({
    value: `${grade}年级`,
    label: `${grade}年级`,
  })),
] satisfies SelectOption[];
const SEMESTER_OPTIONS = [
  { value: '', label: '全部' },
  { value: '上学期', label: '上学期' },
  { value: '下学期', label: '下学期' },
] satisfies SelectOption[];
const DIFFICULTY_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' },
] satisfies SelectOption[];
const TYPE_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'choice', label: '选择' },
  { value: 'fill_blank', label: '填空' },
  { value: 'mixed', label: '综合' },
] satisfies SelectOption[];
type PendingAction =
  | { type: 'batch'; enable: boolean; ids: string[]; single?: boolean }
  | { type: 'dismiss'; questionId: string };
const TYPE_LABELS = { fill_blank: '填空题', choice: '选择题', mixed: '综合题' };
const DIFFICULTY_LABELS = { easy: '简单', medium: '中等', hard: '困难' };

declare global {
  interface Window {
    __SUAN_CONSOLE_PASSCODE__?: string;
  }
}

function formatDate(value: string | null): string {
  if (!value) return '尚未发布';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

function consumeConsolePasscode(): string | undefined {
  const bootPasscode = window.__SUAN_CONSOLE_PASSCODE__;
  delete window.__SUAN_CONSOLE_PASSCODE__;

  const url = new URL(window.location.href);
  const routePasscode =
    url.pathname === '/console' ? (url.searchParams.get('pw') ?? undefined) : undefined;
  if (routePasscode) {
    url.searchParams.delete('pw');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }
  return bootPasscode ?? routePasscode;
}

function AccessDenied({ error }: { error: string | null }) {
  return (
    <main className="min-h-screen bg-bg px-4 pb-20 pt-20 sm:pt-28">
      <Card className="mx-auto max-w-md overflow-hidden">
        <div className="border-b border-border bg-surface2/60 px-6 py-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <KeyRound size={22} />
          </div>
          <h1 className="mt-4 font-serif text-2xl font-semibold text-text">后台入口无效</h1>
          <p className="mt-2 text-sm leading-relaxed text-text-dim">
            请使用包含当天口令的完整 Console 地址重新进入。
          </p>
        </div>
        {error && (
          <p className="m-6 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>
        )}
      </Card>
    </main>
  );
}

function StatCard({
  label,
  value,
  tone = 'text-text',
  active,
  onClick,
}: {
  label: string;
  value: string | number;
  tone?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className="text-left">
      <Card
        className={`h-full px-4 py-3 transition-colors hover:border-accent/60 ${
          active ? 'border-accent bg-accent/5 ring-2 ring-accent/15' : ''
        }`}
      >
        <p className="text-xs text-text-dim">{label}</p>
        <p className={`mt-1 text-xl font-semibold ${tone}`}>{value}</p>
      </Card>
    </button>
  );
}

export default function AdminQuestionBankPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [filters, setFilters] = useState<AdminQuestionFilters>(DEFAULT_FILTERS);
  const [queryInput, setQueryInput] = useState('');
  const [result, setResult] = useState<AdminQuestionList | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<AdminQuestion | null>(null);
  const [previewing, setPreviewing] = useState<AdminQuestion | null>(null);
  const [reportQuestion, setReportQuestion] = useState<AdminQuestion | null>(null);
  const [reports, setReports] = useState<QuestionReportEntry[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [tasks, setTasks] = useState<QuestionTask[]>([]);
  const [taskLauncher, setTaskLauncher] = useState<QuestionTaskType | null>(null);
  const [taskDetail, setTaskDetail] = useState<QuestionTask | null>(null);
  const [taskStarting, setTaskStarting] = useState(false);
  const [taskStopping, setTaskStopping] = useState(false);
  const lastTerminalTaskRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const passcode = consumeConsolePasscode();
    const authentication = passcode ? loginAdmin(passcode) : getAdminSession();
    authentication
      .then(session => setAuthenticated(session.authenticated))
      .catch(cause => {
        setError(cause instanceof Error ? cause.message : '无法检查管理员会话');
        setAuthenticated(false);
      });
  }, []);

  const load = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true);
    setError(null);
    try {
      const next = await listAdminQuestions(filters);
      setResult(next);
      setSelected(new Set());
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.status === 401) setAuthenticated(false);
      setError(cause instanceof Error ? cause.message : '题库加载失败');
    } finally {
      setLoading(false);
    }
  }, [authenticated, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadTasks = useCallback(async () => {
    if (!authenticated) return;
    try {
      const next = (await listQuestionTasks()).data;
      setTasks(next);
      const latest = next[0];
      if (
        latest &&
        (latest.status === 'completed' || latest.status === 'failed') &&
        lastTerminalTaskRef.current !== `${latest.id}:${latest.updatedAt}`
      ) {
        lastTerminalTaskRef.current = `${latest.id}:${latest.updatedAt}`;
        await load();
      }
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.status === 401) setAuthenticated(false);
      else setError(cause instanceof Error ? cause.message : '任务状态加载失败');
    }
  }, [authenticated, load]);

  const hasActiveTask = tasks.some(task => task.status === 'queued' || task.status === 'running');

  useEffect(() => {
    if (!authenticated) return;
    void loadTasks();
    const interval = window.setInterval(() => void loadTasks(), hasActiveTask ? 2_000 : 15_000);
    return () => window.clearInterval(interval);
  }, [authenticated, hasActiveTask, loadTasks]);

  useEffect(() => {
    if (!taskDetail || (taskDetail.status !== 'queued' && taskDetail.status !== 'running')) return;
    const refresh = async () => {
      try {
        setTaskDetail((await getQuestionTask(taskDetail.id)).data);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '任务详情加载失败');
      }
    };
    const interval = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(interval);
  }, [taskDetail]);

  const openTaskDetail = async (task: QuestionTask) => {
    setTaskDetail(task);
    try {
      setTaskDetail((await getQuestionTask(task.id)).data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '任务详情加载失败');
    }
  };

  const handleStartTask = async (type: QuestionTaskType, params: QuestionTaskParams) => {
    setTaskStarting(true);
    try {
      const response =
        type === 'generate'
          ? await startQuestionTask('generate', params as GenerateQuestionTaskParams)
          : await startQuestionTask('quality', params as QualityQuestionTaskParams);
      setTaskLauncher(null);
      setTaskDetail(response.data);
      await loadTasks();
    } finally {
      setTaskStarting(false);
    }
  };

  const handleStopTask = async () => {
    if (!taskDetail) return;
    setTaskStopping(true);
    try {
      await stopQuestionTask(taskDetail.id);
      setTaskDetail((await getQuestionTask(taskDetail.id)).data);
      await loadTasks();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '任务停止失败');
    } finally {
      setTaskStopping(false);
    }
  };

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((result?.total ?? 0) / (result?.pageSize ?? filters.pageSize))),
    [filters.pageSize, result],
  );
  const updateFilter = <Key extends keyof AdminQuestionFilters>(
    key: Key,
    value: AdminQuestionFilters[Key],
  ) => {
    setFilters(current => ({ ...current, [key]: value, page: 1 }));
  };

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    updateFilter('query', queryInput.trim() || undefined);
  };

  const handleSave = async (patch: Parameters<typeof updateAdminQuestion>[1]) => {
    if (!editing) return;
    setSaving(true);
    try {
      await updateAdminQuestion(editing.id, patch);
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const requestBatchStatus = (enable: boolean) => {
    const ids = [...selected];
    if (!ids.length) return;
    setActionReason('');
    setActionError(null);
    setPendingAction({ type: 'batch', enable, ids });
  };

  const requestQuestionStatus = (question: AdminQuestion, enable: boolean) => {
    setActionReason(enable ? '' : (question.reportSummary?.latestReason ?? ''));
    setActionError(null);
    setPendingAction({ type: 'batch', enable, ids: [question.id], single: true });
  };

  const openQuestionReports = async (question: AdminQuestion) => {
    setReportQuestion(question);
    setReports([]);
    setReportsLoading(true);
    try {
      setReports((await listAdminQuestionReports(question.id)).data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '反馈记录加载失败');
      setReportQuestion(null);
    } finally {
      setReportsLoading(false);
    }
  };

  const requestDismissReports = (question: AdminQuestion) => {
    setReportQuestion(null);
    setActionReason('核实后确认题目无需修改');
    setActionError(null);
    setPendingAction({ type: 'dismiss', questionId: question.id });
  };

  const closeActionDialog = () => {
    setPendingAction(null);
    setActionReason('');
    setActionError(null);
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    const reason = actionReason.trim();
    if (
      ((pendingAction.type === 'batch' && !pendingAction.enable) ||
        pendingAction.type === 'dismiss') &&
      !reason
    ) {
      setActionError(
        pendingAction.type === 'dismiss'
          ? '请填写忽略原因，方便后续追踪。'
          : '请填写禁用原因，方便后续追踪和修复。',
      );
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      if (pendingAction.type === 'batch') {
        await batchSetAdminQuestionStatus(
          pendingAction.ids,
          pendingAction.enable,
          pendingAction.enable ? undefined : reason,
        );
      } else {
        await dismissAdminQuestionReports(pendingAction.questionId, reason);
      }
      closeActionDialog();
      await load();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '操作失败，请稍后重试。');
    } finally {
      setSaving(false);
    }
  };

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-bg pt-28 text-center text-sm text-text-dim">
        正在验证后台会话…
      </div>
    );
  }
  if (!authenticated) return <AccessDenied error={error} />;

  const allCurrentSelected =
    !!result?.data.length && result.data.every(question => selected.has(question.id));
  const isSingleRestore =
    pendingAction?.type === 'batch' && pendingAction.enable && pendingAction.single === true;

  return (
    <main className="min-h-screen bg-bg px-3 pb-8 pt-16 sm:px-6 sm:pb-24 sm:pt-20">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-col gap-4 py-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-accent">
              <Archive size={14} />
              Content asset console
            </div>
            <h1 className="mt-2 font-serif text-3xl font-semibold text-text">题库资产后台</h1>
            <p className="mt-2 max-w-2xl text-sm text-text-dim">
              题目修改与启停只影响后续新作答，历史试卷继续保留原题面。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => setTaskLauncher('generate')}
              disabled={hasActiveTask || taskStarting}
            >
              <Sparkles size={15} /> 生成题库
            </Button>
            <Button
              onClick={() => setTaskLauncher('quality')}
              disabled={hasActiveTask || taskStarting}
            >
              <ShieldCheck size={15} /> 质检
            </Button>
          </div>
        </header>

        {error && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="关闭错误">
              <X size={16} />
            </button>
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="全部题目"
            value={result?.stats.total ?? '-'}
            active={!filters.status && !filters.attention}
            onClick={() =>
              setFilters(current => ({
                ...current,
                page: 1,
                status: undefined,
                attention: undefined,
              }))
            }
          />
          <StatCard
            label="正常使用"
            value={result?.stats.enabled ?? '-'}
            tone="text-green"
            active={filters.status === 'enabled' && !filters.attention}
            onClick={() =>
              setFilters(current => ({
                ...current,
                page: 1,
                status: 'enabled',
                attention: undefined,
              }))
            }
          />
          <StatCard
            label="已停用"
            value={result?.stats.disabled ?? '-'}
            tone="text-accent2"
            active={filters.status === 'disabled' && !filters.attention}
            onClick={() =>
              setFilters(current => ({
                ...current,
                page: 1,
                status: 'disabled',
                attention: undefined,
              }))
            }
          />
          <StatCard
            label="待处理反馈"
            value={result?.stats.reported ?? '-'}
            tone="text-red-500"
            active={filters.attention === 'reported'}
            onClick={() =>
              setFilters(current => ({
                ...current,
                page: 1,
                status: undefined,
                attention: 'reported',
              }))
            }
          />
        </section>

        {tasks[0] && (
          <TaskProgressCard task={tasks[0]} onOpen={() => void openTaskDetail(tasks[0])} />
        )}

        <Card className="mt-4 p-4">
          <form className="flex min-w-0 gap-2" onSubmit={handleSearch}>
            <div className="relative min-w-0 flex-1">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim"
              />
              <input
                value={queryInput}
                onChange={event => setQueryInput(event.target.value)}
                placeholder="搜索题目 ID、知识点或题干"
                className="w-full rounded-xl border border-border bg-surface2 py-2 pl-9 pr-3 text-sm outline-none focus:border-accent"
              />
            </div>
            <Button type="submit">搜索</Button>
          </form>
          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 md:grid-cols-4">
              <Select
                label="年级"
                value={filters.grade ?? ''}
                options={GRADE_OPTIONS}
                onChange={value => updateFilter('grade', value || undefined)}
                ariaLabel="按年级筛选"
              />
              <Select
                label="学期"
                value={filters.semester ?? ''}
                options={SEMESTER_OPTIONS}
                onChange={value => updateFilter('semester', value || undefined)}
                ariaLabel="按学期筛选"
              />
              <Select
                label="难度"
                value={filters.difficulty ?? ''}
                options={DIFFICULTY_OPTIONS}
                onChange={value =>
                  updateFilter(
                    'difficulty',
                    (value || undefined) as AdminQuestionFilters['difficulty'],
                  )
                }
                ariaLabel="按难度筛选"
              />
              <Select
                label="题型"
                value={filters.type ?? ''}
                options={TYPE_OPTIONS}
                onChange={value =>
                  updateFilter('type', (value || undefined) as AdminQuestionFilters['type'])
                }
                ariaLabel="按题型筛选"
              />
            </div>
            <Button
              onClick={() => {
                setQueryInput('');
                setFilters(DEFAULT_FILTERS);
              }}
              variant="ghost"
              className="shrink-0 lg:mb-0.5"
            >
              <RefreshCw size={14} /> 重置
            </Button>
          </div>
        </Card>

        <div className="mt-4 flex min-h-9 flex-wrap items-center gap-2">
          <span className="text-sm text-text-dim">已选 {selected.size} 道</span>
          <Button
            size="sm"
            onClick={() => requestBatchStatus(true)}
            disabled={!selected.size || saving}
          >
            <CheckCircle2 size={14} /> 批量启用
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => requestBatchStatus(false)}
            disabled={!selected.size || saving}
          >
            <XCircle size={14} /> 批量禁用
          </Button>
          <span className="ml-auto text-xs text-text-dim">历史作答保留原题面</span>
        </div>

        <Card className="mt-2 overflow-hidden">
          <div className="divide-y divide-border sm:hidden">
            {loading && <p className="px-4 py-16 text-center text-sm text-text-dim">加载题库中…</p>}
            {!loading && result?.data.length === 0 && (
              <p className="px-4 py-16 text-center text-sm text-text-dim">没有匹配题目</p>
            )}
            {!loading &&
              result?.data.map(question => {
                const enabled = question.enable !== false;
                return (
                  <article key={question.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        aria-label={`选择 ${question.id}`}
                        checked={selected.has(question.id)}
                        onChange={() =>
                          setSelected(current => {
                            const next = new Set(current);
                            if (next.has(question.id)) next.delete(question.id);
                            else next.add(question.id);
                            return next;
                          })
                        }
                        className="mt-1 accent-accent"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs font-medium text-text-dim">{question.id}</p>
                        <p className="line-clamp-3 text-sm leading-relaxed text-text">
                          {question.question}
                        </p>
                        <p className="mt-1 text-xs text-text-dim">{question.kp_name}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          <QuestionStatusBadge enabled={enabled} reason={question.checkMessage} />
                          <span className="text-xs text-text-dim">
                            {question.grade} / {TYPE_LABELS[question.type] ?? question.type} /{' '}
                            {DIFFICULTY_LABELS[question.difficulty] ?? question.difficulty}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(question)}
                          className="rounded-lg p-2 text-accent hover:bg-accent/10"
                          aria-label={`编辑 ${question.id}`}
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewing(question)}
                          className="rounded-lg p-2 text-text-dim hover:bg-surface2"
                          aria-label={`预览 ${question.id}`}
                        >
                          <Eye size={16} />
                        </button>
                        {question.reportSummary && (
                          <button
                            type="button"
                            onClick={() => void openQuestionReports(question)}
                            className="relative rounded-lg p-2 text-red-500 hover:bg-red-500/10"
                            aria-label={`查看 ${question.id} 的 ${question.reportSummary.openCount} 条反馈`}
                          >
                            <Flag size={16} />
                            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-500" />
                          </button>
                        )}
                        {enabled ? (
                          <button
                            type="button"
                            onClick={() => requestQuestionStatus(question, false)}
                            className="rounded-lg p-2 text-red-500 hover:bg-red-500/10"
                            aria-label={`停用 ${question.id}`}
                          >
                            <Ban size={16} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => requestQuestionStatus(question, true)}
                            className="rounded-lg p-2 text-green hover:bg-green/10"
                            aria-label={`恢复 ${question.id}`}
                          >
                            <RotateCcw size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[1180px] table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-12" />
                <col className="w-28" />
                <col className="w-[30%]" />
                <col className="w-[17%]" />
                <col className="w-28" />
                <col className="w-32" />
                <col className="w-24" />
                <col className="w-40" />
              </colgroup>
              <thead className="bg-surface2 text-xs text-text-dim">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allCurrentSelected}
                      onChange={() =>
                        setSelected(
                          allCurrentSelected
                            ? new Set()
                            : new Set(result?.data.map(question => question.id) ?? []),
                        )
                      }
                      className="accent-accent"
                    />
                  </th>
                  <th className="whitespace-nowrap px-3 py-3">ID</th>
                  <th className="whitespace-nowrap px-3 py-3">题目</th>
                  <th className="whitespace-nowrap px-3 py-3">知识点</th>
                  <th className="whitespace-nowrap px-3 py-3">年级学期</th>
                  <th className="whitespace-nowrap px-3 py-3">题型 / 难度</th>
                  <th className="whitespace-nowrap px-3 py-3">状态</th>
                  <th className="whitespace-nowrap px-3 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-text-dim">
                      加载题库中…
                    </td>
                  </tr>
                )}
                {!loading && result?.data.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-text-dim">
                      没有匹配题目
                    </td>
                  </tr>
                )}
                {!loading &&
                  result?.data.map(question => {
                    const enabled = question.enable !== false;
                    return (
                      <tr key={question.id} className="border-t border-border hover:bg-surface2/40">
                        <td className="px-4 py-3 align-top">
                          <input
                            type="checkbox"
                            checked={selected.has(question.id)}
                            onChange={() =>
                              setSelected(current => {
                                const next = new Set(current);
                                if (next.has(question.id)) next.delete(question.id);
                                else next.add(question.id);
                                return next;
                              })
                            }
                            className="accent-accent"
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 align-top font-mono text-xs text-text-dim">
                          {question.id}
                        </td>
                        <td className="max-w-xl px-3 py-3 align-top">
                          <p className="line-clamp-2 leading-relaxed text-text">
                            {question.question}
                          </p>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <p className="font-medium text-text">{question.kp_name}</p>
                          <p className="mt-1 font-mono text-xs text-text-dim">{question.kp_id}</p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 align-top text-text-dim">
                          {question.grade}
                          <br />
                          {question.semester}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <span className="font-medium text-text">
                              {TYPE_LABELS[question.type] ?? question.type}
                            </span>
                            <span className="text-xs text-text-dim">
                              / {DIFFICULTY_LABELS[question.difficulty] ?? question.difficulty}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <QuestionStatusBadge enabled={enabled} reason={question.checkMessage} />
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => setPreviewing(question)}
                              className="rounded-lg p-2 text-text-dim hover:bg-surface2 hover:text-accent"
                              aria-label={`预览 ${question.id}`}
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditing(question)}
                              className="rounded-lg p-2 text-text-dim hover:bg-surface2 hover:text-accent"
                              aria-label={`编辑 ${question.id}`}
                            >
                              <Edit3 size={15} />
                            </button>
                            {question.reportSummary && (
                              <button
                                type="button"
                                onClick={() => void openQuestionReports(question)}
                                className="relative rounded-lg p-2 text-red-500 hover:bg-red-500/10"
                                aria-label={`查看 ${question.id} 的 ${question.reportSummary.openCount} 条反馈`}
                              >
                                <Flag size={15} />
                                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-500" />
                              </button>
                            )}
                            {enabled ? (
                              <button
                                type="button"
                                onClick={() => requestQuestionStatus(question, false)}
                                className="rounded-lg p-2 text-text-dim hover:bg-red-500/10 hover:text-red-500"
                                aria-label={`停用 ${question.id}`}
                              >
                                <Ban size={15} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => requestQuestionStatus(question, true)}
                                className="rounded-lg p-2 text-text-dim hover:bg-green/10 hover:text-green"
                                aria-label={`恢复 ${question.id}`}
                              >
                                <RotateCcw size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <footer className="border-t border-border px-3 py-3 text-sm text-text-dim sm:flex sm:items-center sm:justify-between sm:px-4">
            <div className="flex items-center justify-between gap-3">
              <span>筛选结果 {result?.total ?? 0} 道</span>
              <span className="whitespace-nowrap sm:hidden">
                {filters.page} / {totalPages} 页
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-0 sm:flex sm:items-center sm:gap-3">
              <Button
                size="sm"
                className="w-full whitespace-nowrap sm:w-auto"
                onClick={() => setFilters(current => ({ ...current, page: current.page - 1 }))}
                disabled={filters.page <= 1 || loading}
              >
                <ChevronLeft size={14} /> 上一页
              </Button>
              <span className="hidden whitespace-nowrap sm:inline">
                第 {filters.page} / {totalPages} 页
              </span>
              <Button
                size="sm"
                className="w-full whitespace-nowrap sm:w-auto"
                onClick={() => setFilters(current => ({ ...current, page: current.page + 1 }))}
                disabled={filters.page >= totalPages || loading}
              >
                下一页 <ChevronRight size={14} />
              </Button>
            </div>
          </footer>
        </Card>
      </div>

      {editing && (
        <QuestionEditor
          question={editing}
          saving={saving}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
      <QuestionPreviewDialog question={previewing} onClose={() => setPreviewing(null)} />
      <TaskLauncherDialog
        type={taskLauncher}
        busy={taskStarting}
        onClose={() => setTaskLauncher(null)}
        onStart={handleStartTask}
      />
      <TaskProgressDialog
        task={taskDetail}
        stopping={taskStopping}
        onClose={() => setTaskDetail(null)}
        onStop={handleStopTask}
      />
      <Dialog
        open={reportQuestion !== null}
        title={reportQuestion ? `${reportQuestion.id} 的用户反馈` : '用户反馈'}
        description="反馈绑定了学生当时看到的题面；编辑或停用会自动影响后续作答，历史试卷与做题记录仍保留原题面。"
        onClose={() => setReportQuestion(null)}
        footer={
          reportQuestion ? (
            <>
              <Button onClick={() => requestDismissReports(reportQuestion)}>忽略这些反馈</Button>
              {reportQuestion.enable !== false && (
                <Button
                  variant="danger"
                  onClick={() => {
                    setReportQuestion(null);
                    requestQuestionStatus(reportQuestion, false);
                  }}
                >
                  <Ban size={14} /> 先停用
                </Button>
              )}
              <Button
                variant="primary"
                onClick={() => {
                  setReportQuestion(null);
                  setEditing(reportQuestion);
                }}
              >
                <Edit3 size={14} /> 编辑修复
              </Button>
            </>
          ) : undefined
        }
      >
        <div className="space-y-3">
          {reportsLoading && <p className="py-8 text-center text-sm text-text-dim">加载反馈中…</p>}
          {!reportsLoading && reports.length === 0 && (
            <p className="py-8 text-center text-sm text-text-dim">没有待处理反馈</p>
          )}
          {!reportsLoading &&
            reports.map(report => (
              <Card key={report.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-500">
                    <Flag size={12} /> {report.source === 'exam' ? '考试反馈' : '复习反馈'}
                  </span>
                  <span className="text-xs text-text-dim">
                    题库版本 {report.publishedRevision} · {formatDate(report.createdAt)}
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium leading-relaxed text-text">
                  {report.reason}
                </p>
                <div className="mt-3 rounded-xl bg-surface2 px-3 py-2.5">
                  <p className="text-[11px] font-medium text-text-dim">学生当时看到的题目</p>
                  <p className="mt-1 line-clamp-4 text-xs leading-relaxed text-text">
                    {report.questionSnapshot.question}
                  </p>
                </div>
              </Card>
            ))}
        </div>
      </Dialog>
      <Dialog
        open={pendingAction !== null}
        title={
          pendingAction?.type === 'dismiss'
            ? '忽略这些反馈？'
            : isSingleRestore
              ? '恢复这道题？'
              : pendingAction?.enable
                ? '启用所选题目？'
                : '禁用所选题目？'
        }
        description={
          pendingAction?.type === 'dismiss'
            ? '确认题目无需修改后，可将这些反馈移出待处理列表，操作会保留记录。'
            : isSingleRestore
              ? '恢复后，后续新作答可以再次抽到这道题。'
              : pendingAction
                ? `本次操作包含 ${pendingAction.ids.length} 道题，操作后立即对后续新作答生效。`
                : undefined
        }
        dismissible={!saving}
        onClose={closeActionDialog}
        footer={
          <>
            <Button onClick={closeActionDialog} disabled={saving}>
              取消
            </Button>
            <Button
              variant={
                pendingAction?.type === 'batch' && !pendingAction.enable ? 'danger' : 'primary'
              }
              onClick={handleConfirmAction}
              disabled={saving}
            >
              {saving
                ? '处理中…'
                : pendingAction?.type === 'dismiss'
                  ? '确认忽略'
                  : isSingleRestore
                    ? '确认恢复'
                    : pendingAction?.enable
                      ? '确认启用'
                      : '确认禁用'}
            </Button>
          </>
        }
      >
        {((pendingAction?.type === 'batch' && !pendingAction.enable) ||
          pendingAction?.type === 'dismiss') && (
          <label className="block text-sm font-medium text-text">
            {pendingAction.type === 'dismiss' ? '忽略原因' : '禁用原因'}
            <textarea
              data-dialog-autofocus
              value={actionReason}
              onChange={event => setActionReason(event.target.value)}
              rows={4}
              maxLength={500}
              placeholder={
                pendingAction.type === 'dismiss'
                  ? '说明为什么确认题目无需修改'
                  : '说明题目需要下线的原因，方便后续修复'
              }
              className="mt-2 w-full resize-y rounded-xl border border-border bg-surface2 px-3 py-2 text-sm text-text outline-none transition-colors placeholder:text-text-dim/60 focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
        )}
        {actionError && (
          <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {actionError}
          </p>
        )}
      </Dialog>
    </main>
  );
}
