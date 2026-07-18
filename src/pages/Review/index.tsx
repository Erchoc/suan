import { motion } from 'framer-motion';
import { BookOpen, ChevronDown, ChevronRight, ListChecks, Search, Star, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { graphData } from '../../data/kpIndex';
import { useQuestions } from '../../hooks/useQuestions';
import { useExamStore } from '../../stores/examStore';
import { useReviewStore } from '../../stores/reviewStore';
import type { ExamSession, Question, ReviewSession, ReviewSource } from '../../types';
import { judgeQuestion } from '../../utils/judgeAnswer';

// Utilities.

function getWrongQuestionIds(
  sessions: Record<string, ExamSession>,
  filterSessionIds?: string[],
): Set<string> {
  const wrongIds = new Set<string>();
  Object.values(sessions).forEach(session => {
    if (!session.submittedAt) return;
    if (filterSessionIds?.length && !filterSessionIds.includes(session.sessionId)) return;
    session.questions.forEach(q => {
      if (!judgeQuestion(q, session.answers[q.id] ?? [], session.choiceAnswers?.[q.id]))
        wrongIds.add(q.id);
    });
  });
  return wrongIds;
}

function getBookmarkedQuestionIds(
  examSessions: Record<string, ExamSession>,
  reviewSessions: Record<string, ReviewSession>,
): Set<string> {
  const ids = new Set<string>();
  Object.values(examSessions).forEach(s => s.bookmarks?.forEach((id: string) => ids.add(id)));
  Object.values(reviewSessions).forEach(s => s.bookmarks?.forEach((id: string) => ids.add(id)));
  return ids;
}

// Three-state checkbox with indeterminate support.

type TriState = 'all' | 'some' | 'none';

function TriCheckbox({ state, onChange }: { state: TriState; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some';
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === 'all'}
      onChange={onChange}
      className="flex-shrink-0 w-3.5 h-3.5 cursor-pointer accent-accent"
    />
  );
}

function triState(kpIds: string[], sel: Set<string>): TriState {
  const n = kpIds.filter(id => sel.has(id)).length;
  if (n === 0) return 'none';
  if (n === kpIds.length) return 'all';
  return 'some';
}

// Multi-dimensional knowledge point selector.

interface KPSelectorProps {
  selectedKpIds: Set<string>;
  onChange: (ids: Set<string>) => void;
  kpQuestionCount: Map<string, number>;
  initialGrade?: number; // 1-6, from ?kp= URL param
}

