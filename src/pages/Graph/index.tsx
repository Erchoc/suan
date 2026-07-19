import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  GitMerge,
  Info,
  List,
  Repeat2,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LocalGraph from '../../components/KnowledgeGraph/LocalGraph';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import type { KPWithContext } from '../../data/kpIndex';
import { bridgeMap, getDependents, getFullDepsChain, graphData, kpMap } from '../../data/kpIndex';

// Knowledge point item.
function KPItem({
  kp,
  isSelected,
  onClick,
}: {
  kp: KPWithContext;
  isSelected: boolean;
  onClick: () => void;
}) {
  const isBridge = bridgeMap.has(kp.id);
  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left px-3 py-2 rounded-lg transition-all flex items-center gap-2 group
        ${
          isSelected
            ? 'bg-surface2 border border-border text-text'
            : 'hover:bg-surface2/60 text-text-dim hover:text-text border border-transparent'
        }
      `}
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: kp.gradeColor }} />
      <span className="text-sm flex-1 leading-snug text-left">{kp.name}</span>
      {isBridge && <span className="text-xs flex-shrink-0">🌉</span>}
      {kp.deps.length > 0 && (
        <span className="text-xs text-text-dim flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {kp.deps.length} 前置
        </span>
      )}
    </button>
  );
}

// Unit accordion.
function UnitSection({
  unit,
  semester,
  selectedId,
  query,
  onSelect,
}: {
  unit: (typeof graphData.grades)[0]['domains'][0]['units'][0];
  semester: string;
  selectedId: string | null;
  query: string;
  onSelect: (kp: KPWithContext) => void;
}) {
  const filteredKPs = useMemo(() => {
    const q = query.toLowerCase();
    return unit.kps
      .map(k => kpMap.get(k.id)!)
      .filter(Boolean)
      .filter(k => !q || k.name.toLowerCase().includes(q) || k.id.includes(q));
  }, [unit, query]);

  const [open, setOpen] = useState(false);
  if (filteredKPs.length === 0) return null;

  const semColor = semester === '上' ? '#457b9d' : '#7b2d8b';

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface2/40 transition-colors group"
      >
        <span className="text-text-dim group-hover:text-text transition-colors">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span className="text-xs font-medium text-text-dim flex-1 text-left">{unit.name}</span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
          style={{ background: `${semColor}22`, color: semColor }}
        >
          {semester}
        </span>
        <span className="text-[10px] text-text-dim">{filteredKPs.length}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden pl-4"
          >
            {filteredKPs.map(kp => (
              <KPItem
                key={kp.id}
                kp={kp}
                isSelected={selectedId === kp.id}
                onClick={() => onSelect(kp)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Domain accordion.
function DomainSection({
  domain,
  selectedId,
  query,
  onSelect,
}: {
  domain: (typeof graphData.grades)[0]['domains'][0];
  selectedId: string | null;
  query: string;
  onSelect: (kp: KPWithContext) => void;
}) {
  const [open, setOpen] = useState(true);

  const hasMatch = useMemo(() => {
    if (!query) return true;
    const q = query.toLowerCase();
    return domain.units.some(u =>
      u.kps.some(k => k.name.toLowerCase().includes(q) || k.id.includes(q)),
    );
  }, [domain, query]);

  if (!hasMatch) return null;

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-surface2/60 transition-colors"
      >
        <span className="text-base">{domain.icon}</span>
        <span className="font-medium text-sm flex-1 text-left">{domain.name}</span>
        <span className="text-text-dim">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden pl-2"
          >
            {domain.units.map(unit => (
              <UnitSection
                key={unit.id}
                unit={unit}
                semester={unit.semester}
                selectedId={selectedId}
                query={query}
                onSelect={onSelect}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Main page.
export default function GraphPage() {
  const navigate = useNavigate();
  const [activeGrade, setActiveGrade] = useState(1);
  const [query, setQuery] = useState('');
  const [selectedKP, setSelectedKP] = useState<KPWithContext | null>(null);
  const [mobileTab, setMobileTab] = useState<'list' | 'detail'>('list');
  const searchRef = useRef<HTMLInputElement>(null);

  const currentGrade = graphData.grades[activeGrade - 1];
  const gradeColor = currentGrade?.color ?? '#d97706';

  // Restore the selected knowledge point from the URL hash.
  useEffect(() => {
    const hash = window.location.hash.slice(1); // Remove the leading hash.
    if (hash.startsWith('kp-')) {
      const kpId = hash.slice(3);
      const kp = kpMap.get(kpId);
      if (kp) {
        setSelectedKP(kp);
        setActiveGrade(kp.gradeNum);
      }
    }
  }, []);

  const handleSelect = (kp: KPWithContext) => {
    setSelectedKP(kp);
    if (kp.gradeNum !== activeGrade) {
      setActiveGrade(kp.gradeNum);
    }
    // Update the URL hash for sharing.
    window.location.hash = `kp-${kp.id}`;
    // Switch to the detail view automatically on mobile.
    setMobileTab('detail');
  };

  const globalSearchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return Array.from(kpMap.values())
      .filter(k => k.name.toLowerCase().includes(q) || k.id.includes(q))
      .slice(0, 20);
  }, [query]);

  const deps = selectedKP ? getFullDepsChain(selectedKP.id) : [];
  const dependents = selectedKP ? getDependents(selectedKP.id) : [];
  const directDeps = selectedKP
    ? (selectedKP.deps.map(id => kpMap.get(id)).filter(Boolean) as KPWithContext[])
    : [];

  return (
    <div
      className="h-[calc(100dvh_-_var(--tab-bar-h))] pt-14 flex flex-col overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      {/* Top grade tabs. */}
      <div className="flex-shrink-0 border-b border-border bg-surface/80">
        {/* Grade selection row. */}
        <div className="flex items-center overflow-x-auto px-2">
          {graphData.grades.map((grade, i) => {
            const active = activeGrade === i + 1;
            return (
              <button
                key={grade.id}
                onClick={() => {
                  setActiveGrade(i + 1);
                  setQuery('');
                  setSelectedKP(null);
                  setMobileTab('list');
                }}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-3 text-sm transition-all flex-shrink-0 border-b-2 -mb-px"
                style={{
                  borderBottomColor: active ? grade.color : 'transparent',
                  color: active ? grade.color : 'var(--text-dim)',
                  fontWeight: active ? 600 : 400,
                }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: grade.color }}
                />
                <span className="hidden sm:inline">{grade.name}</span>
                <span className="sm:hidden">{grade.name.replace('年级', '')}</span>
              </button>
            );
          })}
          {/* Place search to the right of grade tabs on wide screens. */}
          <div className="ml-auto flex-shrink-0 py-2 pr-2 hidden sm:block">
            <SearchInput query={query} onChange={setQuery} searchRef={searchRef} />
          </div>
        </div>
        {/* Place search on its own row on mobile. */}
        <div className="sm:hidden px-3 pt-1 pb-2">
          <SearchInput query={query} onChange={setQuery} searchRef={searchRef} fullWidth />
        </div>
      </div>

      {/* Main area. */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left browser pane. */}
        <aside
          className={`
            flex-shrink-0 border-r border-border flex flex-col overflow-hidden bg-surface/50
            w-full md:w-72
            ${mobileTab === 'list' ? 'flex' : 'hidden'} md:flex
          `}
        >
          <div className="flex-1 overflow-y-auto p-3">
            {query.trim() ? (
              <div>
                <p className="text-xs text-text-dim px-2 mb-2">
                  搜索结果 <span className="text-accent">{globalSearchResults.length}</span> 条
                </p>
                {globalSearchResults.length === 0 ? (
                  <p className="text-text-dim text-sm px-2">未找到匹配的知识点</p>
                ) : (
                  globalSearchResults.map(kp => (
                    <KPItem
                      key={kp.id}
                      kp={kp}
                      isSelected={selectedKP?.id === kp.id}
                      onClick={() => handleSelect(kp)}
                    />
                  ))
                )}
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 px-2 mb-3">
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: `${gradeColor}22`, color: gradeColor }}
                  >
                    {currentGrade?.name}
                  </span>
                  <span className="text-xs text-text-dim">
                    {currentGrade?.domains.reduce(
                      (s, d) => s + d.units.reduce((ss, u) => ss + u.kps.length, 0),
                      0,
                    )}{' '}
                    个知识点
                  </span>
                </div>
                {currentGrade?.domains.map(domain => (
                  <DomainSection
                    key={domain.id}
                    domain={domain}
                    selectedId={selectedKP?.id ?? null}
                    query={query}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Right detail pane. */}
        <main
          className={`
            flex-1 overflow-y-auto
            ${mobileTab === 'detail' ? 'block' : 'hidden'} md:block
          `}
        >
          <AnimatePresence mode="wait">
            {!selectedKP ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col items-center justify-center gap-4 text-text-dim"
              >
                <GitMerge size={48} className="opacity-20" />
                <p className="text-lg">从左侧选择一个知识点</p>
                <p className="text-sm opacity-60">查看依赖关系和学习路径</p>
                {/* Mobile hint. */}
                <button
                  onClick={() => setMobileTab('list')}
                  className="md:hidden mt-2 text-sm text-accent underline"
                >
                  去浏览知识点
                </button>
              </motion.div>
            ) : (
              <motion.div
                key={selectedKP.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="p-4 sm:p-6 flex flex-col gap-6 w-full max-w-[1440px] mx-auto"
              >
                {/* Knowledge point information card. */}
                <div
                  className="rounded-2xl p-4 sm:p-5 border"
                  style={{
                    background: `${selectedKP.gradeColor}0d`,
                    borderColor: `${selectedKP.gradeColor}44`,
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <code className="text-xs text-text-dim bg-surface2 px-1.5 py-0.5 rounded">
                          {selectedKP.id}
                        </code>
                        <Badge color={selectedKP.gradeColor}>{selectedKP.gradeName}</Badge>
                        <Badge color="#2563eb">{selectedKP.domainName}</Badge>
                        <Badge color={selectedKP.unitSemester === '上' ? '#2563eb' : '#7b2d8b'}>
                          {selectedKP.unitSemester}学期
                        </Badge>
                        {bridgeMap.has(selectedKP.id) && (
                          <Badge color="var(--bridge)">🌉 {bridgeMap.get(selectedKP.id)}</Badge>
                        )}
                      </div>
                      <h2
                        className="font-serif text-xl sm:text-2xl font-semibold break-words"
                        style={{ color: selectedKP.gradeColor }}
                      >
                        {selectedKP.name}
                      </h2>
                      <p className="text-sm text-text-dim mt-1">{selectedKP.unitName}</p>
                    </div>
                    <button
                      onClick={() => setSelectedKP(null)}
                      className="text-text-dim hover:text-text p-1 flex-shrink-0"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
                  <div className="min-w-0 flex flex-col gap-6">
                    {/* Local relationship graph. */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-sm font-medium">关系图</h3>
                        <span className="text-xs text-text-dim">
                          {directDeps.length > 0 ? `${directDeps.length} 个前置` : '无前置'}
                          {dependents.length > 0 ? ` · ${dependents.length} 个后续` : ' · 无后续'}
                        </span>
                      </div>
                      {directDeps.length === 0 && dependents.length === 0 ? (
                        <div className="bg-surface2 rounded-xl p-6 text-center text-text-dim text-sm">
                          该知识点是独立基础节点，无依赖关系
                        </div>
                      ) : (
                        <div className="h-60 sm:h-80 xl:h-[22rem] rounded-xl overflow-hidden border border-border">
                          <LocalGraph centerKP={selectedKP} onNodeClick={handleSelect} />
                        </div>
                      )}
                      <p className="text-xs text-text-dim mt-2 flex items-center gap-1">
                        <ArrowRight size={10} /> 箭头方向：前置知识点 → 当前知识点 →
                        后续知识点。可点击图中节点跳转。
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Direct prerequisites. */}
                      <div className="bg-surface border border-border rounded-xl p-4">
                        <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                          <span className="text-text-dim">←</span> 学了这些才能学这个
                          <span className="text-xs text-text-dim ml-auto">
                            {directDeps.length} 个
                          </span>
                        </h3>
                        {directDeps.length === 0 ? (
                          <p className="text-xs text-text-dim">无需前置知识，是起点知识</p>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {directDeps.map(d => (
                              <button
                                key={d.id}
                                onClick={() => handleSelect(d)}
                                className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-surface2 transition-colors text-left w-full"
                              >
                                <span
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ background: d.gradeColor }}
                                />
                                <span className="flex-1">{d.name}</span>
                                <span className="text-xs text-text-dim">{d.gradeName}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Direct successors. */}
                      <div className="bg-surface border border-border rounded-xl p-4">
                        <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                          <span className="text-text-dim">→</span> 学会这个才能继续学
                          <span className="text-xs text-text-dim ml-auto">
                            {dependents.length} 个
                          </span>
                        </h3>
                        {dependents.length === 0 ? (
                          <p className="text-xs text-text-dim">该年级段的终点知识</p>
                        ) : (
                          <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                            {dependents.map(d => (
                              <button
                                key={d.id}
                                onClick={() => handleSelect(d)}
                                className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-surface2 transition-colors text-left w-full"
                              >
                                <span
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ background: d.gradeColor }}
                                />
                                <span className="flex-1">{d.name}</span>
                                <span className="text-xs text-text-dim">{d.gradeName}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Full dependency chain. */}
                    {deps.length > 0 && (
                      <div className="bg-surface border border-border rounded-xl p-4">
                        <h3 className="text-sm font-medium mb-3">
                          完整前置链{' '}
                          <span className="text-text-dim text-xs ml-1">
                            （掌握这个知识点需要的全部基础）
                          </span>
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {deps.map(d => (
                            <button
                              key={d.id}
                              onClick={() => handleSelect(d)}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs hover:opacity-80 transition-opacity"
                              style={{
                                background: `${d.gradeColor}18`,
                                border: `1px solid ${d.gradeColor}44`,
                                color: d.gradeColor,
                              }}
                            >
                              <span>{d.name}</span>
                              <span className="opacity-60">{d.gradeName}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Wide-screen learning navigator. */}
                  <aside className="hidden xl:flex sticky top-0 bg-surface border border-border rounded-2xl p-5 flex-col gap-5">
                    <div>
                      <div className="flex items-center gap-2 text-accent mb-3">
                        <GitMerge size={17} />
                        <h3 className="text-sm font-semibold">学习导航</h3>
                      </div>
                      <p className="font-serif text-xl font-semibold text-text">
                        {directDeps.length === 0 && dependents.length === 0
                          ? '独立知识点'
                          : directDeps.length === 0
                            ? '基础起点'
                            : dependents.length === 0
                              ? '阶段终点'
                              : '承上启下'}
                      </p>
                      <p className="text-sm text-text-dim leading-relaxed mt-1">
                        {directDeps.length === 0 && dependents.length === 0
                          ? '没有依赖关系，可以直接进入学习。'
                          : directDeps.length === 0
                            ? `可以直接学习，也是后续 ${dependents.length} 个知识点的基础。`
                            : dependents.length === 0
                              ? `建议先确认 ${directDeps.length} 个直接前置，再完成这个阶段知识点。`
                              : `连接 ${directDeps.length} 个直接前置与 ${dependents.length} 个后续知识点。`}
                      </p>
                    </div>

                    <dl className="border-y border-border divide-y divide-border">
                      <div className="flex items-center justify-between py-3">
                        <dt className="text-sm text-text-dim">直接前置</dt>
                        <dd className="text-sm font-semibold">{directDeps.length}</dd>
                      </div>
                      <div className="flex items-center justify-between py-3">
                        <dt className="text-sm text-text-dim">完整基础链</dt>
                        <dd className="text-sm font-semibold">{deps.length}</dd>
                      </div>
                      <div className="flex items-center justify-between py-3">
                        <dt className="text-sm text-text-dim">可继续学习</dt>
                        <dd className="text-sm font-semibold">{dependents.length}</dd>
                      </div>
                    </dl>

                    {(directDeps[0] || dependents[0]) && (
                      <div className="flex flex-col gap-2">
                        {directDeps[0] && (
                          <button
                            type="button"
                            onClick={() => handleSelect(directDeps[0])}
                            className="text-left rounded-xl border border-border px-3 py-2.5 hover:border-accent/50 hover:bg-accent/5 transition-colors"
                          >
                            <span className="block text-xs text-text-dim mb-0.5">建议先看</span>
                            <span className="block text-sm font-medium truncate">
                              {directDeps[0].name}
                            </span>
                          </button>
                        )}
                        {dependents[0] && (
                          <button
                            type="button"
                            onClick={() => handleSelect(dependents[0])}
                            className="text-left rounded-xl border border-border px-3 py-2.5 hover:border-accent/50 hover:bg-accent/5 transition-colors"
                          >
                            <span className="block text-xs text-text-dim mb-0.5">学完可继续</span>
                            <span className="block text-sm font-medium truncate">
                              {dependents[0].name}
                            </span>
                          </button>
                        )}
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      <Button
                        variant="primary"
                        size="lg"
                        onClick={() => navigate(`/preview?kp=${selectedKP.id}`)}
                        className="w-full justify-center py-3 font-semibold"
                      >
                        <BookOpen size={17} />
                        进入预习
                      </Button>
                      <Button
                        variant="secondary"
                        size="lg"
                        onClick={() => navigate(`/review?kp=${selectedKP.id}`)}
                        className="w-full justify-center py-3 font-semibold"
                      >
                        <Repeat2 size={17} />
                        进入复习
                      </Button>
                    </div>
                  </aside>
                </div>

                {/* Compact-screen actions. */}
                <div className="flex xl:hidden flex-col gap-2 pt-2">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => navigate(`/preview?kp=${selectedKP.id}`)}
                    className="w-full justify-center py-3.5 text-base font-semibold"
                  >
                    <BookOpen size={18} />
                    进入预习
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={() => navigate(`/review?kp=${selectedKP.id}`)}
                    className="w-full justify-center py-3.5 text-base font-semibold"
                  >
                    <Repeat2 size={18} />
                    进入复习
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile bottom tabs. */}
      <div className="md:hidden flex-shrink-0 border-t border-border bg-surface flex items-stretch h-12">
        {/* Compact fixed list button with an icon and short label. */}
        <button
          onClick={() => setMobileTab('list')}
          className={`flex-shrink-0 flex items-center gap-1.5 px-4 border-r border-border text-sm transition-colors ${
            mobileTab === 'list' ? 'text-accent font-medium bg-accent/5' : 'text-text-dim'
          }`}
        >
          <List size={16} />
          列表
        </button>
        {/* Detail button fills the remaining width and truncates the knowledge point name. */}
        <button
          onClick={() => setMobileTab('detail')}
          className={`flex-1 flex items-center gap-2 px-4 text-sm transition-colors overflow-hidden ${
            mobileTab === 'detail' ? 'text-accent font-medium' : 'text-text-dim'
          }`}
        >
          <Info size={16} className="flex-shrink-0" />
          <span className="truncate">{selectedKP ? selectedKP.name : '知识点详情'}</span>
        </button>
      </div>
    </div>
  );
}

// Extracted search input component to avoid duplication.
function SearchInput({
  query,
  onChange,
  searchRef,
  fullWidth,
}: {
  query: string;
  onChange: (v: string) => void;
  searchRef: React.RefObject<HTMLInputElement>;
  fullWidth?: boolean;
}) {
  return (
    <div className="relative">
      <Search
        size={13}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none"
      />
      <input
        ref={searchRef}
        type="text"
        placeholder="搜索全部知识点…"
        value={query}
        onChange={e => onChange(e.target.value)}
        className={`pl-8 pr-8 py-1.5 text-sm bg-surface2 border border-border rounded-lg text-text placeholder:text-text-dim/40 focus:outline-none focus:border-accent ${fullWidth ? 'w-full' : 'w-44'}`}
      />
      {query && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-dim hover:text-text"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
