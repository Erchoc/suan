import { useState, useRef, useEffect, useCallback } from 'react';

const SHOW_THRESHOLD    = 72;   // 拉多少后才出现指示器
const TRIGGER_THRESHOLD = 136;  // 拉多少才触发刷新
const MAX_PULL          = 180;
const SCROLL_DEBOUNCE   = 150;  // ms，scroll 停止后多久允许激活

export default function PullToRefresh() {
  // pullY 用 ref 存真实值（给事件处理器用），同时用 state 驱动渲染
  const pullYRef         = useRef(0);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startYRef      = useRef(0);
  const pullingRef     = useRef(false);
  const isScrollingRef = useRef(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getContainer = useCallback(() => document.getElementById('root'), []);

  // ─── scroll 监听：只在 scrollTop > 0 时标记 isScrolling ─────────────────
  // scrollTop=0 的情况包括：页面从未滚动、ScrollToTop 归零、inertia 到达顶部
  // 这三种情况都不该阻止下拉刷新，所以只在 scrollTop>0 时设标志。
  useEffect(() => {
    const c = getContainer();
    if (!c) return;
    const onScroll = () => {
      if (c.scrollTop <= 0) return;          // ← 关键：到顶/在顶 不更新
      isScrollingRef.current = true;
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => {
        isScrollingRef.current = false;
      }, SCROLL_DEBOUNCE);
    };
    c.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      c.removeEventListener('scroll', onScroll);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, [getContainer]);

  // ─── 触摸事件：不依赖 pullY state，deps 稳定，不频繁 re-attach ──────────
  useEffect(() => {
    const c = getContainer();
    if (!c) return;

    const onTouchStart = (e: TouchEvent) => {
      if (c.scrollTop <= 0 && !isScrollingRef.current && !refreshing) {
        startYRef.current  = e.touches[0].clientY;
        pullingRef.current = true;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || refreshing) return;
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy > 0) {
        const dampened = Math.min(MAX_PULL, dy * 0.4);
        pullYRef.current = dampened;          // 先更新 ref
        setPullY(dampened);                   // 再触发渲染
        if (dampened > 12) e.preventDefault();
      } else {
        pullingRef.current   = false;
        pullYRef.current     = 0;
        setPullY(0);
      }
    };

    const onTouchEnd = () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      if (pullYRef.current >= TRIGGER_THRESHOLD) {  // ← 读 ref，不读 state
        setRefreshing(true);
        setTimeout(() => window.location.reload(), 900);
      } else {
        pullYRef.current = 0;
        setPullY(0);
      }
    };

    c.addEventListener('touchstart', onTouchStart, { passive: true  });
    c.addEventListener('touchmove',  onTouchMove,  { passive: false });
    c.addEventListener('touchend',   onTouchEnd,   { passive: true  });
    return () => {
      c.removeEventListener('touchstart', onTouchStart);
      c.removeEventListener('touchmove',  onTouchMove);
      c.removeEventListener('touchend',   onTouchEnd);
    };
  }, [refreshing, getContainer]); // ← 不包含 pullY，不再频繁 re-attach

  if (pullY < SHOW_THRESHOLD && !refreshing) return null;

  const progress = Math.min((pullY - SHOW_THRESHOLD) / (TRIGGER_THRESHOLD - SHOW_THRESHOLD), 1);
  const isReady  = progress >= 1;

  const R             = 10;
  const circumference = 2 * Math.PI * R;
  const dashOffset    = circumference * (1 - progress);

  const slideProgress = refreshing
    ? 1
    : Math.min((pullY - SHOW_THRESHOLD) / (MAX_PULL - SHOW_THRESHOLD), 1);
  const slideY = (slideProgress - 1) * 60;

  return (
    <div
      className="fixed left-0 right-0 z-[70] flex justify-center pointer-events-none"
      style={{ top: 'env(safe-area-inset-top, 0px)' }}
    >
      <div
        style={{
          transform:  `translateY(${slideY}px)`,
          transition: refreshing ? 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1)' : 'none',
          opacity:    Math.min(slideProgress * 2, 1),
          marginTop:  '8px',
        }}
      >
        <div
          className="flex items-center gap-2.5 pl-3 pr-4 py-2 rounded-full text-sm font-medium shadow-lg backdrop-blur-md select-none whitespace-nowrap transition-colors duration-200"
          style={{
            background: isReady || refreshing
              ? 'var(--accent)'
              : 'color-mix(in srgb, var(--surface) 88%, transparent)',
            border: isReady || refreshing
              ? 'none'
              : '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
            color: isReady || refreshing ? '#fff' : 'var(--text-dim)',
            boxShadow: isReady || refreshing
              ? '0 4px 20px color-mix(in srgb, var(--accent) 35%, transparent)'
              : '0 2px 12px rgba(0,0,0,0.1)',
          }}
        >
          {refreshing ? (
            <svg width="22" height="22" viewBox="0 0 22 22" className="animate-spin">
              <circle cx="11" cy="11" r={R} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
              <circle cx="11" cy="11" r={R} fill="none" stroke="white" strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * 0.75}
                transform="rotate(-90 11 11)"
              />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 22 22">
              <circle cx="11" cy="11" r={R} fill="none"
                stroke={isReady ? 'rgba(255,255,255,0.3)' : 'color-mix(in srgb, var(--text-dim) 30%, transparent)'}
                strokeWidth="2"
              />
              <circle cx="11" cy="11" r={R} fill="none"
                stroke={isReady ? 'white' : 'var(--accent)'}
                strokeWidth="2" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 11 11)"
                style={{ transition: 'stroke-dashoffset 0.05s linear' }}
              />
              <path
                d="M11 7 L11 15 M8 12 L11 15 L14 12"
                fill="none"
                stroke={isReady ? 'white' : 'var(--accent)'}
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                transform={`rotate(${isReady ? 180 : 0} 11 11)`}
                style={{ transition: 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)' }}
              />
            </svg>
          )}
          <span>
            {refreshing ? '刷新中…' : isReady ? '松手即可刷新' : '继续下拉刷新'}
          </span>
        </div>
      </div>
    </div>
  );
}
