import { describe, expect, it } from 'vitest';
import {
  buildAdminSessionCookie,
  constantTimeStringMatches,
  createAdminSession,
  getDailyAdminPasscode,
  readCookie,
  verifyAdminSession,
} from './adminAuth';

const SECRET = 'a-test-admin-secret-that-is-long-enough';
const NOW = Date.parse('2026-07-19T00:00:00.000Z');
const NONCE = '00000000-0000-4000-8000-000000000001';

describe('admin authentication', () => {
  it('compares admin tokens by fixed-size hashes', async () => {
    await expect(constantTimeStringMatches(SECRET, SECRET)).resolves.toBe(true);
    await expect(constantTimeStringMatches('wrong', SECRET)).resolves.toBe(false);
  });

  it('derives the daily passcode from the Shanghai calendar date', () => {
    expect(getDailyAdminPasscode(Date.parse('2026-07-18T15:59:59.999Z'))).toBe('0718');
    expect(getDailyAdminPasscode(Date.parse('2026-07-18T16:00:00.000Z'))).toBe('0719');
    expect(getDailyAdminPasscode(Date.parse('2026-12-31T16:00:00.000Z'))).toBe('0101');
  });

  it('signs sessions and rejects tampered or expired values', async () => {
    const session = await createAdminSession(SECRET, NOW, NONCE);

    await expect(verifyAdminSession(session.value, SECRET, NOW)).resolves.toBe(true);
    await expect(verifyAdminSession(`${session.value}x`, SECRET, NOW)).resolves.toBe(false);
    await expect(verifyAdminSession(session.value, SECRET, session.expiresAt)).resolves.toBe(false);
    await expect(verifyAdminSession('malformed', SECRET, NOW)).resolves.toBe(false);
  });

  it('builds secure cookies and reads exact cookie names', () => {
    const cookie = buildAdminSessionCookie('session-value', true);

    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(readCookie(`other=1; suan_admin_session=session-value`, 'suan_admin_session')).toBe(
      'session-value',
    );
    expect(readCookie('prefix_suan_admin_session=wrong', 'suan_admin_session')).toBeUndefined();
  });
});
