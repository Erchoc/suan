import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Button from '../../components/ui/Button';
import {
  AuthApiError,
  type AuthConfig,
  type AuthSession,
  getAuthConfig,
  getAuthSession,
  logoutAuthSession,
  sendSmsCode,
  verifySmsCode,
} from '../../data/auth';

const EMPTY_SESSION: AuthSession = { authenticated: false, user: null };

type LoginMethod = 'phone' | 'wechat';

function statusMessage(error: unknown): string {
  if (error instanceof AuthApiError) return error.message;
  return '网络暂时不可用，请稍后重试';
}

function AccountStory() {
  return (
    <section aria-labelledby="account-title" className="max-w-[42rem]">
      <p className="mb-3 text-sm font-semibold text-accent">家长账号</p>
      <h1
        id="account-title"
        className="max-w-[38rem] font-serif text-[2.35rem] font-semibold leading-[1.22] tracking-tight sm:text-5xl lg:text-[3.5rem]"
      >
        把每次练习，连成孩子的成长轨迹
      </h1>
      <p className="mt-5 max-w-[36rem] text-base leading-8 text-text-dim sm:text-lg">
        一个家长身份，未来承接孩子档案、订阅权益和跨设备学习记录。当前设备上的已有记录仍保存在本机。
      </p>

      <div className="relative mt-10 hidden max-w-[38rem] overflow-hidden border-y border-border py-7 pr-24 lg:block">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-2 -top-12 font-serif text-[9rem] font-semibold leading-none text-accent/[0.07]"
        >
          12
        </div>
        <p className="text-sm font-medium text-text-dim">从一道题开始</p>
        <p className="mt-2 font-serif text-3xl font-semibold tracking-wide text-text">
          12 + □ = 20
        </p>
        <div className="mt-7 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-3 text-sm">
          <span className="font-medium">完成练习</span>
          <ArrowRight size={16} className="text-accent" aria-hidden />
          <span className="font-medium">发现重点</span>
          <ArrowRight size={16} className="text-accent" aria-hidden />
          <span className="font-medium">安排复习</span>
        </div>
      </div>
    </section>
  );
}

function AccountLoading() {
  return (
    <main className="min-h-[100dvh] bg-bg pt-14" aria-busy="true">
      <div className="mx-auto grid min-h-[calc(100dvh-3.5rem)] w-full max-w-[1240px] gap-8 px-5 py-8 sm:px-8 sm:py-12 lg:grid-cols-[minmax(0,1.08fr)_minmax(24rem,0.92fr)] lg:items-center lg:gap-14 lg:px-10 lg:py-10 xl:gap-20">
        <div className="animate-pulse space-y-5 motion-reduce:animate-none">
          <div className="h-4 w-20 rounded bg-surface2" />
          <div className="h-14 max-w-lg rounded-xl bg-surface2" />
          <div className="h-14 max-w-md rounded-xl bg-surface2" />
          <div className="h-6 max-w-xl rounded bg-surface2" />
        </div>
        <div className="min-h-[25rem] animate-pulse rounded-2xl border border-border bg-surface p-7 motion-reduce:animate-none">
          <div className="h-7 w-40 rounded bg-surface2" />
          <div className="mt-4 h-4 w-64 rounded bg-surface2" />
          <div className="mt-10 h-14 rounded-xl bg-surface2" />
          <div className="mt-4 h-14 rounded-xl bg-surface2" />
        </div>
      </div>
    </main>
  );
}

function StatusBanner({ error, message }: { error: string | null; message: string | null }) {
  if (!error && !message) return null;

  return (
    <div
      role={error ? 'alert' : 'status'}
      className={`mb-5 rounded-xl border px-4 py-3 text-sm leading-6 ${
        error
          ? 'border-accent2/30 bg-accent2/10 text-accent2'
          : 'border-green/30 bg-green/10 text-green'
      }`}
    >
      {error ?? message}
    </div>
  );
}

