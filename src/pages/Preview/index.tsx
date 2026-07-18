// src/pages/Preview/index.tsx

import { motion } from 'framer-motion';
import { GraduationCap, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { graphData, kpMap } from '../../data/kpIndex';
import { usePreviewStore } from '../../stores/previewStore';

const MAX_SELECT = 10;

export default function PreviewIndex() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const createSession = usePreviewStore(s => s.createSession);

  const initialKp = searchParams.get('kp');

  const initialGrade = useMemo(() => {
    if (!initialKp) return 1;
    const m = initialKp.match(/^(\d+)-/);
    return m ? Math.min(6, Math.max(1, parseInt(m[1], 10))) : 1;
  }, [initialKp]);

  const [activeGrade, setActiveGrade] = useState(initialGrade);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(
    initialKp && kpMap.has(initialKp) ? new Set([initialKp]) : new Set(),
  );

  const targetRef = useRef<HTMLLabelElement | null>(null);
  useEffect(() => {
    if (initialKp && targetRef.current) {
      setTimeout(
        () => targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
        150,
      );
    }
  }, [initialKp]);

  const toggle = (kpId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(kpId)) {
        next.delete(kpId);
      } else if (next.size < MAX_SELECT) {
        next.add(kpId);
      }
      return next;
    });
  };

  const handleStart = () => {
    if (selected.size === 0) return;
    const sessionId = createSession([...selected]);
    navigate(`/preview/${sessionId}`);
  };

  const currentGrade = graphData.grades[activeGrade - 1];

  // Search results.
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const results: {
      gradeColor: string;
      gradeName: string;
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
              kp.name.toLowerCase().includes(q) ||
              unit.name.toLowerCase().includes(q) ||
              domain.name.toLowerCase().includes(q)
            ) {
              results.push({
                gradeColor: grade.color,
                gradeName: grade.name,
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
  }, [query]);

  return (
    <div className="min-h-screen pt-14" style={{ background: 'var(--bg)' }}>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-brush text-3xl text-accent mb-1">预习模式</h1>
          <p className="text-text-dim/70 mb-6">选择即将学习的知识点，边学边练，无时间压力</p>

          {/* Selection card. */}
          <div className="bg-surface border border-border rounded-2xl p-5 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center flex-shrink-0">
                <GraduationCap size={18} className="text-accent" />
              </div>
              <div>
                <h2 className="font-medium">选择预习内容</h2>
                <p className="text-xs text-text-dim/60">最多同时预习 {MAX_SELECT} 个知识点</p>
              </div>
            </div>

            {/* Search field. */}
            <div className="relative mb-3">
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

            {searchResults ? (
              /* Search results. */
              <div className="max-h-72 overflow-y-auto flex flex-col gap-0.5 pr-1">
                {searchResults.length === 0 ? (
                  <p className="text-sm text-text-dim/60 text-center py-6">没有匹配的知识点</p>
                ) : (
                  searchResults.map(r => {
                    const checked = selected.has(r.kpId);
                    const disabled = !checked && selected.size >= MAX_SELECT;
                    return (
                      <label
                        key={r.kpId}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer group transition-colors ${
                          disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface2/60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => !disabled && toggle(r.kpId)}
                          className="accent-accent flex-shrink-0 w-3.5 h-3.5"
                        />
                        <span className="text-sm flex-1 text-text-dim group-hover:text-text transition-colors">
                          {r.kpName}
                        </span>
                        <span className="text-xs text-text-dim/50 hidden sm:block">
                          {r.domainName} · {r.unitName}
                        </span>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                          style={{ background: `${r.gradeColor}18`, color: r.gradeColor }}
                        >
                          {r.gradeName.slice(0, 1)}年
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            ) : (
              <>
                {/* Horizontal grade tabs. */}
                <div className="flex gap-1 overflow-x-auto pb-0.5 no-scrollbar mb-3">
                  {graphData.grades.map((grade, gi) => {
                    const gNum = gi + 1;
                    const gradeKpIds = grade.domains.flatMap(d =>
                      d.units.flatMap(u => u.kps.map(k => k.id)),
                    );
                    const selCount = gradeKpIds.filter(id => selected.has(id)).length;
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
                        {selCount > 0 && !active && (
                          <span className="ml-1 opacity-70">·{selCount}</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Current-grade knowledge points grouped by unit. */}
                <div className="max-h-72 overflow-y-auto flex flex-col gap-0.5 pr-1">
                  {currentGrade?.domains
                    .flatMap(d => d.units)
                    .map((unit, ui) => (
                      <div key={unit.id} className={ui > 0 ? 'mt-2' : ''}>
                        <p className="text-xs text-text-dim/50 px-2 py-1 font-medium">
                          {unit.name} · {unit.semester}学期
                        </p>
                        {unit.kps.map(kp => {
                          const checked = selected.has(kp.id);
                          const disabled = !checked && selected.size >= MAX_SELECT;
                          return (
                            <label
                              key={kp.id}
                              ref={kp.id === initialKp ? targetRef : undefined}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer group transition-colors ${
                                disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface2/60'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={() => !disabled && toggle(kp.id)}
                                className="accent-accent flex-shrink-0 w-3.5 h-3.5"
                              />
                              <span className="text-sm flex-1 text-text-dim group-hover:text-text transition-colors">
                                {kp.name}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    ))}
                </div>
              </>
            )}

            {/* Selection summary. */}
            {selected.size > 0 && (
              <div className="flex items-center justify-between text-xs text-text-dim/70 mt-3 pt-3 border-t border-border">
                <span>
                  已选 <span className="text-accent font-medium">{selected.size}</span> 个知识点
                </span>
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-text-dim/50 hover:text-text-dim transition-colors"
                >
                  清空
                </button>
              </div>
            )}
          </div>

          {/* Bottom actions. */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-dim/70 leading-normal">
              {selected.size > 0 ? (
                <>
                  已选 <span className="text-accent font-medium">{selected.size}</span> 个（最多{' '}
                  {MAX_SELECT} 个）
                </>
              ) : (
                '请至少选择 1 个知识点'
              )}
            </p>
            <Button variant="primary" disabled={selected.size === 0} onClick={handleStart}>
              开始预习
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
