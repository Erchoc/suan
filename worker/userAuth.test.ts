import { applyD1Migrations, type D1Migration, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  activateSmsChallenge,
  buildExpiredUserSessionCookie,
  buildUserSessionCookie,
  consumeOAuthState,
  consumeSmsChallenge,
  createOAuthState,
  createSmsChallenge,
  createUserSession,
  digestSmsCode,
  failSmsChallenge,
  getSmsSendAllowance,
  getUserSession,
  maskPhone,
  normalizeMainlandPhone,
  resolvePhoneUser,
  resolveWechatUser,
  revokeUserSession,
  sanitizeReturnTo,
} from './userAuth';

const testEnv = env as CloudflareBindings & { TEST_MIGRATIONS: D1Migration[] };
const NOW = Date.parse('2026-07-19T08:00:00.000Z');
const SECRET = 'test-user-auth-secret-that-is-long-enough';

beforeEach(async () => {
  await applyD1Migrations(testEnv.CONTENT_DB, testEnv.TEST_MIGRATIONS);
  await testEnv.CONTENT_DB.batch([
    testEnv.CONTENT_DB.prepare('DELETE FROM user_sessions'),
    testEnv.CONTENT_DB.prepare('DELETE FROM auth_oauth_states'),
    testEnv.CONTENT_DB.prepare('DELETE FROM auth_sms_codes'),
    testEnv.CONTENT_DB.prepare('DELETE FROM user_identities'),
    testEnv.CONTENT_DB.prepare('DELETE FROM users'),
  ]);
});

