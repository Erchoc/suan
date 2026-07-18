import { Link, useLocation } from 'react-router-dom';
import {
  BarChart3, GitFork, FlaskConical, BookOpen, GraduationCap,
  Sun, Moon, Sparkles, Gamepad2,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTheme } from '../../contexts/theme';

// ─── 导航配置 ───────────────────────────────────────────────
const BOTTOM_NAV = [
  { path: '/',           label: '首页',   Icon: BarChart3 },
  { path: '/assessment', label: '摸底',   Icon: FlaskConical },
  { path: '/review',     label: '复习',   Icon: BookOpen },
  { path: '/preview',    label: '预习',   Icon: GraduationCap },
  { path: '/graph',      label: '图谱',   Icon: GitFork },
];

const TOP_NAV = [
  { path: '/',           label: '首页',     Icon: BarChart3 },
  { path: '/graph',      label: '知识图谱', Icon: GitFork },
  { path: '/assessment', label: '摸底考试', Icon: FlaskConical },
  { path: '/game',       label: '游戏模式', Icon: Gamepad2, comingSoon: true },
  { path: '/review',     label: '复习',     Icon: BookOpen },
  { path: '/preview',    label: '预习',     Icon: GraduationCap },
];

// ─── 辅助 hooks ─────────────────────────────────────────────
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

// ─── 桌面端顶部导航 ─────────────────────────────────────────
function DesktopNav() {
  const { pathname } = useLocation();
  const { theme, toggle } = useTheme();
  const [showComingSoon, setShowComingSoon] = useState(false);

  return (
    <>
      {showComingSoon && <ComingSoonModal onClose={() => setShowComingSoon(false)} />}
      <nav className="hidden sm:flex fixed top-0 left-0 right-0 z-50 items-center px-6"
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
                <button key={path} onClick={() => setShowComingSoon(true)}
                  className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors text-text-dim hover:text-text hover:bg-surface2"
                >
                  <Icon size={15} />{label}
                </button>
              );
            }
            return (
              <Link key={path} to={path}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors
                  ${active ? 'bg-accent/15 text-accent font-medium' : 'text-text-dim hover:text-text hover:bg-surface2'}`}
              >
                <Icon size={15} />{label}
              </Link>
            );
          })}
        </div>

        <button onClick={toggle} aria-label="切换主题"
          className="cursor-pointer w-8 h-8 flex items-center justify-center rounded-lg text-text-dim hover:text-text hover:bg-surface2 transition-colors"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </nav>
    </>
  );
}

// ─── 移动端顶部安全区（仅遮住状态栏，毛玻璃） ───────────────
function MobileStatusBar({ isPWA }: { isPWA: boolean }) {
  const { theme, toggle } = useTheme();

  if (isPWA) {
    // 独立 PWA 的安全区使用纯主题背景，避免系统栏与页面主题出现色差。
    return (
      <div
        className="sm:hidden fixed top-0 left-0 right-0 z-50"
        style={{ height: 'env(safe-area-inset-top)', background: 'var(--bg)' }}
        aria-hidden
      />
    );
  }

  // 普通移动浏览器：显示 Logo + 主题切换的紧凑顶栏
  return (
    <nav
      className="sm:hidden fixed top-0 left-0 right-0 z-50 flex items-end px-4 pb-2 backdrop-blur-md"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 8px)',
        background: 'color-mix(in srgb, var(--bg) 92%, transparent)',
        borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
        height: 'calc(env(safe-area-inset-top) + 44px)',
      }}
    >
      <Link to="/" className="flex items-center gap-2 flex-1">
        <span className="font-brush text-xl text-accent">算道</span>
      </Link>
      <button onClick={toggle} aria-label="切换主题"
        className="w-8 h-8 flex items-center justify-center rounded-lg text-text-dim transition-colors"
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </nav>
  );
}

// ─── 移动端底部 Tab Bar ────────────────────────────────────
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
        {/* 50px 固定高度交互区 */}
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

// ─── 主导出 ────────────────────────────────────────────────
export default function Nav() {
  const isMobile = useIsMobile();
  const isPWA = useIsPWA();

  if (!isMobile) return <DesktopNav />;
  return (
    <>
      <MobileStatusBar isPWA={isPWA} />
      <BottomTabBar />
    </>
  );
}
