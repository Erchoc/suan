import {
  CheckCircle2,
  ChevronLeft,
  Loader2,
  MessageCircle,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
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

function statusMessage(error: unknown): string {
  if (error instanceof AuthApiError) return error.message;
  return '网络暂时不可用，请稍后重试';
}

function AuthUnavailable({ method }: { method: '手机号' | '微信' }) {
  return (
    <div className="rounded-xl border border-border bg-surface2/60 px-4 py-3 text-sm text-text-dim">
      {method}登录尚未开通，管理员完成服务商资质与密钥配置后即可使用。
    </div>
  );
}

export default function Account() {
  const [searchParams] = useSearchParams();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [session, setSession] = useState<AuthSession>(EMPTY_SESSION);
  const [loading, setLoading] = useState(true);
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

  if (loading) {
    return (
      <main className="min-h-screen pt-14 flex items-center justify-center bg-bg">
        <div className="flex items-center gap-2 text-text-dim">
          <Loader2 size={18} className="animate-spin" /> 正在读取账号状态…
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg pt-14 px-4 py-8 sm:px-6 sm:py-14">
      <div className="mx-auto max-w-5xl">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1 text-sm text-text-dim transition-colors hover:text-text"
        >
          <ChevronLeft size={16} /> 返回首页
        </Link>

        <div className="mb-8 max-w-2xl">
          <p className="mb-2 text-sm font-medium text-accent">家长账号</p>
          <h1 className="font-serif text-3xl font-semibold sm:text-4xl">认领孩子的学习入口</h1>
          <p className="mt-3 leading-relaxed text-text-dim">
            先完成家长身份接入，后续可用于孩子档案、订阅权益与跨设备学习记录。当前设备已有的做题记录仍只保存在本机。
          </p>
        </div>

        {(message || error) && (
          <div
            role={error ? 'alert' : 'status'}
            className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
              error
                ? 'border-accent2/30 bg-accent2/10 text-accent2'
                : 'border-success/30 bg-success/10 text-success'
            }`}
          >
            {error ?? message}
          </div>
        )}

        {session.authenticated && session.user ? (
          <Card className="max-w-2xl p-6 sm:p-8">
            <div className="flex items-start gap-4">
              {session.user.avatarUrl ? (
                <img
                  src={session.user.avatarUrl}
                  alt="账号头像"
                  className="h-14 w-14 rounded-full border border-border object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
                  <CheckCircle2 size={28} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="font-serif text-xl font-semibold">
                  {session.user.displayName || '算道家长'}
                </h2>
                <p className="mt-1 text-sm text-text-dim">账号已安全登录</p>
              </div>
            </div>
            <div className="my-6 border-t border-border" />
            <div className="space-y-3">
              <h3 className="text-sm font-medium">已绑定登录方式</h3>
              {session.user.identities.map(identity => (
                <div
                  key={identity.provider}
                  className="flex items-center justify-between rounded-xl bg-surface2 px-4 py-3 text-sm"
                >
                  <span className="flex items-center gap-2">
                    {identity.provider === 'phone' ? (
                      <Phone size={16} />
                    ) : (
                      <MessageCircle size={16} />
                    )}
                    {identity.label}
                  </span>
                  <span className="text-success">已绑定</span>
                </div>
              ))}
              {config?.methods.wechat &&
                !session.user.identities.some(identity => identity.provider === 'wechat') && (
                  <button
                    type="button"
                    onClick={() =>
                      window.location.assign('/api/auth/wechat/start?returnTo=/account')
                    }
                    className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-dashed border-success/35 bg-success/5 px-4 py-3 text-left text-sm transition-colors hover:border-success/60"
                  >
                    <span className="flex items-center gap-2">
                      <MessageCircle size={16} className="text-success" /> 绑定微信
                    </span>
                    <span className="text-xs text-text-dim">扫码后仍使用当前账号</span>
                  </button>
                )}
            </div>
            <div className="mt-6 flex justify-end">
              <Button onClick={() => void handleLogout()}>退出账号</Button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <Card className="p-6 sm:p-8">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <Phone size={21} />
                </div>
                <div>
                  <h2 className="font-serif text-xl font-semibold">手机号登录</h2>
                  <p className="mt-0.5 text-sm text-text-dim">更适合手机上的家长</p>
                </div>
              </div>

              {config?.methods.phone ? (
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
                      className="w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-base outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
                    />
                  </div>
                  <div>
                    <label htmlFor="account-code" className="mb-2 block text-sm font-medium">
                      验证码
                    </label>
                    <div className="flex gap-2">
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
                        className="min-w-0 flex-1 rounded-xl border border-border bg-surface2 px-4 py-3 text-base tracking-[0.18em] outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
                      />
                      <Button
                        type="button"
                        onClick={() => void handleSend()}
                        disabled={!phoneValid || sending || countdown > 0}
                        className="min-w-[7.25rem]"
                      >
                        {sending ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : countdown > 0 ? (
                          `${countdown} 秒后重发`
                        ) : challengeId ? (
                          '重新发送'
                        ) : (
                          '获取验证码'
                        )}
                      </Button>
                    </div>
                  </div>
                  {challengeId && (
                    <p className="text-xs text-text-dim">
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
                    {verifying && <Loader2 size={18} className="animate-spin" />}
                    验证并登录
                  </Button>
                </form>
              ) : (
                <AuthUnavailable method="手机号" />
              )}
            </Card>

            <Card className="p-6 sm:p-8">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-success/10 text-success">
                  <MessageCircle size={21} />
                </div>
                <div>
                  <h2 className="font-serif text-xl font-semibold">微信扫码登录</h2>
                  <p className="mt-0.5 text-sm text-text-dim">电脑上扫码更方便</p>
                </div>
              </div>
              {config?.methods.wechat ? (
                <>
                  <div className="mb-5 flex aspect-square max-h-64 items-center justify-center rounded-2xl border border-dashed border-success/35 bg-success/5">
                    <div className="text-center text-success">
                      <MessageCircle size={46} className="mx-auto mb-3" />
                      <p className="text-sm font-medium">进入微信官方扫码页</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    className="w-full"
                    onClick={() =>
                      window.location.assign('/api/auth/wechat/start?returnTo=/account')
                    }
                  >
                    打开微信扫码登录
                  </Button>
                </>
              ) : (
                <AuthUnavailable method="微信" />
              )}
              <div className="mt-5 flex gap-2 text-xs leading-relaxed text-text-dim">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-success" />
                登录凭据只由服务端处理，浏览器不会接触短信或微信平台密钥。
              </div>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
