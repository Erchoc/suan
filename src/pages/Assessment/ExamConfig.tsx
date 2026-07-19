import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Flame,
  Hash,
  History,
  Info,
  Shuffle,
  Timer,
  Zap,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { graphData, kpMap } from '../../data/kpIndex';
import { useQuestions } from '../../hooks/useQuestions';
import { getFlaggedQuestions, useExamStore } from '../../stores/examStore';
import type { DifficultyLevel, Question } from '../../types';

const gradeColors = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#7b2d8b', '#e9c46a'];
const gradeNames = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'];

// Map each difficulty mode to its question difficulty distribution.
const difficultyRatios: Record<DifficultyLevel, Record<string, number>> = {
  basic: { easy: 0.7, medium: 0.3, hard: 0 },
  random: { easy: 0.4, medium: 0.4, hard: 0.2 },
  challenge: { easy: 0.2, medium: 0.3, hard: 0.5 },
};

// Progressive sorting from easy to hard with occasional harder questions.
function progressiveSort(questions: Question[]): Question[] {
  const order = { easy: 0, medium: 1, hard: 2 };
  const sorted = [...questions].sort((a, b) => order[a.difficulty] - order[b.difficulty]);

  const total = sorted.length;
  if (total < 10) return sorted;

  // Locate the boundaries between difficulty segments.
  const easyEnd = sorted.findIndex(q => q.difficulty !== 'easy');
  const medEnd = sorted.findIndex(q => q.difficulty === 'hard');
  const result = [...sorted];

  // Insert one or two medium questions randomly into the first 40% of the easy segment.
  if (easyEnd > 2 && medEnd > easyEnd) {
    const insertCount = Math.min(2, medEnd - easyEnd);
    for (let i = 0; i < insertCount; i++) {
      const fromIdx = easyEnd + i;
      const toIdx = Math.floor(Math.random() * Math.min(easyEnd, Math.floor(total * 0.4))) + 1;
      if (fromIdx < result.length) {
        const [item] = result.splice(fromIdx, 1);
        result.splice(toIdx, 0, item);
      }
    }
  }

  // Insert one or two hard questions randomly into the medium segment.
  const hardStart = result.findIndex(q => q.difficulty === 'hard');
  if (hardStart > 0 && hardStart < result.length) {
    const insertCount = Math.min(2, result.length - hardStart);
    for (let i = 0; i < insertCount; i++) {
      const fromIdx = hardStart + i;
      const midStart = Math.floor(total * 0.3);
      const midEnd = Math.floor(total * 0.7);
      const toIdx = midStart + Math.floor(Math.random() * (midEnd - midStart));
      if (fromIdx < result.length && toIdx < fromIdx) {
        const [item] = result.splice(fromIdx, 1);
        result.splice(toIdx, 0, item);
      }
    }
  }

  return result;
}