function AuthUnavailable() {
  return (
    <div className="pt-2">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
        <Sparkles size={23} aria-hidden />
      </div>
      <h3 className="mt-5 font-serif text-2xl font-semibold">家长账号准备中</h3>
      <p className="mt-3 leading-7 text-text-dim">
        手机号与微信登录正在接入。现在仍可正常做题、诊断和复习，学习功能不受影响。
      </p>

      <div className="mt-7 rounded-xl bg-surface2 px-4">
        <div className="flex items-center gap-3 py-4">
          <Phone size={18} className="shrink-0 text-accent" aria-hidden />
          <span className="flex-1 text-sm font-medium">手机验证码</span>
          <span className="text-sm text-text-dim">即将开放</span>
        </div>
        <div className="border-t border-border" />
        <div className="flex items-center gap-3 py-4">
          <MessageCircle size={18} className="shrink-0 text-accent" aria-hidden />
          <span className="flex-1 text-sm font-medium">微信扫码</span>
          <span className="text-sm text-text-dim">即将开放</span>
        </div>
      </div>

      <Link
        to="/assessment"
        className="mt-7 inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent px-6 py-3 font-semibold text-bg transition-colors hover:bg-amber-500 active:translate-y-px"
      >
        先去练习
        <ArrowRight size={18} aria-hidden />
      </Link>
      <div className="mt-5 flex gap-2 text-xs leading-6 text-text-dim">
        <ShieldCheck size={16} className="mt-1 shrink-0 text-accent" aria-hidden />
        当前设备记录仍只保存在本机，开通登录不会自动上传已有内容。
      </div>
    </div>
  );
}

