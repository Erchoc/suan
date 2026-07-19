import { constantTimeStringMatches } from './adminAuth';

export const USER_SESSION_COOKIE = 'suan_user_session';
export const USER_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const SMS_CODE_TTL_SECONDS = 5 * 60;
export const SMS_RESEND_SECONDS = 60;
export const SMS_MAX_ATTEMPTS = 5;
export const SMS_DAILY_LIMIT = 10;
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

const encoder = new TextEncoder();

export type AuthProvider = 'phone' | 'wechat';

export interface PublicIdentity {
  provider: AuthProvider;
  label: string;
}

export interface PublicUser {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  identities: PublicIdentity[];
}

interface SessionRow {
  session_id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface IdentityRow {
  provider: AuthProvider;
  phone_last_four: string | null;
  display_name: string | null;
}

interface SmsCodeRow {
  code_digest: string;
  status: string;
  attempts: number;
  expires_at: string;
}

export interface SmsChallenge {
  id: string;
  phone: string;
  codeDigest: string;
  createdAt: string;
  expiresAt: string;
}

export interface SmsSendAllowance {
  allowed: boolean;
  retryAfterSeconds: number;
}

export type SmsConsumeResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'expired' | 'exhausted' };

export interface WechatProfile {
  subject: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface OAuthStateRecord {
  id: string;
  returnTo: string;
  currentUserId: string | null;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return bytesToHex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

export async function digestToken(token: string): Promise<string> {
  return bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
}

export async function digestSmsCode(
  secret: string,
  challengeId: string,
  phone: string,
  code: string,
): Promise<string> {
  return hmacHex(secret, `${challengeId}:${phone}:${code}`);
}

export function normalizeMainlandPhone(value: string): string | null {
  const compact = value.replace(/[\s-]/gu, '');
  const national = compact.startsWith('+86') ? compact.slice(3) : compact;
  return /^1[3-9]\d{9}$/u.test(national) ? `+86${national}` : null;
}

export function maskPhone(phone: string): string {
  return `${phone.slice(0, 6)}****${phone.slice(-4)}`;
}

export function sanitizeReturnTo(value: string | undefined): string {
  if (!value?.startsWith('/') || value.startsWith('//')) return '/account';
  try {
    const parsed = new URL(value, 'https://suan.local');
    if (parsed.origin !== 'https://suan.local') return '/account';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`.slice(0, 500);
  } catch {
    return '/account';
  }
}

export function buildUserSessionCookie(value: string, secure: boolean): string {
  return [
    `${USER_SESSION_COOKIE}=${value}`,
    'Path=/',
    `Max-Age=${USER_SESSION_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

export function buildExpiredUserSessionCookie(secure: boolean): string {
  return [
    `${USER_SESSION_COOKIE}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

export async function getSmsSendAllowance(
  db: D1Database,
  phone: string,
  nowMs: number,
): Promise<SmsSendAllowance> {
  const recentSince = new Date(nowMs - SMS_RESEND_SECONDS * 1_000).toISOString();
  const daySince = new Date(nowMs - 24 * 60 * 60 * 1_000).toISOString();
  const [recent, daily] = await Promise.all([
    db
      .prepare(
        `SELECT created_at FROM auth_sms_codes
         WHERE phone = ? AND status IN ('pending', 'active') AND created_at > ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(phone, recentSince)
      .first<{ created_at: string }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS total FROM auth_sms_codes
         WHERE phone = ? AND status != 'failed' AND created_at > ?`,
      )
      .bind(phone, daySince)
      .first<{ total: number }>(),
  ]);
  if (recent) {
    const elapsed = Math.floor((nowMs - Date.parse(recent.created_at)) / 1_000);
    return { allowed: false, retryAfterSeconds: Math.max(1, SMS_RESEND_SECONDS - elapsed) };
  }
  if (Number(daily?.total ?? 0) >= SMS_DAILY_LIMIT) {
    return { allowed: false, retryAfterSeconds: 24 * 60 * 60 };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function createSmsChallenge(
  db: D1Database,
  id: string,
  phone: string,
  codeDigest: string,
  nowMs: number,
): Promise<SmsChallenge> {
  const createdAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + SMS_CODE_TTL_SECONDS * 1_000).toISOString();
  await db
    .prepare(
      `INSERT INTO auth_sms_codes
       (id, phone, code_digest, status, attempts, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', 0, ?, ?, ?)`,
    )
    .bind(id, phone, codeDigest, expiresAt, createdAt, createdAt)
    .run();
  return { id, phone, codeDigest, createdAt, expiresAt };
}

export async function activateSmsChallenge(
  db: D1Database,
  id: string,
  messageId: string,
  nowMs: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE auth_sms_codes SET status = 'active', provider_message_id = ?, updated_at = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(messageId, new Date(nowMs).toISOString(), id)
    .run();
}

export async function failSmsChallenge(db: D1Database, id: string, nowMs: number): Promise<void> {
  await db
    .prepare(
      `UPDATE auth_sms_codes SET status = 'failed', code_digest = '', updated_at = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(new Date(nowMs).toISOString(), id)
    .run();
}

export async function consumeSmsChallenge(
  db: D1Database,
  id: string,
  phone: string,
  code: string,
  secret: string,
  nowMs: number,
): Promise<SmsConsumeResult> {
  const row = await db
    .prepare(
      `SELECT code_digest, status, attempts, expires_at FROM auth_sms_codes
       WHERE id = ? AND phone = ? LIMIT 1`,
    )
    .bind(id, phone)
    .first<SmsCodeRow>();
  if (row?.status !== 'active') return { ok: false, reason: 'invalid' };
  const now = new Date(nowMs).toISOString();
  if (row.expires_at <= now) {
    await db
      .prepare(
        `UPDATE auth_sms_codes SET status = 'expired', code_digest = '', updated_at = ?
         WHERE id = ? AND status = 'active'`,
      )
      .bind(now, id)
      .run();
    return { ok: false, reason: 'expired' };
  }
  if (row.attempts >= SMS_MAX_ATTEMPTS) return { ok: false, reason: 'exhausted' };

  const candidate = await digestSmsCode(secret, id, phone, code);
  if (!(await constantTimeStringMatches(candidate, row.code_digest))) {
    const nextAttempts = row.attempts + 1;
    await db
      .prepare(
        `UPDATE auth_sms_codes
         SET attempts = ?, status = ?, code_digest = CASE WHEN ? = 'exhausted' THEN '' ELSE code_digest END,
             updated_at = ?
         WHERE id = ? AND status = 'active'`,
      )
      .bind(
        nextAttempts,
        nextAttempts >= SMS_MAX_ATTEMPTS ? 'exhausted' : 'active',
        nextAttempts >= SMS_MAX_ATTEMPTS ? 'exhausted' : 'active',
        now,
        id,
      )
      .run();
    return { ok: false, reason: nextAttempts >= SMS_MAX_ATTEMPTS ? 'exhausted' : 'invalid' };
  }

  const result = await db
    .prepare(
      `UPDATE auth_sms_codes
       SET status = 'consumed', code_digest = '', consumed_at = ?, updated_at = ?
       WHERE id = ? AND status = 'active'`,
    )
    .bind(now, now, id)
    .run();
  return result.meta.changes === 1 ? { ok: true } : { ok: false, reason: 'invalid' };
}

async function createUserWithIdentity(
  db: D1Database,
  userId: string,
  identityId: string,
  provider: AuthProvider,
  subject: string,
  now: string,
  profile: { phoneLastFour?: string; displayName?: string; avatarUrl?: string } = {},
): Promise<string> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO users (id, display_name, avatar_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(userId, profile.displayName ?? null, profile.avatarUrl ?? null, now, now),
    db
      .prepare(
        `INSERT INTO user_identities
         (id, user_id, provider, provider_subject, phone_last_four, display_name, avatar_url,
          created_at, updated_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        identityId,
        userId,
        provider,
        subject,
        profile.phoneLastFour ?? null,
        profile.displayName ?? null,
        profile.avatarUrl ?? null,
        now,
        now,
        now,
      ),
  ]);
  return userId;
}

export async function resolvePhoneUser(
  db: D1Database,
  phone: string,
  userId: string,
  identityId: string,
  nowMs: number,
): Promise<string> {
  const now = new Date(nowMs).toISOString();
  const existing = await db
    .prepare(
      `SELECT user_id FROM user_identities
       WHERE provider = 'phone' AND provider_subject = ? LIMIT 1`,
    )
    .bind(phone)
    .first<{ user_id: string }>();
  if (existing) {
    await db
      .prepare(
        `UPDATE user_identities SET last_login_at = ?, updated_at = ?
         WHERE provider = 'phone' AND provider_subject = ?`,
      )
      .bind(now, now, phone)
      .run();
    return existing.user_id;
  }
  return createUserWithIdentity(db, userId, identityId, 'phone', phone, now, {
    phoneLastFour: phone.slice(-4),
  });
}

export async function resolveWechatUser(
  db: D1Database,
  profile: WechatProfile,
  targetUserId: string | null,
  userId: string,
  identityId: string,
  nowMs: number,
): Promise<{ userId: string; conflict: boolean }> {
  const now = new Date(nowMs).toISOString();
  const existing = await db
    .prepare(
      `SELECT user_id FROM user_identities
       WHERE provider = 'wechat' AND provider_subject = ? LIMIT 1`,
    )
    .bind(profile.subject)
    .first<{ user_id: string }>();
  if (existing) {
    if (targetUserId && targetUserId !== existing.user_id) {
      return { userId: existing.user_id, conflict: true };
    }
    await db
      .prepare(
        `UPDATE user_identities
         SET display_name = ?, avatar_url = ?, last_login_at = ?, updated_at = ?
         WHERE provider = 'wechat' AND provider_subject = ?`,
      )
      .bind(profile.displayName ?? null, profile.avatarUrl ?? null, now, now, profile.subject)
      .run();
    return { userId: existing.user_id, conflict: false };
  }

  if (targetUserId) {
    await db
      .prepare(
        `INSERT INTO user_identities
         (id, user_id, provider, provider_subject, display_name, avatar_url,
          created_at, updated_at, last_login_at)
         VALUES (?, ?, 'wechat', ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        identityId,
        targetUserId,
        profile.subject,
        profile.displayName ?? null,
        profile.avatarUrl ?? null,
        now,
        now,
        now,
      )
      .run();
    return { userId: targetUserId, conflict: false };
  }

  return {
    userId: await createUserWithIdentity(
      db,
      userId,
      identityId,
      'wechat',
      profile.subject,
      now,
      profile,
    ),
    conflict: false,
  };
}

export async function createUserSession(
  db: D1Database,
  userId: string,
  sessionId: string,
  token: string,
  nowMs: number,
): Promise<void> {
  const now = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + USER_SESSION_MAX_AGE_SECONDS * 1_000).toISOString();
  await db
    .prepare(
      `INSERT INTO user_sessions
       (id, user_id, token_digest, expires_at, last_seen_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(sessionId, userId, await digestToken(token), expiresAt, now, now)
    .run();
}

export async function getUserSession(
  db: D1Database,
  token: string | undefined,
  nowMs: number,
): Promise<{ sessionId: string; user: PublicUser } | null> {
  if (!token || token.length < 32 || token.length > 200) return null;
  const now = new Date(nowMs).toISOString();
  const session = await db
    .prepare(
      `SELECT s.id AS session_id, u.id AS user_id, u.display_name, u.avatar_url
       FROM user_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_digest = ? AND s.revoked_at IS NULL AND s.expires_at > ?
         AND u.status = 'active' LIMIT 1`,
    )
    .bind(await digestToken(token), now)
    .first<SessionRow>();
  if (!session) return null;
  const identities = await db
    .prepare(
      `SELECT provider, phone_last_four, display_name FROM user_identities
       WHERE user_id = ? ORDER BY provider`,
    )
    .bind(session.user_id)
    .all<IdentityRow>();
  return {
    sessionId: session.session_id,
    user: {
      id: session.user_id,
      displayName:
        session.display_name ??
        identities.results.find(item => item.display_name)?.display_name ??
        null,
      avatarUrl: session.avatar_url,
      identities: identities.results.map(identity => ({
        provider: identity.provider,
        label:
          identity.provider === 'phone'
            ? `手机尾号 ${identity.phone_last_four ?? '****'}`
            : identity.display_name || '微信',
      })),
    },
  };
}

export async function revokeUserSession(
  db: D1Database,
  token: string | undefined,
  nowMs: number,
): Promise<void> {
  if (!token || token.length < 32 || token.length > 200) return;
  await db
    .prepare(
      `UPDATE user_sessions SET revoked_at = ?
       WHERE token_digest = ? AND revoked_at IS NULL`,
    )
    .bind(new Date(nowMs).toISOString(), await digestToken(token))
    .run();
}

export async function createOAuthState(
  db: D1Database,
  id: string,
  rawState: string,
  returnTo: string,
  currentUserId: string | null,
  nowMs: number,
): Promise<void> {
  const createdAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + OAUTH_STATE_TTL_SECONDS * 1_000).toISOString();
  await db
    .prepare(
      `INSERT INTO auth_oauth_states
       (id, state_digest, return_to, current_user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, await digestToken(rawState), returnTo, currentUserId, expiresAt, createdAt)
    .run();
}

export async function consumeOAuthState(
  db: D1Database,
  rawState: string,
  nowMs: number,
): Promise<OAuthStateRecord | null> {
  if (rawState.length < 32 || rawState.length > 200) return null;
  const digest = await digestToken(rawState);
  const now = new Date(nowMs).toISOString();
  const state = await db
    .prepare(
      `SELECT id, return_to, current_user_id FROM auth_oauth_states
       WHERE state_digest = ? AND consumed_at IS NULL AND expires_at > ? LIMIT 1`,
    )
    .bind(digest, now)
    .first<{ id: string; return_to: string; current_user_id: string | null }>();
  if (!state) return null;
  const result = await db
    .prepare(
      `UPDATE auth_oauth_states SET consumed_at = ?
       WHERE id = ? AND consumed_at IS NULL`,
    )
    .bind(now, state.id)
    .run();
  if (result.meta.changes !== 1) return null;
  return { id: state.id, returnTo: state.return_to, currentUserId: state.current_user_id };
}