// Question selection logic.
// The base scope includes all prior-grade content plus the first semester of the
// current grade for second-semester students. It also includes selected units in
// the current semester. An empty selectedUnitIds means all units, while __none__
// represents an explicit clear operation.
function pickQuestions(
  allQuestions: Question[],
  gradeNum: number,
  semester: '上' | '下',
  selectedUnitIds: Set<string>,
  difficulty: DifficultyLevel,
  questionCount: number,
  filterChineseInput = false,
): Question[] {
  const allKPs = Array.from(kpMap.values());

  // Include the previous grade.
  const prevGradeKPs = gradeNum > 1 ? allKPs.filter(k => k.gradeNum === gradeNum - 1) : [];

  // Include the current grade's first semester for second-semester students.
  const prevSemKPs =
    semester === '下' ? allKPs.filter(k => k.gradeNum === gradeNum && k.unitSemester === '上') : [];

  // Include selected units from the current semester.
  const currentKPs = allKPs.filter(k => k.gradeNum === gradeNum && k.unitSemester === semester);
  let filteredCurrentKPs: typeof currentKPs;
  if (selectedUnitIds.has('__none__')) {
    filteredCurrentKPs = [];
  } else if (selectedUnitIds.size === 0) {
    filteredCurrentKPs = currentKPs;
  } else {
    filteredCurrentKPs = currentKPs.filter(k => selectedUnitIds.has(k.unitId));
  }

  const kpIds = new Set([...prevGradeKPs, ...prevSemKPs, ...filteredCurrentKPs].map(k => k.id));
  const flagged = getFlaggedQuestions();
  const pool = allQuestions.filter(q => {
    if (!kpIds.has(q.kp_id)) return false;
    if (flagged.has(q.id)) return false;
    if (q.enable === false) return false;
    // Filter text-input blanks for younger students who do not use a Chinese keyboard.
    if (filterChineseInput && q.blank_types?.some(t => t === 'text')) return false;
    return true;
  });

  // Sample questions according to the requested difficulty distribution.
  const ratios = difficultyRatios[difficulty];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);

  const byDiff = {
    easy: shuffled.filter(q => q.difficulty === 'easy'),
    medium: shuffled.filter(q => q.difficulty === 'medium'),
    hard: shuffled.filter(q => q.difficulty === 'hard'),
  };

  const easyCount = Math.round(questionCount * ratios.easy);
  const medCount = Math.round(questionCount * ratios.medium);
  const hardCount = questionCount - easyCount - medCount;

  const picked = [
    ...byDiff.easy.slice(0, easyCount),
    ...byDiff.medium.slice(0, medCount),
    ...byDiff.hard.slice(0, hardCount),
  ];

  // Fill any shortfall from the remaining pool.
  if (picked.length < questionCount) {
    const pickedIds = new Set(picked.map(q => q.id));
    const remaining = shuffled.filter(q => !pickedIds.has(q.id));
    picked.push(...remaining.slice(0, questionCount - picked.length));
  }

  return progressiveSort(picked.slice(0, questionCount));
}

// Main component.
const difficultyOptions: {
  value: DifficultyLevel;
  label: string;
  icon: React.ReactNode;
  desc: string;
  color: string;
}[] = [
  {
    value: 'basic',
    label: '基础',
    icon: <Zap size={16} />,
    desc: '建议学校考试经常低于 70 分选择',
    color: '#10b981',
  },
  {
    value: 'random',
    label: '随机',
    icon: <Shuffle size={16} />,
    desc: '各种难度混合，略难于学校试卷',
    color: '#f59e0b',
  },
  {
    value: 'challenge',
    label: '困难',
    icon: <Flame size={16} />,
    desc: '建议学校基本高于 90 分的孩子选择',
    color: '#ef4444',
  },
];

const questionCountPresets = [
  { label: '快速 25 题', value: 25 },
  { label: '标准 50 题', value: 50 },
  { label: '完整 100 题', value: 100 },
];

const timeLimitPresets = [
  { label: '30 分钟', value: 30 },
  { label: '60 分钟', value: 60 },
  { label: '120 分钟', value: 120 },
  { label: '不限时', value: 0 },
];

const difficultyLabelMap: Record<DifficultyLevel, string> = {
  basic: '基础模式',
  random: '随机模式',
  challenge: '困难模式',
};

