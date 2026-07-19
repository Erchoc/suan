import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  BookOpen,
  FlaskConical,
  Gamepad2,
  GitFork,
  GraduationCap,
  Moon,
  Sparkles,
  Sun,
  UserRound,
} from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../../contexts/theme';
import { useAuthAvailability } from '../../hooks/useAuthAvailability';
import {
  applyThemeAppearance,
  getNextTheme,
  shouldPreviewThemeOnPointer,
  THEME_APPEARANCE,
} from '../../utils/themeAppearance';

// ─── Navigation configuration ──────────────────────────────
const BOTTOM_NAV = [
  { path: '/', label: '首页', Icon: BarChart3 },
  { path: '/assessment', label: '摸底', Icon: FlaskConical },
  { path: '/review', label: '复习', Icon: BookOpen },
  { path: '/preview', label: '预习', Icon: GraduationCap },
  { path: '/graph', label: '图谱', Icon: GitFork },
];

const TOP_NAV = [
  { path: '/', label: '首页', Icon: BarChart3 },
  { path: '/graph', label: '知识图谱', Icon: GitFork },
  { path: '/assessment', label: '摸底考试', Icon: FlaskConical },
  { path: '/game', label: '游戏模式', Icon: Gamepad2, comingSoon: true },
  { path: '/review', label: '复习', Icon: BookOpen },
  { path: '/preview', label: '预习', Icon: GraduationCap },
];

// ─── Helper hooks ───────────────────────────────────────────
function useIsMobile() {
  const [v, setV] = useState(() => window.matchMedia('(max-width: 639px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const h = (e: MediaQueryListEvent) => setV(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return v;
}

function useIsPWA() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { readonly standalone?: boolean }).standalone === true
  );
}