describe('user auth data', () => {
  it('normalizes phone numbers and restricts local redirect paths', () => {
    expect(normalizeMainlandPhone('138 0013 8000')).toBe('+8613800138000');
    expect(normalizeMainlandPhone('+86-13800138000')).toBe('+8613800138000');
    expect(normalizeMainlandPhone('12800138000')).toBeNull();
    expect(maskPhone('+8613800138000')).toBe('+86138****8000');
    expect(sanitizeReturnTo('/account?from=home')).toBe('/account?from=home');
    expect(sanitizeReturnTo('https://example.com')).toBe('/account');
    expect(sanitizeReturnTo('//example.com')).toBe('/account');
  });

  it('creates secure session cookies with distinct expiration behavior', () => {
    expect(buildUserSessionCookie('token', true)).toContain(
      'suan_user_session=token; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure',
    );
    expect(buildExpiredUserSessionCookie(false)).toBe(
      'suan_user_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
    );
  });

  it('enforces SMS cooldown and consumes a code only once', async () => {
    const phone = '+8613800138000';
    const challengeId = '00000000-0000-4000-8000-000000000001';
    const digest = await digestSmsCode(SECRET, challengeId, phone, '123456');
    await createSmsChallenge(testEnv.CONTENT_DB, challengeId, phone, digest, NOW);
    await activateSmsChallenge(testEnv.CONTENT_DB, challengeId, 'message-1', NOW);

    await expect(getSmsSendAllowance(testEnv.CONTENT_DB, phone, NOW + 10_000)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 50,
    });
    await expect(
      consumeSmsChallenge(testEnv.CONTENT_DB, challengeId, phone, '000000', SECRET, NOW + 20_000),
    ).resolves.toEqual({ ok: false, reason: 'invalid' });
    await expect(
      consumeSmsChallenge(testEnv.CONTENT_DB, challengeId, phone, '123456', SECRET, NOW + 30_000),
    ).resolves.toEqual({ ok: true });
    await expect(
      consumeSmsChallenge(testEnv.CONTENT_DB, challengeId, phone, '123456', SECRET, NOW + 40_000),
    ).resolves.toEqual({ ok: false, reason: 'invalid' });
  });

  it('expires or exhausts SMS challenges and enforces the daily sending limit', async () => {
    const phone = '+8613900139000';
    const expiredId = 'expired-code';
    await createSmsChallenge(
      testEnv.CONTENT_DB,
      expiredId,
      phone,
      await digestSmsCode(SECRET, expiredId, phone, '123456'),
      NOW - 6 * 60 * 1_000,
    );
    await activateSmsChallenge(
      testEnv.CONTENT_DB,
      expiredId,
      'message-expired',
      NOW - 6 * 60 * 1_000,
    );
    await expect(
      consumeSmsChallenge(testEnv.CONTENT_DB, expiredId, phone, '123456', SECRET, NOW),
    ).resolves.toEqual({ ok: false, reason: 'expired' });

    const exhaustedId = 'exhausted-code';
    await createSmsChallenge(
      testEnv.CONTENT_DB,
      exhaustedId,
      phone,
      await digestSmsCode(SECRET, exhaustedId, phone, '123456'),
      NOW - 60 * 1_000,
    );
    await activateSmsChallenge(testEnv.CONTENT_DB, exhaustedId, 'message-exhausted', NOW);
    await testEnv.CONTENT_DB.prepare(
      "UPDATE auth_sms_codes SET attempts = 5, status = 'active' WHERE id = ?",
    )
      .bind(exhaustedId)
      .run();
    await expect(
      consumeSmsChallenge(testEnv.CONTENT_DB, exhaustedId, phone, '123456', SECRET, NOW),
    ).resolves.toEqual({ ok: false, reason: 'exhausted' });

    const failedId = 'failed-code';
    await createSmsChallenge(
      testEnv.CONTENT_DB,
      failedId,
      phone,
      await digestSmsCode(SECRET, failedId, phone, '123456'),
      NOW,
    );
    await failSmsChallenge(testEnv.CONTENT_DB, failedId, NOW);
    await expect(
      testEnv.CONTENT_DB.prepare('SELECT status, code_digest FROM auth_sms_codes WHERE id = ?')
        .bind(failedId)
        .first(),
    ).resolves.toEqual({ status: 'failed', code_digest: '' });

    for (let index = 0; index < 10; index += 1) {
      const id = `daily-${index}`;
      await createSmsChallenge(
        testEnv.CONTENT_DB,
        id,
        phone,
        await digestSmsCode(SECRET, id, phone, '123456'),
        NOW - (index + 2) * 60 * 1_000,
      );
    }
    await expect(getSmsSendAllowance(testEnv.CONTENT_DB, phone, NOW)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 86_400,
    });
    await expect(getSmsSendAllowance(testEnv.CONTENT_DB, '+8613700137000', NOW)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it('creates a phone user and resolves an expiring revocable session', async () => {
    const phone = '+8613800138000';
    const userId = await resolvePhoneUser(testEnv.CONTENT_DB, phone, 'user-1', 'identity-1', NOW);
    expect(userId).toBe('user-1');
    await expect(
      resolvePhoneUser(testEnv.CONTENT_DB, phone, 'unused-user', 'unused-identity', NOW + 1_000),
    ).resolves.toBe('user-1');

    await createUserSession(testEnv.CONTENT_DB, userId, 'session-1', 'a'.repeat(64), NOW);
    await expect(getUserSession(testEnv.CONTENT_DB, 'a'.repeat(64), NOW + 1_000)).resolves.toEqual({
      sessionId: 'session-1',
      user: {
        id: 'user-1',
        displayName: null,
        avatarUrl: null,
        identities: [{ provider: 'phone', label: '手机尾号 8000' }],
      },
    });
    await revokeUserSession(testEnv.CONTENT_DB, 'a'.repeat(64), NOW + 2_000);
    await expect(
      getUserSession(testEnv.CONTENT_DB, 'a'.repeat(64), NOW + 3_000),
    ).resolves.toBeNull();
  });

  it('consumes OAuth state once and binds WeChat to the current user', async () => {
    await resolvePhoneUser(testEnv.CONTENT_DB, '+8613800138000', 'user-1', 'identity-phone', NOW);
    const state = 's'.repeat(64);
    await createOAuthState(testEnv.CONTENT_DB, 'state-1', state, '/account', 'user-1', NOW);
    await expect(consumeOAuthState(testEnv.CONTENT_DB, state, NOW + 1_000)).resolves.toEqual({
      id: 'state-1',
      returnTo: '/account',
      currentUserId: 'user-1',
    });
    await expect(consumeOAuthState(testEnv.CONTENT_DB, state, NOW + 2_000)).resolves.toBeNull();

    await expect(
      resolveWechatUser(
        testEnv.CONTENT_DB,
        { subject: 'unionid:wechat-1', displayName: '微信家长' },
        'user-1',
        'unused-user',
        'identity-wechat',
        NOW + 3_000,
      ),
    ).resolves.toEqual({ userId: 'user-1', conflict: false });
    const session = await getUserSession(
      testEnv.CONTENT_DB,
      await (async () => {
        const token = 'b'.repeat(64);
        await createUserSession(testEnv.CONTENT_DB, 'user-1', 'session-2', token, NOW + 4_000);
        return token;
      })(),
      NOW + 5_000,
    );
    expect(session?.user.identities).toEqual([
      { provider: 'phone', label: '手机尾号 8000' },
      { provider: 'wechat', label: '微信家长' },
    ]);
  });

  it('creates, refreshes and protects an existing WeChat identity', async () => {
    await expect(
      resolveWechatUser(
        testEnv.CONTENT_DB,
        { subject: 'openid:wechat-2' },
        null,
        'wechat-user',
        'wechat-identity',
        NOW,
      ),
    ).resolves.toEqual({ userId: 'wechat-user', conflict: false });
    await expect(
      resolveWechatUser(
        testEnv.CONTENT_DB,
        { subject: 'openid:wechat-2', displayName: '更新昵称' },
        null,
        'unused-user',
        'unused-identity',
        NOW + 1_000,
      ),
    ).resolves.toEqual({ userId: 'wechat-user', conflict: false });

    await resolvePhoneUser(
      testEnv.CONTENT_DB,
      '+8613600136000',
      'phone-user',
      'phone-identity',
      NOW,
    );
    await expect(
      resolveWechatUser(
        testEnv.CONTENT_DB,
        { subject: 'openid:wechat-2' },
        'phone-user',
        'unused-user-2',
        'unused-identity-2',
        NOW + 2_000,
      ),
    ).resolves.toEqual({ userId: 'wechat-user', conflict: true });
  });

  it('rejects malformed, missing and expired session or OAuth tokens', async () => {
    await expect(getUserSession(testEnv.CONTENT_DB, undefined, NOW)).resolves.toBeNull();
    await expect(getUserSession(testEnv.CONTENT_DB, 'short', NOW)).resolves.toBeNull();
    await expect(getUserSession(testEnv.CONTENT_DB, 'z'.repeat(64), NOW)).resolves.toBeNull();
    await expect(revokeUserSession(testEnv.CONTENT_DB, undefined, NOW)).resolves.toBeUndefined();
    await expect(consumeOAuthState(testEnv.CONTENT_DB, 'short', NOW)).resolves.toBeNull();

    await createOAuthState(
      testEnv.CONTENT_DB,
      'expired-state',
      'x'.repeat(64),
      '/account',
      null,
      NOW - 11 * 60 * 1_000,
    );
    await expect(consumeOAuthState(testEnv.CONTENT_DB, 'x'.repeat(64), NOW)).resolves.toBeNull();
  });
});
