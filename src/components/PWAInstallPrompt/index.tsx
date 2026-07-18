import { useEffect, useState } from 'react';
import { X, Share, Plus, Download } from 'lucide-react';

type Platform = 'ios' | 'android' | null;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'pwa-install-dismissed-until';
const DISMISS_DAYS = 7;

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  if (isIOS) return 'ios';
  if (isAndroid) return 'android';
  return null;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { readonly standalone?: boolean }).standalone === true
  );
}

export default function PWAInstallPrompt() {
  const [platform, setPlatform] = useState<Platform>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // 已安装则永不显示
    if (isStandalone()) return;
    // 7 天内关闭过则不显示
    const until = localStorage.getItem(DISMISSED_KEY);
    if (until && Date.now() < Number(until)) return;

    const p = detectPlatform();
    setPlatform(p);

    if (p === 'android') {
      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e as BeforeInstallPromptEvent);
        setVisible(true);
      };
      window.addEventListener('beforeinstallprompt', handler);
      return () => window.removeEventListener('beforeinstallprompt', handler);
    }

    if (p === 'ios') {
      // iOS 没有 beforeinstallprompt，直接提示
      setVisible(true);
    }
  }, []);

  function dismiss() {
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISSED_KEY, String(until));
    setVisible(false);
  }

  async function handleAndroidInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setVisible(false);
    setDeferredPrompt(null);
  }

  if (!visible || !platform) return null;

  return (
    <div
      className="fixed left-0 right-0 z-50 px-4"
      style={{
        /* 浮在底部 tab bar 上方，避免遮挡 nav 点击区 */
        bottom: 'calc(50px + env(safe-area-inset-bottom, 0px) + 8px)',
        paddingBottom: 0,
      }}
    >
      <div
        className="rounded-2xl p-4 shadow-2xl border flex items-start gap-3"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--text)',
        }}
      >
        {/* App Icon */}
        <img
          src="/apple-touch-icon-180x180.png"
          alt="算道"
          className="w-12 h-12 rounded-xl flex-shrink-0"
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm mb-0.5">添加到主屏幕</div>
          {platform === 'ios' ? (
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
              点击底部
              <span className="inline-flex items-center gap-0.5 mx-1 font-medium" style={{ color: 'var(--accent)' }}>
                <Share size={11} />分享
              </span>
              按钮，然后选择
              <span className="inline-flex items-center gap-0.5 mx-1 font-medium" style={{ color: 'var(--accent)' }}>
                <Plus size={11} />添加到主屏幕
              </span>
              即可像 App 一样使用
            </p>
          ) : (
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
              安装到桌面，获得接近原生 App 的体验
            </p>
          )}

          {platform === 'android' && deferredPrompt && (
            <button
              onClick={handleAndroidInstall}
              className="mt-2 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              <Download size={13} />
              立即安装
            </button>
          )}
        </div>

        {/* Close */}
        <button
          onClick={dismiss}
          className="flex-shrink-0 p-1 rounded-lg"
          style={{ color: 'var(--text-dim)' }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