export default function ExamConfig() {
  const navigate = useNavigate();
  const {
    config,
    sessions,
    setGrade,
    setSemester,
    selectOnlyCurrent,
    selectAll,
    clearAll,
    setDifficulty,
    setQuestionCount,
    setTimeLimit,
    setFilterChineseInput,
    createSession,
  } = useExamStore();

  // Show the eight most recent started exams in reverse chronological order.
  const recentSessions = useMemo(() => {
    return Object.values(sessions)
      .filter(s => s.startedAt)
      .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
      .slice(0, 8);
  }, [sessions]);

  const { questions, version: questionBankVersion } = useQuestions();
  const [copied, setCopied] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');

  const gradeColor = config.gradeNum ? gradeColors[config.gradeNum - 1] : 'var(--accent)';
  const isReady = !!(config.gradeNum && config.semester);

  // Current-semester units grouped by domain for display and selection.
  const currentSemUnitsGrouped = useMemo(() => {
    if (!config.gradeNum || !config.semester) return [];
    const grade = graphData.grades[config.gradeNum - 1];
    const result: {
      domainName: string;
      domainIcon: string;
      units: { id: string; name: string }[];
    }[] = [];
    grade.domains.forEach(domain => {
      const units = domain.units.filter(u => u.semester === config.semester);
      if (units.length > 0) {
        result.push({
          domainName: domain.name,
          domainIcon: domain.icon,
          units: units.map(u => ({ id: u.id, name: u.name })),
        });
      }
    });
    return result;
  }, [config.gradeNum, config.semester]);

  // Flatten all unit IDs in the current semester.
  const currentSemUnitIds = useMemo(
    () => currentSemUnitsGrouped.flatMap(g => g.units.map(u => u.id)),
    [currentSemUnitsGrouped],
  );

  // Expand the empty-set all-selection state into concrete IDs for checkbox state.
  const effectiveSelectedIds = useMemo(() => {
    if (config.selectedUnitIds.has('__none__')) return new Set<string>();
    if (config.selectedUnitIds.size === 0) return new Set(currentSemUnitIds);
    return config.selectedUnitIds;
  }, [config.selectedUnitIds, currentSemUnitIds]);

  const selectedCount = effectiveSelectedIds.size;
  const totalCurrentCount = currentSemUnitIds.length;

  // Toggle one unit while handling the empty-set boundary case.
  const handleToggleUnit = (unitId: string) => {
    const newSet = new Set(effectiveSelectedIds);
    if (newSet.has(unitId)) {
      newSet.delete(unitId);
    } else {
      newSet.add(unitId);
    }
    if (newSet.size === 0) {
      clearAll();
    } else if (newSet.size === currentSemUnitIds.length) {
      selectAll(); // Selecting everything is semantically equivalent to an empty Set.
    } else {
      selectOnlyCurrent([...newSet]);
    }
  };

  // Count base-scope knowledge points from the prior grade and, when applicable, first semester.
  const baseKPCount = useMemo(() => {
    if (!config.gradeNum) return 0;
    const allKPs = Array.from(kpMap.values());
    let count = 0;
    // Previous grade.
    if (config.gradeNum > 1) {
      count += allKPs.filter(k => k.gradeNum === config.gradeNum! - 1).length;
    }
    // Current grade's first semester for second-semester students.
    if (config.semester === '下') {
      count += allKPs.filter(
        k => k.gradeNum === config.gradeNum! && k.unitSemester === '上',
      ).length;
    }
    return count;
  }, [config.gradeNum, config.semester]);

  // Count knowledge points covered by this exam.
  const totalKPCount = useMemo(() => {
    if (!isReady) return 0;
    const currentKPs = Array.from(kpMap.values()).filter(
      k => k.gradeNum === config.gradeNum && k.unitSemester === config.semester,
    );
    const filteredCount = config.selectedUnitIds.has('__none__')
      ? 0
      : config.selectedUnitIds.size === 0
        ? currentKPs.length
        : currentKPs.filter(k => config.selectedUnitIds.has(k.unitId)).length;
    return baseKPCount + filteredCount;
  }, [isReady, config, baseKPCount]);

  // Count available questions.
  const availableQ = useMemo(() => {
    if (!isReady) return 0;
    return pickQuestions(
      questions,
      config.gradeNum!,
      config.semester!,
      config.selectedUnitIds,
      config.difficulty,
      config.questionCount,
      config.filterChineseInput,
    ).length;
  }, [isReady, config, questions]);

  const handleGenerate = () => {
    if (!isReady) return;
    const picked = pickQuestions(
      questions,
      config.gradeNum!,
      config.semester!,
      config.selectedUnitIds,
      config.difficulty,
      config.questionCount,
      config.filterChineseInput,
    );
    const sessionId = createSession(picked, questionBankVersion);
    setGeneratedLink(`${window.location.origin}/exam/${sessionId}`);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStart = () => {
    if (generatedLink) navigate(`/exam/${generatedLink.split('/').pop()!}`);
  };

  return (
    <div className="min-h-screen pt-24 flex justify-center px-4 sm:px-6 py-10">
      <div className="w-full max-w-xl">
        <h1 className="font-serif text-2xl font-semibold mb-1">智能考试配置</h1>
        <p className="text-text-dim text-sm mb-8">完成配置后，生成考试链接分享给孩子作答</p>

        {/* 1. Grade. */}
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-text-dim uppercase tracking-wide mb-3">
            ① 孩子的年级
          </h2>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6].map(n => {
              const active = config.gradeNum === n;
              const c = gradeColors[n - 1];
              return (
                <button
                  key={n}
                  onClick={() => setGrade(n)}
                  className="px-4 py-2 rounded-xl text-sm transition-all"
                  style={{
                    background: active ? `${c}20` : 'var(--surface)',
                    border: `1.5px solid ${active ? c : 'var(--border)'}`,
                    color: active ? c : 'var(--text-dim)',
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {gradeNames[n - 1]}
                </button>
              );
            })}
          </div>
        </section>

        {/* 2. Semester. */}
        <AnimatePresence>
          {config.gradeNum && (
            <motion.section
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 overflow-hidden"
            >
              <h2 className="text-xs font-semibold text-text-dim uppercase tracking-wide mb-3">
                ② 目前在哪个学期
              </h2>
              <div className="flex gap-2">
                {(['上', '下'] as const).map(sem => {
                  const active = config.semester === sem;
                  return (
                    <button
                      key={sem}
                      onClick={() => setSemester(sem)}
                      className="px-5 py-2 rounded-xl text-sm transition-all"
                      style={{
                        background: active ? `${gradeColor}20` : 'var(--surface)',
                        border: `1.5px solid ${active ? gradeColor : 'var(--border)'}`,
                        color: active ? gradeColor : 'var(--text-dim)',
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {sem}学期
                    </button>
                  );
                })}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Text-input filter for grades 1-2. */}
        <AnimatePresence>
          {config.gradeNum && config.gradeNum <= 2 && (
            <motion.section
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 overflow-hidden"
            >
              <label className="flex items-start gap-3 p-4 rounded-xl bg-surface border border-border cursor-pointer group hover:border-text-dim/40 transition-colors">
                <input
                  type="checkbox"
                  checked={config.filterChineseInput}
                  onChange={e => setFilterChineseInput(e.target.checked)}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-text leading-snug">
                    过滤需要中文 / 拼音打字的填空题
                  </p>
                  <p className="text-xs text-text-dim mt-0.5 leading-relaxed">
                    专为不会打字的孩子设计
                  </p>
                </div>
              </label>
            </motion.section>
          )}
        </AnimatePresence>

        {/* 3. Current-semester unit selection. */}
        <AnimatePresence>
          {isReady && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <section className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold text-text-dim uppercase tracking-wide">
                    ③ 本学期还没学到哪些单元？（可取消）
                  </h2>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={selectAll}
                      className="text-xs px-2.5 py-1 rounded-lg bg-surface2 hover:bg-border text-text-dim hover:text-text transition-colors"
                    >
                      全选
                    </button>
                    <button
                      onClick={clearAll}
                      className="text-xs px-2.5 py-1 rounded-lg bg-surface2 hover:bg-border text-text-dim hover:text-text transition-colors"
                    >
                      清空
                    </button>
                  </div>
                </div>

                {/* Base scope description. */}
                {baseKPCount > 0 && (
                  <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-xl bg-blue/10 border border-blue/20 text-xs text-blue">
                    <Info size={13} className="mt-0.5 flex-shrink-0" />
                    <span>
                      考试已自动涵盖
                      {config.semester === '下'
                        ? `${config.gradeNum! > 1 ? `${gradeNames[config.gradeNum! - 2]}全部 + ` : ''}本年级上学期全部内容`
                        : `${gradeNames[(config.gradeNum ?? 1) - 2]}的全部内容`}
                      （{baseKPCount}{' '}
                      个知识点），本学期单元已默认全选。如果还没全部学完，取消未学的单元即可。
                    </span>
                  </div>
                )}
                {config.gradeNum === 1 && config.semester === '上' && (
                  <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-xl bg-amber/10 border border-amber/20 text-xs text-amber-600">
                    <Info size={13} className="mt-0.5 flex-shrink-0" />
                    <span>
                      一年级上学期为起始阶段，已默认全选所有单元，可根据实际进度取消未学的单元。
                    </span>
                  </div>
                )}

                {/* Current-semester units grouped by domain. */}
                <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                  {currentSemUnitsGrouped.length === 0 ? (
                    <p className="text-text-dim text-sm p-4">本学期暂无单元数据</p>
                  ) : (
                    currentSemUnitsGrouped.map((group, gi) => (
                      <div
                        key={group.domainName}
                        className={
                          gi < currentSemUnitsGrouped.length - 1 ? 'border-b border-border' : ''
                        }
                      >
                        {/* Domain heading. */}
                        <div className="px-4 pt-3 pb-1.5 flex items-center gap-1.5">
                          <span className="text-sm">{group.domainIcon}</span>
                          <span className="text-xs font-medium text-text-dim">
                            {group.domainName}
                          </span>
                        </div>
                        {/* Unit list. */}
                        <div className="px-4 pb-3 flex flex-col gap-1">
                          {group.units.map(unit => {
                            const checked = effectiveSelectedIds.has(unit.id);
                            return (
                              <label
                                key={unit.id}
                                className="flex items-center gap-3 py-1.5 cursor-pointer group"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => handleToggleUnit(unit.id)}
                                />
                                <span
                                  className="text-sm transition-colors"
                                  style={{ color: checked ? 'var(--text)' : 'var(--text-dim)' }}
                                >
                                  {unit.name}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Selection count. */}
                <p className="text-xs text-text-dim mt-2 text-right">
                  已选{' '}
                  <span className="font-medium" style={{ color: gradeColor }}>
                    {selectedCount}
                  </span>{' '}
                  / {totalCurrentCount} 个单元
                  {selectedCount === 0 && baseKPCount > 0 && (
                    <span className="ml-1 text-text-dim">（将仅考已学过的历史内容）</span>
                  )}
                  {selectedCount === 0 && baseKPCount === 0 && (
                    <span className="ml-1 text-accent2">（请至少勾选一个单元）</span>
                  )}
                </p>
              </section>

              {/* 4. Exam difficulty. */}
              <section className="mb-6">
                <h2 className="text-xs font-semibold text-text-dim uppercase tracking-wide mb-3">
                  <span className="inline-flex items-center gap-1">④ 试卷难度</span>
                </h2>
                <div className="grid grid-cols-3 gap-2">
                  {difficultyOptions.map(opt => {
                    const active = config.difficulty === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setDifficulty(opt.value)}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-xl text-sm transition-all"
                        style={{
                          background: active ? `${opt.color}15` : 'var(--surface)',
                          border: `1.5px solid ${active ? opt.color : 'var(--border)'}`,
                          color: active ? opt.color : 'var(--text-dim)',
                        }}
                      >
                        {opt.icon}
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-[10px] leading-tight opacity-80">{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* 5. Question count. */}
              <section className="mb-6">
                <h2 className="text-xs font-semibold text-text-dim uppercase tracking-wide mb-3">
                  <span className="inline-flex items-center gap-1">
                    <Hash size={12} /> ⑤ 试题数量
                  </span>
                </h2>
                <div className="flex flex-wrap gap-2 mb-2">
                  {questionCountPresets.map(p => {
                    const active = config.questionCount === p.value;
                    return (
                      <button
                        key={p.value}
                        onClick={() => setQuestionCount(p.value)}
                        className="px-3 py-1.5 rounded-lg text-sm transition-all"
                        style={{
                          background: active ? `${gradeColor}20` : 'var(--surface)',
                          border: `1.5px solid ${active ? gradeColor : 'var(--border)'}`,
                          color: active ? gradeColor : 'var(--text-dim)',
                          fontWeight: active ? 600 : 400,
                        }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-text-dim">自定义:</span>
                    <input
                      type="number"
                      min={10}
                      max={200}
                      value={
                        questionCountPresets.some(p => p.value === config.questionCount)
                          ? ''
                          : config.questionCount
                      }
                      onChange={e => {
                        const v = parseInt(e.target.value, 10);
                        if (!Number.isNaN(v)) setQuestionCount(v);
                      }}
                      placeholder="10-200"
                      className="w-20 px-2 py-1.5 rounded-lg text-sm bg-surface border border-border text-text placeholder:text-text-dim/40 focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>
              </section>

              {/* 6. Time limit. */}
              <section className="mb-6">
                <h2 className="text-xs font-semibold text-text-dim uppercase tracking-wide mb-3">
                  <span className="inline-flex items-center gap-1">
                    <Timer size={12} /> ⑥ 考试时长
                  </span>
                </h2>
                <div className="flex flex-wrap gap-2 mb-2">
                  {timeLimitPresets.map(p => {
                    const active = config.timeLimitMinutes === p.value;
                    return (
                      <button
                        key={p.value}
                        onClick={() => setTimeLimit(p.value)}
                        className="px-3 py-1.5 rounded-lg text-sm transition-all"
                        style={{
                          background: active ? `${gradeColor}20` : 'var(--surface)',
                          border: `1.5px solid ${active ? gradeColor : 'var(--border)'}`,
                          color: active ? gradeColor : 'var(--text-dim)',
                          fontWeight: active ? 600 : 400,
                        }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                  {!timeLimitPresets.some(p => p.value === config.timeLimitMinutes) &&
                    config.timeLimitMinutes > 0 && (
                      <span
                        className="px-3 py-1.5 rounded-lg text-sm border border-border"
                        style={{
                          color: gradeColor,
                          borderColor: gradeColor,
                          background: `${gradeColor}20`,
                          fontWeight: 600,
                        }}
                      >
                        {config.timeLimitMinutes} 分钟
                      </span>
                    )}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-text-dim">自定义:</span>
                    <input
                      type="number"
                      min={10}
                      max={180}
                      value={
                        timeLimitPresets.some(p => p.value === config.timeLimitMinutes)
                          ? ''
                          : config.timeLimitMinutes || ''
                      }
                      onChange={e => {
                        const v = parseInt(e.target.value, 10);
                        if (!Number.isNaN(v)) setTimeLimit(v);
                      }}
                      placeholder="10-180"
                      className="w-20 px-2 py-1.5 rounded-lg text-sm bg-surface border border-border text-text placeholder:text-text-dim/40 focus:outline-none focus:border-accent"
                    />
                    <span className="text-xs text-text-dim">分钟</span>
                  </div>
                </div>
              </section>

              {/* Exam summary. */}
              <div className="bg-surface border border-border rounded-2xl p-4 mb-6">
                <h3 className="text-sm font-medium mb-3">考试摘要</h3>
                <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                  <div>
                    <p className="text-text-dim text-xs mb-0.5">考试对象</p>
                    <p className="font-medium" style={{ color: gradeColor }}>
                      {graphData.grades[(config.gradeNum ?? 1) - 1]?.name} · {config.semester}学期
                    </p>
                  </div>
                  <div>
                    <p className="text-text-dim text-xs mb-0.5">覆盖知识点</p>
                    <p className="font-medium">{totalKPCount} 个</p>
                  </div>
                  <div>
                    <p className="text-text-dim text-xs mb-0.5">难度模式</p>
                    <p className="font-medium">{difficultyLabelMap[config.difficulty]}</p>
                  </div>
                  <div>
                    <p className="text-text-dim text-xs mb-0.5">题数 / 时长</p>
                    <p className="font-medium">
                      {config.questionCount} 题 /{' '}
                      {config.timeLimitMinutes === 0 ? '不限时' : `${config.timeLimitMinutes} 分钟`}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-dim text-xs mb-0.5">基础范围</p>
                    <p className="text-text-dim">{baseKPCount} 个知识点</p>
                  </div>
                  <div>
                    <p className="text-text-dim text-xs mb-0.5">可用题目</p>
                    <p
                      className={
                        availableQ === 0
                          ? 'text-accent2 font-medium'
                          : availableQ < config.questionCount
                            ? 'text-amber-500 font-medium'
                            : 'text-green font-medium'
                      }
                    >
                      {availableQ} 题
                      {availableQ > 0 && availableQ < config.questionCount
                        ? `（将出 ${availableQ} 题）`
                        : ''}
                    </p>
                  </div>
                </div>
                {availableQ === 0 && totalKPCount === 0 && (
                  <p className="mt-3 text-xs text-accent2 bg-accent2/10 rounded-xl px-3 py-2">
                    当前范围无知识点，请至少勾选一个本学期单元
                  </p>
                )}
                {availableQ === 0 && totalKPCount > 0 && (
                  <p className="mt-3 text-xs text-accent2 bg-accent2/10 rounded-xl px-3 py-2">
                    当前范围内题库为空，请先运行{' '}
                    <code className="bg-surface2 px-1 rounded">pnpm run gen:questions</code>{' '}
                    生成题目
                  </p>
                )}
                {availableQ > 0 && availableQ < config.questionCount && (
                  <p className="mt-3 text-xs text-amber-500 bg-amber-500/10 rounded-xl px-3 py-2">
                    当前范围可用 {availableQ} 题，少于设定的 {config.questionCount}{' '}
                    题，将以实际数量出卷
                  </p>
                )}
              </div>

              {/* Generate and share actions. */}
              {!generatedLink ? (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleGenerate}
                  disabled={availableQ === 0}
                  className="w-full sm:w-auto"
                >
                  生成考试链接
                </Button>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="bg-surface2 border border-border rounded-xl p-4">
                    <p className="text-xs text-text-dim mb-2">考试链接（分享给孩子）</p>
                    <div className="flex items-center gap-2">
                      <a
                        href={generatedLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-xs text-accent break-all hover:underline"
                      >
                        {generatedLink}
                      </a>
                      <button
                        onClick={handleCopy}
                        className="p-1.5 hover:bg-surface rounded-lg transition-colors flex-shrink-0"
                      >
                        {copied ? (
                          <Check size={15} className="text-green" />
                        ) : (
                          <Copy size={15} className="text-text-dim" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="primary" size="lg" onClick={handleStart}>
                      直接开始作答
                    </Button>
                    <Button variant="secondary" onClick={handleGenerate}>
                      重新生成
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Exam history. */}
        {recentSessions.length > 0 && (
          <section className="mt-10 pt-8 border-t border-border">
            <h2 className="flex items-center gap-2 text-xs font-semibold text-text-dim uppercase tracking-wide mb-4">
              <History size={13} />
              历史考试记录
            </h2>
            <div className="flex flex-col gap-2">
              {recentSessions.map(s => {
                const cfg = s.config;
                const grade = cfg.gradeNum ? `${cfg.gradeNum}年级` : '—';
                const sem = cfg.semester ? `${cfg.semester}学期` : '';
                const total = s.questions.length;
                const answered = Object.keys(s.answers).filter(id => {
                  const q = s.questions.find(q => q.id === id);
                  if (!q) return false;
                  const qt = q.type || 'fill_blank';
                  const bc = (q.question.match(/____/g) || []).length;
                  const ans = s.answers[id] ?? [];
                  const ca = s.choiceAnswers?.[id];
                  if (qt === 'fill_blank') return bc > 0 && ans.slice(0, bc).every(a => a?.trim());
                  if (qt === 'choice') return !!ca;
                  return bc > 0 && ans.slice(0, bc).every(a => a?.trim()) && !!ca;
                }).length;
                const isSubmitted = !!s.submittedAt;
                const date = new Date(s.startedAt!);
                const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

                return (
                  <div
                    key={s.sessionId}
                    className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-border hover:border-text-dim/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {grade}
                          {sem && ` · ${sem}`}
                        </span>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{
                            background: isSubmitted
                              ? 'rgba(42,157,143,0.15)'
                              : 'rgba(255,137,6,0.12)',
                            color: isSubmitted ? 'var(--green)' : 'var(--accent)',
                          }}
                        >
                          {isSubmitted ? '已完成' : `${answered}/${total} 题`}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-dim mt-0.5">
                        {dateStr} · {total} 题
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isSubmitted ? (
                        <a
                          href={`/report/${s.sessionId}`}
                          className="flex items-center gap-1 text-xs text-green hover:underline px-2 py-1 rounded-lg hover:bg-surface2 transition-colors"
                        >
                          查看报告
                          <ExternalLink size={11} />
                        </a>
                      ) : (
                        <a
                          href={`/exam/${s.sessionId}`}
                          className="flex items-center gap-1 text-xs text-accent hover:underline px-2 py-1 rounded-lg hover:bg-surface2 transition-colors"
                        >
                          继续作答
                          <ChevronRight size={11} />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