function KPSelector({ selectedKpIds, onChange, kpQuestionCount, initialGrade }: KPSelectorProps) {
  const [activeGrade, setActiveGrade] = useState(initialGrade ?? 1);
  const [query, setQuery] = useState('');
  const [openDomains, setOpenDomains] = useState<Set<string>>(new Set());
  const [openUnits, setOpenUnits] = useState<Set<string>>(new Set());

  const toggleKP = (kpId: string) => {
    const next = new Set(selectedKpIds);
    if (next.has(kpId)) next.delete(kpId);
    else next.add(kpId);
    onChange(next);
  };

  const toggleUnit = (kpIds: string[]) => {
    const next = new Set(selectedKpIds);
    const state = triState(kpIds, next);
    if (state === 'all') kpIds.forEach(id => next.delete(id));
    else kpIds.forEach(id => next.add(id));
    onChange(next);
  };

  const toggleDomain = (kpIds: string[]) => {
    const next = new Set(selectedKpIds);
    const state = triState(kpIds, next);
    if (state === 'all') kpIds.forEach(id => next.delete(id));
    else kpIds.forEach(id => next.add(id));
    onChange(next);
  };

  const toggleDomainOpen = (id: string) =>
    setOpenDomains(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleUnitOpen = (id: string) =>
    setOpenUnits(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Search across grades and show every match.
  const searchResults = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return null;
    const results: {
      gradeName: string;
      gradeColor: string;
      domainName: string;
      unitName: string;
      kpId: string;
      kpName: string;
    }[] = [];
    graphData.grades.forEach(grade => {
      grade.domains.forEach(domain => {
        domain.units.forEach(unit => {
          unit.kps.forEach(kp => {
            if (
              (kp.name.toLowerCase().includes(q) ||
                kp.id.includes(q) ||
                unit.name.toLowerCase().includes(q) ||
                domain.name.toLowerCase().includes(q)) &&
              (kpQuestionCount.get(kp.id) ?? 0) > 0
            ) {
              results.push({
                gradeName: grade.name,
                gradeColor: grade.color,
                domainName: domain.name,
                unitName: unit.name,
                kpId: kp.id,
                kpName: kp.name,
              });
            }
          });
        });
      });
    });
    return results;
  }, [query, kpQuestionCount]);

  const currentGrade = graphData.grades[activeGrade - 1];
  const gradeColor = currentGrade?.color ?? '#ff8906';

  // Selected question count for the current grade.
  const selectedCountInGrade = useMemo(() => {
    let count = 0;
    currentGrade?.domains.forEach(d =>
      d.units.forEach(u =>
        u.kps.forEach(kp => {
          if (selectedKpIds.has(kp.id)) count += kpQuestionCount.get(kp.id) ?? 0;
        }),
      ),
    );
    return count;
  }, [currentGrade, selectedKpIds, kpQuestionCount]);

  const totalSelected = useMemo(() => {
    let count = 0;
    selectedKpIds.forEach(id => {
      count += kpQuestionCount.get(id) ?? 0;
    });
    return count;
  }, [selectedKpIds, kpQuestionCount]);

  return (
    <div className="flex flex-col gap-3">
      {/* Search field. */}
      <div className="relative">
        <Search
          size={13}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim/60 pointer-events-none"
        />
        <input
          type="text"
          placeholder="搜索领域、单元或知识点..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full pl-8 pr-8 py-1.5 text-sm bg-surface2 border border-border rounded-lg text-text placeholder:text-text-dim/40 focus:outline-none focus:border-accent"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-dim/60 hover:text-text"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Search results. */}
      {searchResults ? (
        <div className="max-h-64 overflow-y-auto flex flex-col gap-0.5 pr-1">
          {searchResults.length === 0 ? (
            <p className="text-sm text-text-dim/60 px-2 py-3 text-center">没有匹配的知识点</p>
          ) : (
            searchResults.map(r => {
              const checked = selectedKpIds.has(r.kpId);
              const count = kpQuestionCount.get(r.kpId) ?? 0;
              return (
                <label
                  key={r.kpId}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface2/60 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleKP(r.kpId)}
                    className="accent-accent flex-shrink-0 w-3.5 h-3.5"
                  />
                  <span className="text-sm flex-1 text-text-dim group-hover:text-text transition-colors">
                    {r.kpName}
                  </span>
                  <span className="text-xs text-text-dim/50 hidden sm:block">
                    {r.domainName} · {r.unitName}
                  </span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded font-medium"
                    style={{ background: `${r.gradeColor}18`, color: r.gradeColor }}
                  >
                    {r.gradeName.slice(0, 1)}
                  </span>
                  <span className="text-xs text-text-dim/50">{count}题</span>
                </label>
              );
            })
          )}
        </div>
      ) : (
        <>
          {/* Horizontal grade tabs. */}
          <div className="flex gap-1 overflow-x-auto pb-0.5 no-scrollbar">
            {graphData.grades.map((grade, gi) => {
              const gNum = gi + 1;
              const gradeKpIds = grade.domains.flatMap(d =>
                d.units.flatMap(u => u.kps.map(k => k.id)),
              );
              const selCount = gradeKpIds.filter(id => selectedKpIds.has(id)).length;
              const active = activeGrade === gNum;
              return (
                <button
                  key={grade.id}
                  onClick={() => setActiveGrade(gNum)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    active ? 'text-white' : 'bg-surface2 text-text-dim hover:text-text'
                  }`}
                  style={active ? { background: grade.color } : undefined}
                >
                  {grade.name}
                  {selCount > 0 && !active && <span className="ml-1 opacity-70">·{selCount}</span>}
                </button>
              );
            })}
          </div>

          {/* Current-grade domain-to-unit-to-knowledge-point tree. */}
          <div className="max-h-64 overflow-y-auto flex flex-col gap-0.5 pr-1">
            {currentGrade?.domains.map(domain => {
              const domainKpIds = domain.units
                .flatMap(u => u.kps.map(k => k.id))
                .filter(id => (kpQuestionCount.get(id) ?? 0) > 0);
              if (domainKpIds.length === 0) return null;
              const domainState = triState(domainKpIds, selectedKpIds);
              const domainOpen = openDomains.has(domain.id);
              const domainCount = domainKpIds.reduce(
                (s, id) => s + (kpQuestionCount.get(id) ?? 0),
                0,
              );

              return (
                <div key={domain.id}>
                  {/* Domain row. */}
                  <div className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-surface2/60 group">
                    <TriCheckbox state={domainState} onChange={() => toggleDomain(domainKpIds)} />
                    <button
                      onClick={() => toggleDomainOpen(domain.id)}
                      className="flex-1 flex items-center gap-1.5 text-left"
                    >
                      <span className="text-sm font-medium text-text">
                        {domain.icon} {domain.name}
                      </span>
                      <span className="text-xs text-text-dim/50 ml-auto">{domainCount}题</span>
                      <span className="text-text-dim/50">
                        {domainOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </span>
                    </button>
                  </div>

                  {/* Unit list. */}
                  {domainOpen && (
                    <div className="pl-5 flex flex-col gap-0.5">
                      {domain.units.map(unit => {
                        const unitKpIds = unit.kps
                          .map(k => k.id)
                          .filter(id => (kpQuestionCount.get(id) ?? 0) > 0);
                        if (unitKpIds.length === 0) return null;
                        const unitState = triState(unitKpIds, selectedKpIds);
                        const unitOpen = openUnits.has(unit.id);
                        const unitCount = unitKpIds.reduce(
                          (s, id) => s + (kpQuestionCount.get(id) ?? 0),
                          0,
                        );

                        return (
                          <div key={unit.id}>
                            {/* Unit row. */}
                            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface2/60 group">
                              <TriCheckbox
                                state={unitState}
                                onChange={() => toggleUnit(unitKpIds)}
                              />
                              <button
                                onClick={() => toggleUnitOpen(unit.id)}
                                className="flex-1 flex items-center gap-1.5 text-left"
                              >
                                <span className="text-sm text-text-dim group-hover:text-text transition-colors">
                                  {unit.name}
                                </span>
                                <span className="text-xs text-text-dim/40 ml-auto">
                                  {unitCount}题
                                </span>
                                <span className="text-text-dim/40">
                                  {unitOpen ? (
                                    <ChevronDown size={12} />
                                  ) : (
                                    <ChevronRight size={12} />
                                  )}
                                </span>
                              </button>
                            </div>

                            {/* Knowledge point list. */}
                            {unitOpen && (
                              <div className="pl-5 flex flex-col gap-0.5">
                                {unit.kps.map(kp => {
                                  const count = kpQuestionCount.get(kp.id) ?? 0;
                                  if (count === 0) return null;
                                  return (
                                    <label
                                      key={kp.id}
                                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface2/60 cursor-pointer group"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selectedKpIds.has(kp.id)}
                                        onChange={() => toggleKP(kp.id)}
                                        className="accent-accent flex-shrink-0 w-3.5 h-3.5"
                                      />
                                      <span className="text-xs flex-1 text-text-dim group-hover:text-text transition-colors">
                                        {kp.name}
                                      </span>
                                      <span className="text-xs text-text-dim/40">{count}题</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Selection summary. */}
      {selectedKpIds.size > 0 && (
        <div className="flex items-center justify-between text-xs text-text-dim/70">
          <span>
            已选 <span className="text-accent font-medium">{selectedKpIds.size}</span> 个知识点，共{' '}
            <span className="text-accent font-medium">{totalSelected}</span> 道题
          </span>
          {!searchResults && selectedCountInGrade > 0 && (
            <span style={{ color: gradeColor }}>本年级已选 {selectedCountInGrade} 题</span>
          )}
          <button
            onClick={() => onChange(new Set())}
            className="text-text-dim/50 hover:text-text-dim transition-colors ml-2"
          >
            清空
          </button>
        </div>
      )}
    </div>
  );
}

// Main page.

export default function ReviewEntry() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { sessions: examSessions } = useExamStore();
  const { sessions: reviewSessions, createSession } = useReviewStore();
  const { questions: allQuestions, loading } = useQuestions();

  const preKp = searchParams.get('kp');
  const preSession = searchParams.get('session');

  const [wrongSessionIds, setWrongSessionIds] = useState<string[]>(preSession ? [preSession] : []);
  const [includeAllWrong, setIncludeAllWrong] = useState(false);
  const [includeBookmarks, setIncludeBookmarks] = useState(false);
  const [selectedKpIds, setSelectedKpIds] = useState<Set<string>>(
    preKp ? new Set([preKp]) : new Set(),
  );

  // Infer the initial grade tab from ?kp=, for example "1-3" selects grade 1.
  const initialGrade = useMemo(() => {
    if (!preKp) return 1;
    const m = preKp.match(/^(\d+)-/);
    if (m) return Math.min(6, Math.max(1, parseInt(m[1], 10)));
    return 1;
  }, [preKp]);

  const submittedSessions = Object.values(examSessions).filter(s => s.submittedAt);

  const kpQuestionCount = useMemo(() => {
    const map = new Map<string, number>();
    allQuestions.forEach(q => map.set(q.kp_id, (map.get(q.kp_id) ?? 0) + 1));
    return map;
  }, [allQuestions]);

  const totalQuestions = useMemo<Question[]>(() => {
    const seenIds = new Set<string>();
    const merged: Question[] = [];
    const qMap = new Map(allQuestions.map(q => [q.id, q]));

    const add = (ids: Set<string>) => {
      ids.forEach(id => {
        if (!seenIds.has(id)) {
          const q = qMap.get(id);
          if (q) {
            seenIds.add(id);
            merged.push(q);
          }
        }
      });
    };

    if (includeAllWrong || wrongSessionIds.length > 0) {
      add(getWrongQuestionIds(examSessions, includeAllWrong ? undefined : wrongSessionIds));
    }
    if (includeBookmarks) add(getBookmarkedQuestionIds(examSessions, reviewSessions));
    if (selectedKpIds.size > 0) {
      const kpQIds = new Set<string>();
      allQuestions.forEach(q => {
        if (selectedKpIds.has(q.kp_id)) kpQIds.add(q.id);
      });
      add(kpQIds);
    }
    return merged;
  }, [
    includeAllWrong,
    wrongSessionIds,
    includeBookmarks,
    selectedKpIds,
    examSessions,
    reviewSessions,
    allQuestions,
  ]);

  const canStart = totalQuestions.length > 0;

  const handleStart = () => {
    const sources: ReviewSource[] = [];
    if (includeAllWrong || wrongSessionIds.length > 0)
      sources.push({ type: 'report', sessionIds: includeAllWrong ? [] : wrongSessionIds });
    if (includeBookmarks) sources.push({ type: 'bookmarks' });
    if (selectedKpIds.size > 0) sources.push({ type: 'kps', kpIds: [...selectedKpIds] });
    navigate(`/review/${createSession(sources, totalQuestions)}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-14 flex items-center justify-center text-text-dim/60">
        加载题库中...
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-14" style={{ background: 'var(--bg)' }}>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-brush text-3xl text-accent mb-1">复习模式</h1>
          <p className="text-text-dim/70 mb-8">选择复习内容，答后即时反馈，无时间压力</p>

          <div className="flex flex-col gap-4">
            {/* Incorrect-question collection. */}
            <div className="bg-surface border border-border rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-accent2/15 flex items-center justify-center flex-shrink-0">
                  <BookOpen size={18} className="text-accent2" />
                </div>
                <div>
                  <h2 className="font-medium">错题本</h2>
                  <p className="text-xs text-text-dim/60">来自历次练习、考试、摸底的答错题目</p>
                </div>
              </div>

              {submittedSessions.length === 0 ? (
                <p className="text-sm text-text-dim/60">暂无已完成的考试记录</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {submittedSessions.map(session => {
                    const date = new Date(session.startedAt ?? 0).toLocaleDateString('zh-CN');
                    const wrongCount = getWrongQuestionIds({ [session.sessionId]: session }).size;
                    const checked = wrongSessionIds.includes(session.sessionId);
                    return (
                      <label
                        key={session.sessionId}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked && !includeAllWrong}
                          disabled={includeAllWrong}
                          onChange={() =>
                            setWrongSessionIds(prev =>
                              checked
                                ? prev.filter(id => id !== session.sessionId)
                                : [...prev, session.sessionId],
                            )
                          }
                          className="accent-accent w-3.5 h-3.5 flex-shrink-0"
                        />
                        <span className="text-sm flex-1">
                          {session.config.gradeNum}年级 {session.config.semester}学期 · {date}
                        </span>
                        <Badge color="#e63946">{wrongCount} 错题</Badge>
                      </label>
                    );
                  })}
                  <label className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface2 cursor-pointer border border-dashed border-border mt-1">
                    <input
                      type="checkbox"
                      checked={includeAllWrong}
                      onChange={e => {
                        setIncludeAllWrong(e.target.checked);
                        setWrongSessionIds([]);
                      }}
                      className="accent-accent w-3.5 h-3.5 flex-shrink-0"
                    />
                    <span className="text-sm text-text-dim/70">全部历史错题汇总</span>
                    <Badge color="#a7a9be">{getWrongQuestionIds(examSessions).size} 道</Badge>
                  </label>
                </div>
              )}
            </div>

            {/* Bookmarks collection. */}
            <div className="bg-surface border border-border rounded-2xl p-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center flex-shrink-0">
                  <Star size={18} className="text-accent" />
                </div>
                <div className="flex-1">
                  <h2 className="font-medium">收藏本</h2>
                  <p className="text-xs text-text-dim/60">你主动收藏的好题、易错题、不熟题</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-text-dim/60">
                    {getBookmarkedQuestionIds(examSessions, reviewSessions).size} 道
                  </span>
                  {getBookmarkedQuestionIds(examSessions, reviewSessions).size > 0 && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeBookmarks}
                        onChange={e => setIncludeBookmarks(e.target.checked)}
                        className="accent-accent w-3.5 h-3.5"
                      />
                      <span className="text-sm">加入复习</span>
                    </label>
                  )}
                </div>
              </div>
              {getBookmarkedQuestionIds(examSessions, reviewSessions).size === 0 && (
                <p className="text-sm text-text-dim/60 mt-3">暂无收藏题目</p>
              )}
            </div>

            {/* Browse by domain, unit, and knowledge point. */}
            <div className="bg-surface border border-border rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-green/15 flex items-center justify-center flex-shrink-0">
                  <ListChecks size={18} className="text-green-400" />
                </div>
                <div>
                  <h2 className="font-medium">按内容选择</h2>
                  <p className="text-xs text-text-dim/60">可按领域、单元或知识点来选题</p>
                </div>
              </div>
              <KPSelector
                selectedKpIds={selectedKpIds}
                onChange={setSelectedKpIds}
                kpQuestionCount={kpQuestionCount}
                initialGrade={initialGrade}
              />
            </div>
          </div>

          {/* Bottom actions. */}
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-text-dim/70">
              {canStart ? (
                <>
                  <span className="text-accent font-medium">{totalQuestions.length}</span>{' '}
                  道题（已合并去重）
                </>
              ) : (
                '请至少选择一个来源'
              )}
            </p>
            <Button variant="primary" disabled={!canStart} onClick={handleStart}>
              开始复习
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
