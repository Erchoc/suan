import {
  Archive,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Edit3,
  Eye,
  KeyRound,
  RefreshCw,
  Search,
  UploadCloud,
  X,
  XCircle,
} from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Dialog from '../../components/ui/Dialog';
import Select, { type SelectOption } from '../../components/ui/Select';
import {
  AdminApiError,
  type AdminQuestionFilters,
  type AdminQuestionList,
  batchSetAdminQuestionStatus,
  exportAdminQuestions,
  getAdminSession,
  listAdminQuestions,
  listQuestionAudit,
  loginAdmin,
  publishAdminQuestionBank,
  type QuestionAuditEntry,
  updateAdminQuestion,
} from '../../data/adminQuestionBank';
import type { Question } from '../../types';
import QuestionEditor from './QuestionEditor';

const DEFAULT_FILTERS: AdminQuestionFilters = { page: 1, pageSize: 30 };
const GRADE_OPTIONS = [
  { value: '', label: '全部年级' },
  ...['一', '二', '三', '四', '五', '六'].map(grade => ({
    value: `${grade}年级`,
    label: `${grade}年级`,
  })),
] satisfies SelectOption[];
const SEMESTER_OPTIONS = [
  { value: '', label: '全部学期' },
  { value: '上学期', label: '上学期' },
  { value: '下学期', label: '下学期' },
] satisfies SelectOption[];
const DIFFICULTY_OPTIONS = [
  { value: '', label: '全部难度' },
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' },
] satisfies SelectOption[];
const TYPE_OPTIONS = [
  { value: '', label: '全部题型' },
  { value: 'fill_blank', label: '填空' },
  { value: 'choice', label: '选择' },
  { value: 'mixed', label: '综合' },
] satisfies SelectOption[];
const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已禁用' },
] satisfies SelectOption[];

type PendingAction =
  | { type: 'batch'; enable: boolean; ids: string[] }
  | { type: 'publish'; revision: number };
const ACTION_LABELS: Record<string, string> = {
  seed: '初始化题库',
  update: '编辑题目',
  batch_enable: '批量启用',
  batch_disable: '批量禁用',
  publish: '发布题库',
};

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
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-text-dim">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone}`}>{value}</p>
    </Card>
  );
}