// ─── Coming Soon Modal ─────────────────────────────────────
function ComingSoonModal({ onClose }: { onClose: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          onClick={e => e.stopPropagation()}
          className="bg-surface border border-border rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl"
        >
          <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-4">
            <Sparkles size={28} className="text-accent" />
          </div>
          <h2 className="font-serif text-xl font-semibold mb-2">寓学于乐</h2>
          <p className="text-text-dim text-sm leading-relaxed mb-2">
            游戏模式正在研发中，我们相信最好的学习来自愉快的体验。
          </p>
          <p className="text-accent text-sm font-medium mb-6">敬请期待 ✨</p>
          <button
            onClick={onClose}
            className="cursor-pointer w-full py-2.5 rounded-xl bg-surface2 hover:bg-border text-sm text-text-dim hover:text-text transition-colors"
          >
            好的，我等
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Desktop top navigation ─────────────────────────────────
function DesktopNav({ showAccount }: { showAccount: boolean }) {
  const { pathname } = useLocation();
  const { theme, toggle } = useTheme();
  const [showComingSoon, setShowComingSoon] = useState(false);

  return (
    <>
      {showComingSoon && <ComingSoonModal onClose={() => setShowComingSoon(false)} />}
      <nav
        className="hidden sm:flex fixed top-0 left-0 right-0 z-50 items-center px-6"
        style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          paddingTop: 'env(safe-area-inset-top)',
          height: 'calc(3.5rem + env(safe-area-inset-top))',
          paddingLeft: 'max(1.5rem, env(safe-area-inset-left))',
          paddingRight: 'max(1.5rem, env(safe-area-inset-right))',
        }}
      >
        <Link to="/" className="flex items-center gap-2 mr-6 flex-shrink-0">
          <span className="font-brush text-2xl text-accent">算道</span>
          <span className="text-xs text-text-dim hidden md:block">小学数学智能助手</span>
        </Link>

        <div className="flex items-center gap-1 flex-1">
          {TOP_NAV.map(({ path, label, Icon, comingSoon }) => {
            const active = pathname === path || (path !== '/' && pathname.startsWith(path));
            if (comingSoon) {
              return (
                <button
                  key={path}
                  onClick={() => setShowComingSoon(true)}
                  className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors text-text-dim hover:text-text hover:bg-surface2"
                >
                  <Icon size={15} />
                  {label}
                </button>
              );
            }
            return (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors
                  ${active ? 'bg-accent/15 text-accent font-medium' : 'text-text-dim hover:text-text hover:bg-surface2'}`}
              >
                <Icon size={15} />
                {label}
              </Link>
            );
          })}
        </div>

        {showAccount && (
          <Link
            to="/account"
            aria-label="家长账号"
            className={`mr-1 flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm transition-colors ${
              pathname === '/account'
                ? 'bg-accent/15 text-accent'
                : 'text-text-dim hover:bg-surface2 hover:text-text'
            }`}
          >
            <UserRound size={16} />
            <span className="hidden lg:inline">账号</span>
          </Link>
        )}

        <button
          type="button"
          onClick={toggle}
          aria-label="深色主题"
          aria-pressed={theme === 'dark'}
          className="cursor-pointer w-8 h-8 flex items-center justify-center rounded-lg text-text-dim hover:text-text hover:bg-surface2 transition-colors"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </nav>
    </>
  );
}

// ─── Mobile safe-area header ────────────────────────────────
function MobileStatusBar({ isPWA, showAccount }: { isPWA: boolean; showAccount: boolean }) {
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();
  const touchPreviewActive = useRef(false);

  const restoreCommittedTheme = () => {
    if (!touchPreviewActive.current) return;
    touchPreviewActive.current = false;
    applyThemeAppearance(theme);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!shouldPreviewThemeOnPointer(event)) return;
    touchPreviewActive.current = true;
    applyThemeAppearance(getNextTheme(theme));
  };

  const handlePointerUp = () => {
    if (!touchPreviewActive.current) return;

    requestAnimationFrame(() => {
      // A normal activation fires click before this frame. Restore only when it was cancelled.
      restoreCommittedTheme();
    });
  };

  const handleToggle = () => {
    touchPreviewActive.current = false;
    toggle();
  };

  if (isPWA) {
    // Replacing this fixed surface forces WebKit to resample the safe-area extension color.
    return (
      <div
        key={`pwa-status-${theme}`}
        data-theme-surface="top"
        data-theme={theme}
        className="sm:hidden fixed top-0 left-0 right-0 z-50"
        style={{
          height: 'env(safe-area-inset-top)',
          backgroundColor: THEME_APPEARANCE[theme].themeColor,
        }}
        aria-hidden
      />
    );
  }

  // Regular mobile browsers use a compact header with the logo and theme toggle.
  return (
    <>
      {/* Remount only this inert fixed layer so WebKit resamples without dropping button focus. */}
      <div
        key={`mobile-status-sample-${theme}`}
        data-theme-surface="top"
        data-theme={theme}
        className="sm:hidden fixed top-0 left-0 right-0 z-40 pointer-events-none"
        style={{
          height: 'calc(env(safe-area-inset-top) + 44px)',
          backgroundColor: THEME_APPEARANCE[theme].themeColor,
        }}
        aria-hidden
      />
      <nav
        data-theme={theme}
        className="sm:hidden fixed top-0 left-0 right-0 z-50 flex items-end px-4 pb-2"
        style={{
          paddingTop: 'max(env(safe-area-inset-top), 8px)',
          backgroundColor: 'var(--bg)',
          borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
          height: 'calc(env(safe-area-inset-top) + 44px)',
        }}
      >
        <Link to="/" className="flex items-center gap-2 flex-1">
          <span className="font-brush text-xl text-accent">算道</span>
        </Link>
        {showAccount && (
          <Link
            to="/account"
            aria-label="家长账号"
            className={`mr-1 flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
              pathname === '/account' ? 'bg-accent/15 text-accent' : 'text-text-dim'
            }`}
          >
            <UserRound size={17} />
          </Link>
        )}
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={restoreCommittedTheme}
          onClick={handleToggle}
          aria-label="深色主题"
          aria-pressed={theme === 'dark'}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-text-dim transition-colors"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </nav>
    </>
  );
}

// ─── Mobile bottom tab bar ──────────────────────────────────
function BottomTabBar() {
  const { pathname } = useLocation();
  const [showComingSoon, setShowComingSoon] = useState(false);

  return (
    <>
      {showComingSoon && <ComingSoonModal onClose={() => setShowComingSoon(false)} />}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: 'var(--bg)',
          borderTop: '1px solid var(--border)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Fixed 50px interaction area */}
        <div className="flex" style={{ height: '50px' }}>
          {BOTTOM_NAV.map(({ path, label, Icon }) => {
            const active = pathname === path || (path !== '/' && pathname.startsWith(path));
            return (
              <Link
                key={path}
                to={path}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors relative"
                style={{ color: active ? 'var(--accent)' : 'var(--text-dim)' }}
              >
                <Icon size={21} strokeWidth={active ? 2.2 : 1.7} />
                <span className="text-[9px] leading-none font-medium">{label}</span>
                {active && (
                  <span
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full"
                    style={{ background: 'var(--accent)' }}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

// ─── Main export ────────────────────────────────────────────
export default function Nav() {
  const isMobile = useIsMobile();
  const isPWA = useIsPWA();
  const { pathname } = useLocation();
  const showAccount = useAuthAvailability();

  if (!isMobile) return <DesktopNav showAccount={showAccount} />;
  if (pathname === '/console' || pathname === '/account') {
    return <MobileStatusBar isPWA={isPWA} showAccount={showAccount} />;
  }
  return (
    <>
      <MobileStatusBar isPWA={isPWA} showAccount={showAccount} />
      <BottomTabBar />
    </>
  );
}