export default function Account() {
  const [searchParams] = useSearchParams();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [session, setSession] = useState<AuthSession>(EMPTY_SESSION);
  const [loading, setLoading] = useState(true);
  const [activeMethod, setActiveMethod] = useState<LoginMethod>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [maskedPhone, setMaskedPhone] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => {
    const reason = searchParams.get('error');
    if (reason === 'wechat_conflict') return '这个微信已绑定其他账号，请先退出后再登录';
    if (reason === 'wechat_failed') return '微信登录没有完成，请重新扫码';
    return null;
  });

  useEffect(() => {
    let active = true;
    Promise.all([getAuthConfig(), getAuthSession()])
      .then(([nextConfig, nextSession]) => {
        if (!active) return;
        setConfig(nextConfig);
        setSession(nextSession);
        setActiveMethod(nextConfig.methods.phone ? 'phone' : 'wechat');
        if (searchParams.get('login') === 'wechat' && nextSession.authenticated) {
          setMessage('微信登录成功');
        }
      })
      .catch(cause => {
        if (active) setError(statusMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [searchParams]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown(value => Math.max(0, value - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  const normalizedPhone = useMemo(() => phone.replace(/\D/gu, '').slice(0, 11), [phone]);
  const phoneValid = /^1[3-9]\d{9}$/u.test(normalizedPhone);
  const codeValid = /^\d{6}$/u.test(code);
  const phoneAvailable = Boolean(config?.methods.phone);
  const wechatAvailable = Boolean(config?.methods.wechat);
  const authAvailable = phoneAvailable || wechatAvailable;

  const handleSend = async () => {
    if (!phoneValid || sending || countdown > 0) return;
    setSending(true);
    setError(null);
    setMessage(null);
    try {
      const challenge = await sendSmsCode(normalizedPhone);
      setChallengeId(challenge.challengeId);
      setMaskedPhone(challenge.phone);
      setCountdown(challenge.resendAfter);
      setMessage(`验证码已发送至 ${challenge.phone}`);
    } catch (cause) {
      const retryAfter = cause instanceof AuthApiError ? cause.retryAfter : null;
      if (retryAfter) setCountdown(Math.min(retryAfter, 60));
      setError(statusMessage(cause));
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault();
    if (!challengeId || !phoneValid || !codeValid || verifying) return;
    setVerifying(true);
    setError(null);
    setMessage(null);
    try {
      const nextSession = await verifySmsCode(normalizedPhone, challengeId, code);
      setSession(nextSession);
      setMessage('登录成功');
      setCode('');
    } catch (cause) {
      setError(statusMessage(cause));
    } finally {
      setVerifying(false);
    }
  };

  const handleLogout = async () => {
    setError(null);
    try {
      setSession(await logoutAuthSession());
      setMessage('已退出当前账号');
    } catch (cause) {
      setError(statusMessage(cause));
    }
  };

  if (loading) return <AccountLoading />;

  return (
    <main className="min-h-[100dvh] bg-bg pt-14">
      <div className="mx-auto grid min-h-[calc(100dvh-3.5rem)] w-full max-w-[1240px] gap-8 px-5 py-8 sm:px-8 sm:py-12 lg:grid-cols-[minmax(0,1.08fr)_minmax(24rem,0.92fr)] lg:items-center lg:gap-14 lg:px-10 lg:py-10 xl:gap-20">
        <AccountStory />

        <section
          aria-labelledby="login-panel-title"
          className="rounded-2xl border border-border bg-surface p-6 shadow-[0_24px_70px_color-mix(in_srgb,var(--accent)_8%,transparent)] sm:p-8"
        >
          <div className="mb-7">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
              {session.authenticated ? (
                <CheckCircle2 size={22} aria-hidden />
              ) : (
                <BookOpenCheck size={22} aria-hidden />
              )}
            </div>
            <h2 id="login-panel-title" className="font-serif text-2xl font-semibold sm:text-3xl">
              {session.authenticated ? '家长账号' : '认领孩子的学习入口'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-dim">
              {session.authenticated
                ? '管理当前家长身份与已绑定的登录方式。'
                : authAvailable
                  ? '选择适合当前设备的方式登录。'
                  : '登录服务开放前，所有学习功能仍可直接使用。'}
            </p>
          </div>

          <StatusBanner error={error} message={message} />

          {session.authenticated && session.user ? (
            <div>
              <div className="flex items-center gap-4 rounded-xl bg-surface2 p-4">
                {session.user.avatarUrl ? (
                  <img
                    src={session.user.avatarUrl}
                    alt="账号头像"
                    className="h-14 w-14 rounded-full border border-border object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green/10 text-green">
                    <CheckCircle2 size={28} aria-hidden />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-serif text-xl font-semibold">
                    {session.user.displayName || '算道家长'}
                  </h3>
                  <p className="mt-1 text-sm text-text-dim">账号已安全登录</p>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-medium">已绑定登录方式</h3>
                <div className="mt-3 rounded-xl bg-surface2 px-4">
                  {session.user.identities.map((identity, index) => (
                    <div key={identity.provider}>
                      {index > 0 && <div className="border-t border-border" />}
                      <div className="flex items-center justify-between gap-4 py-4 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          {identity.provider === 'phone' ? (
                            <Phone size={16} className="shrink-0 text-accent" aria-hidden />
                          ) : (
                            <MessageCircle size={16} className="shrink-0 text-accent" aria-hidden />
                          )}
                          <span className="truncate">{identity.label}</span>
                        </span>
                        <span className="shrink-0 text-green">已绑定</span>
                      </div>
                    </div>
                  ))}
                </div>
                {wechatAvailable &&
                  !session.user.identities.some(identity => identity.provider === 'wechat') && (
                    <button
                      type="button"
                      onClick={() =>
                        window.location.assign('/api/auth/wechat/start?returnTo=/account')
                      }
                      className="mt-3 flex w-full cursor-pointer items-center justify-between gap-4 rounded-xl border border-border px-4 py-3 text-left text-sm transition-colors hover:border-accent hover:text-accent active:translate-y-px"
                    >
                      <span className="flex items-center gap-2">
                        <MessageCircle size={16} aria-hidden /> 绑定微信
                      </span>
                      <span className="text-xs text-text-dim">继续使用当前账号</span>
                    </button>
                  )}
              </div>
              <Button className="mt-7 w-full" onClick={() => void handleLogout()}>
                退出账号
              </Button>
            </div>
          ) : !authAvailable ? (
            <AuthUnavailable />
          ) : (
            <div>
              {phoneAvailable && wechatAvailable && (
                <div
                  role="tablist"
                  aria-label="登录方式"
                  className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-surface2 p-1"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeMethod === 'phone'}
                    onClick={() => setActiveMethod('phone')}
                    className={`cursor-pointer rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      activeMethod === 'phone'
                        ? 'bg-surface text-accent shadow-sm'
                        : 'text-text-dim hover:text-text'
                    }`}
                  >
                    手机号
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeMethod === 'wechat'}
                    onClick={() => setActiveMethod('wechat')}
                    className={`cursor-pointer rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      activeMethod === 'wechat'
                        ? 'bg-surface text-accent shadow-sm'
                        : 'text-text-dim hover:text-text'
                    }`}
                  >
                    微信扫码
                  </button>
                </div>
              )}

              {phoneAvailable && activeMethod === 'phone' ? (
                <form onSubmit={handleVerify} className="space-y-4">
                  <div>
                    <label htmlFor="account-phone" className="mb-2 block text-sm font-medium">
                      手机号
                    </label>
                    <input
                      id="account-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={event => {
                        setPhone(event.target.value);
                        if (challengeId) {
                          setChallengeId(null);
                          setCode('');
                          setMessage(null);
                        }
                      }}
                      placeholder="请输入中国大陆手机号"
                      className="w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-base outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="account-code" className="mb-2 block text-sm font-medium">
                      验证码
                    </label>
                    <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
                      <input
                        id="account-code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={code}
                        onChange={event =>
                          setCode(event.target.value.replace(/\D/gu, '').slice(0, 6))
                        }
                        placeholder="6 位验证码"
                        className="min-w-0 rounded-xl border border-border bg-surface2 px-4 py-3 text-base tracking-[0.18em] outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                      />
                      <Button
                        type="button"
                        onClick={() => void handleSend()}
                        disabled={!phoneValid || sending || countdown > 0}
                        className="w-full whitespace-nowrap px-3"
                      >
                        {sending ? (
                          <Loader2
                            size={16}
                            className="animate-spin motion-reduce:animate-none"
                            aria-hidden
                          />
                        ) : countdown > 0 ? (
                          `${countdown} 秒`
                        ) : challengeId ? (
                          '重新发送'
                        ) : (
                          '获取验证码'
                        )}
                      </Button>
                    </div>
                  </div>
                  {challengeId && (
                    <p className="text-xs leading-5 text-text-dim">
                      验证码已发往 {maskedPhone}，5 分钟内有效。
                    </p>
                  )}
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-full"
                    disabled={!challengeId || !phoneValid || !codeValid || verifying}
                  >
                    {verifying && (
                      <Loader2
                        size={18}
                        className="animate-spin motion-reduce:animate-none"
                        aria-hidden
                      />
                    )}
                    验证并登录
                  </Button>
                </form>
              ) : wechatAvailable ? (
                <div>
                  <div className="flex min-h-52 items-center justify-center rounded-xl bg-surface2 px-6 py-8 text-center">
                    <div>
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                        <MessageCircle size={32} aria-hidden />
                      </div>
                      <h3 className="mt-5 font-serif text-xl font-semibold">使用微信扫码登录</h3>
                      <p className="mt-2 text-sm leading-6 text-text-dim">
                        将打开微信官方扫码页面，完成后自动返回算道。
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    className="mt-5 w-full"
                    onClick={() =>
                      window.location.assign('/api/auth/wechat/start?returnTo=/account')
                    }
                  >
                    打开微信扫码登录
                  </Button>
                </div>
              ) : null}

              <div className="mt-5 flex gap-2 text-xs leading-6 text-text-dim">
                <ShieldCheck size={16} className="mt-1 shrink-0 text-accent" aria-hidden />
                登录凭据只由服务端处理，浏览器不会接触短信或微信平台密钥。
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