function AuditDrawer({ entries, onClose }: { entries: QuestionAuditEntry[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[75] flex justify-end bg-black/40" role="dialog">
      <button type="button" className="flex-1" aria-label="关闭审计记录" onClick={onClose} />
      <aside className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-bg shadow-2xl">
        <header className="sticky top-0 flex items-center justify-between border-b border-border bg-bg/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-accent">Audit trail</p>
            <h2 className="mt-1 font-serif text-xl font-semibold">最近变更</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-surface2">
            <X size={18} />
          </button>
        </header>
        <div className="space-y-3 p-4">
          {entries.length === 0 && (
            <p className="py-10 text-center text-sm text-text-dim">暂无记录</p>
          )}
          {entries.map(entry => (
            <Card key={entry.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-text">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </p>
                  <p className="mt-1 text-xs text-text-dim">
                    {entry.questionId ?? '全题库'} · 修订 r{entry.revision}
                  </p>
                </div>
                <Clock3 size={15} className="mt-1 flex-shrink-0 text-text-dim" />
              </div>
              <p className="mt-3 text-xs text-text-dim">{formatDate(entry.createdAt)}</p>
            </Card>
          ))}
        </div>
      </aside>
    </div>
  );
}

export default function AdminQuestionBankPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [filters, setFilters] = useState<AdminQuestionFilters>(DEFAULT_FILTERS);
  const [queryInput, setQueryInput] = useState('');
  const [result, setResult] = useState<AdminQuestionList | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Question | null>(null);
  const [audit, setAudit] = useState<QuestionAuditEntry[] | null>(null);
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

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((result?.total ?? 0) / (result?.pageSize ?? filters.pageSize))),
    [filters.pageSize, result],
  );
  const hasUnpublishedChanges =
    !!result && result.meta.draftRevision !== result.meta.publishedRevision;

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

  const requestPublish = () => {
    if (!result || !hasUnpublishedChanges) return;
    setActionError(null);
    setPendingAction({ type: 'publish', revision: result.meta.draftRevision });
  };

  const closeActionDialog = () => {
    setPendingAction(null);
    setActionReason('');
    setActionError(null);
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    const reason = actionReason.trim();
    if (pendingAction.type === 'batch' && !pendingAction.enable && !reason) {
      setActionError('请填写禁用原因，方便后续审计和修复。');
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
        await publishAdminQuestionBank(pendingAction.revision);
      }
      closeActionDialog();
      await load();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '操作失败，请稍后重试。');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setSaving(true);
    setError(null);
    try {
      const exported = await exportAdminQuestions();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(exported.data, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `questions-r${exported.meta.draftRevision}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导出失败');
    } finally {
      setSaving(false);
    }
  };

  const handleAudit = async () => {
    setSaving(true);
    try {
      setAudit((await listQuestionAudit()).data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '审计记录加载失败');
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

  return (
    <main className="min-h-screen bg-bg px-3 pb-24 pt-16 sm:px-6 sm:pt-20">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-col gap-4 py-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-accent">
              <Archive size={14} />
              Content asset console
            </div>
            <h1 className="mt-2 font-serif text-3xl font-semibold text-text">题库资产后台</h1>
            <p className="mt-2 max-w-2xl text-sm text-text-dim">
              编辑先进入草稿；只有显式发布后才更新学生端题库，学生端运行时只读取 D1 发布版本。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleAudit} disabled={saving}>
              <Clock3 size={15} /> 审计
            </Button>
            <Button onClick={handleExport} disabled={saving}>
              <Download size={15} /> 导出
            </Button>
            <Button
              onClick={requestPublish}
              variant="primary"
              disabled={!hasUnpublishedChanges || saving}
            >
              <UploadCloud size={15} />
              {hasUnpublishedChanges ? '发布草稿' : '已是最新'}
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

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="题目总量" value={result?.stats.total ?? '-'} />
          <StatCard label="已启用" value={result?.stats.enabled ?? '-'} tone="text-green" />
          <StatCard label="已禁用" value={result?.stats.disabled ?? '-'} tone="text-accent2" />
          <StatCard label="草稿修订" value={result ? `r${result.meta.draftRevision}` : '-'} />
          <StatCard
            label="线上版本"
            value={result ? `r${result.meta.publishedRevision}` : '-'}
            tone={hasUnpublishedChanges ? 'text-amber-500' : 'text-green'}
          />
        </section>

        <Card className="mt-4 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <form className="flex min-w-0 flex-1 gap-2" onSubmit={handleSearch}>
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Select
                value={filters.grade ?? ''}
                options={GRADE_OPTIONS}
                onChange={value => updateFilter('grade', value || undefined)}
                ariaLabel="按年级筛选"
              />
              <Select
                value={filters.semester ?? ''}
                options={SEMESTER_OPTIONS}
                onChange={value => updateFilter('semester', value || undefined)}
                ariaLabel="按学期筛选"
              />
              <Select
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
                value={filters.type ?? ''}
                options={TYPE_OPTIONS}
                onChange={value =>
                  updateFilter('type', (value || undefined) as AdminQuestionFilters['type'])
                }
                ariaLabel="按题型筛选"
              />
              <Select
                value={filters.status ?? ''}
                options={STATUS_OPTIONS}
                onChange={value =>
                  updateFilter('status', (value || undefined) as AdminQuestionFilters['status'])
                }
                ariaLabel="按状态筛选"
              />
            </div>
            <Button onClick={() => setFilters(DEFAULT_FILTERS)} variant="ghost">
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
          {result && (
            <span className="ml-auto text-xs text-text-dim">
              最近发布：{formatDate(result.meta.publishedAt)}
            </span>
          )}
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
                        <p className="line-clamp-3 text-sm leading-relaxed text-text">
                          {question.question}
                        </p>
                        <p className="mt-1 font-mono text-xs text-text-dim">
                          {question.id} · {question.kp_name}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          <Badge color={enabled ? '#2a9d8f' : '#f25f4c'}>
                            {enabled ? '已启用' : '已禁用'}
                          </Badge>
                          <Badge>{question.type || 'fill_blank'}</Badge>
                          <span className="text-xs text-text-dim">
                            {question.grade} · {question.difficulty}
                          </span>
                        </div>
                        {question.checkMessage && (
                          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-text-dim">
                            {question.checkMessage}
                          </p>
                        )}
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
                        <a
                          href={`/question/${encodeURIComponent(question.id)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg p-2 text-text-dim hover:bg-surface2"
                          aria-label={`预览 ${question.id}`}
                        >
                          <Eye size={16} />
                        </a>
                      </div>
                    </div>
                  </article>
                );
              })}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
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
                  <th className="px-3 py-3">题目 / ID</th>
                  <th className="px-3 py-3">知识点</th>
                  <th className="px-3 py-3">年级学期</th>
                  <th className="px-3 py-3">类型</th>
                  <th className="px-3 py-3">状态</th>
                  <th className="w-28 px-3 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-text-dim">
                      加载题库中…
                    </td>
                  </tr>
                )}
                {!loading && result?.data.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-text-dim">
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
                        <td className="max-w-xl px-3 py-3 align-top">
                          <p className="line-clamp-2 leading-relaxed text-text">
                            {question.question}
                          </p>
                          <p className="mt-1 font-mono text-xs text-text-dim">{question.id}</p>
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
                          <div className="flex flex-col items-start gap-1">
                            <Badge>{question.type || 'fill_blank'}</Badge>
                            <span className="text-xs text-text-dim">{question.difficulty}</span>
                          </div>
                        </td>
                        <td className="max-w-xs px-3 py-3 align-top">
                          <Badge color={enabled ? '#2a9d8f' : '#f25f4c'}>
                            {enabled ? '已启用' : '已禁用'}
                          </Badge>
                          {question.checkMessage && (
                            <p
                              className="mt-2 line-clamp-2 text-xs leading-relaxed text-text-dim"
                              title={question.checkMessage}
                            >
                              {question.checkMessage}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="flex gap-1">
                            <a
                              href={`/question/${encodeURIComponent(question.id)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg p-2 text-text-dim hover:bg-surface2 hover:text-accent"
                              title="预览已发布版本"
                            >
                              <Eye size={15} />
                            </a>
                            <button
                              type="button"
                              onClick={() => setEditing(question)}
                              className="rounded-lg p-2 text-text-dim hover:bg-surface2 hover:text-accent"
                              title="编辑草稿"
                            >
                              <Edit3 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <footer className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-text-dim">
            <span>筛选结果 {result?.total ?? 0} 道</span>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                onClick={() => setFilters(current => ({ ...current, page: current.page - 1 }))}
                disabled={filters.page <= 1 || loading}
              >
                <ChevronLeft size={14} /> 上一页
              </Button>
              <span>
                第 {filters.page} / {totalPages} 页
              </span>
              <Button
                size="sm"
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
      {audit && <AuditDrawer entries={audit} onClose={() => setAudit(null)} />}
      <Dialog
        open={pendingAction !== null}
        title={
          pendingAction?.type === 'publish'
            ? '发布当前草稿？'
            : pendingAction?.enable
              ? '启用所选题目？'
              : '禁用所选题目？'
        }
        description={
          pendingAction?.type === 'publish'
            ? `发布后学生端将读取草稿修订 r${pendingAction.revision}。`
            : pendingAction
              ? `本次操作包含 ${pendingAction.ids.length} 道题，提交后会写入审计记录。`
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
                : pendingAction?.type === 'publish'
                  ? '确认发布'
                  : pendingAction?.enable
                    ? '确认启用'
                    : '确认禁用'}
            </Button>
          </>
        }
      >
        {pendingAction?.type === 'batch' && !pendingAction.enable && (
          <label className="block text-sm font-medium text-text">
            禁用原因
            <textarea
              data-dialog-autofocus
              value={actionReason}
              onChange={event => setActionReason(event.target.value)}
              rows={4}
              maxLength={500}
              placeholder="说明题目需要下线的原因，方便后续修复"
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
