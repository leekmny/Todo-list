import { describe, expect, it } from 'vitest';
import { parseQuickTodoInput } from '../src/shared/quickParse';
import {
  buildClearSessionCookie,
  buildSessionCookie,
  createSessionToken,
  generateSixDigitOtp,
  getAllowedEmails,
  getCookieValue,
  isAllowedEmail,
  isSameOriginMutation,
  isValidEmailFormat,
  isValidOtpFormat,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from '../src/worker/auth';
import type { Env } from '../src/worker/types';

describe('multi-user email auth, sliding sessions & quick parser', () => {
  it('generates valid 6-digit numeric OTP codes', () => {
    for (let i = 0; i < 30; i += 1) {
      const code = generateSixDigitOtp();
      expect(isValidOtpFormat(code)).toBe(true);
    }
    expect(isValidOtpFormat('12345')).toBe(false);
    expect(isValidOtpFormat('abcdef')).toBe(false);
  });

  it('parses ALLOWED_EMAILS, ALLOWED_EMAIL, and optional public signup', async () => {
    expect(isValidEmailFormat('owner@example.com')).toBe(true);
    expect(isValidEmailFormat('not-an-email')).toBe(false);

    const env = {
      ALLOWED_EMAIL: 'Owner@Example.com',
      ALLOWED_EMAILS: 'friend1@example.com, FRIEND2@example.com; invalid-entry, owner@example.com',
    } as Env;

    expect(getAllowedEmails(env)).toEqual([
      'friend1@example.com',
      'friend2@example.com',
      'owner@example.com',
    ]);
    expect(await isAllowedEmail('  owner@example.com ', env)).toBe(true);
    expect(await isAllowedEmail('friend2@example.com', env)).toBe(true);
    expect(await isAllowedEmail('stranger@example.com', env)).toBe(false);

    const publicEnv = { ALLOW_PUBLIC_SIGNUP: 'true' } as Env;
    expect(await isAllowedEmail('anyone@example.org', publicEnv)).toBe(true);
  });

  it('supports 90-day rememberMe sessions with sliding renewal and immediate allowlist revocation', async () => {
    const secret = 'very-long-random-session-secret';
    const now = Date.UTC(2026, 0, 1, 0, 0, 0);
    const token = await createSessionToken('alice@example.com', secret, true, now);

    // Fresh token -> valid, no renewal needed yet
    expect(
      await verifySessionToken(token, secret, ['alice@example.com', 'bob@example.com'], now + 1000)
    ).toEqual({
      valid: true,
      email: 'alice@example.com',
      rememberMe: true,
      shouldRenew: false,
    });

    // After 24 hours -> valid and flags sliding renewal
    const oneDayMs = 24 * 60 * 60 * 1000;
    expect(
      await verifySessionToken(token, secret, ['alice@example.com'], now + oneDayMs)
    ).toEqual({
      valid: true,
      email: 'alice@example.com',
      rememberMe: true,
      shouldRenew: true,
    });

    // Removed from allowlist -> immediately rejected
    expect(await verifySessionToken(token, secret, ['bob@example.com'], now + 1000)).toMatchObject({
      valid: false,
      email: null,
    });

    // After 91 days -> expired
    const ninetyOneDaysMs = 91 * 24 * 60 * 60 * 1000;
    expect(
      await verifySessionToken(token, secret, ['alice@example.com'], now + ninetyOneDaysMs)
    ).toMatchObject({
      valid: false,
      email: null,
    });

    // Short session (rememberMe=false) expires after 24 hours
    const shortToken = await createSessionToken('alice@example.com', secret, false, now);
    expect(
      await verifySessionToken(shortToken, secret, ['alice@example.com'], now + oneDayMs + 2000)
    ).toMatchObject({
      valid: false,
      email: null,
    });
  });

  it('builds persistent HttpOnly SameSite=Lax cookies with explicit Expires', () => {
    const cookie = buildSessionCookie('abc.def', true, true, Date.UTC(2026, 0, 1, 0, 0, 0));
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=abc.def`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Max-Age=7776000');
    expect(cookie).toContain('Expires=');

    expect(getCookieValue(`foo=1; ${SESSION_COOKIE_NAME}=abc.def; bar=2`, SESSION_COOKIE_NAME)).toBe(
      'abc.def'
    );

    const cleared = buildClearSessionCookie(false);
    expect(cleared).toContain('Max-Age=0');
    expect(cleared).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    expect(cleared).not.toContain('Secure');
  });

  it('rejects cross-origin mutating requests', () => {
    const sameOrigin = new Request('https://todo.example.com/api/todos', {
      method: 'POST',
      headers: { Origin: 'https://todo.example.com', 'Sec-Fetch-Site': 'same-origin' },
    });
    expect(isSameOriginMutation(sameOrigin)).toBe(true);

    const evilOrigin = new Request('https://todo.example.com/api/todos', {
      method: 'POST',
      headers: { Origin: 'https://evil.example.org' },
    });
    expect(isSameOriginMutation(evilOrigin)).toBe(false);
  });

  it('parses natural-language quick todo tokens cleanly', () => {
    const base = new Date(2026, 10, 23, 12, 0, 0); // 2026-11-23
    const parsed = parseQuickTodoInput('운동하기 매일 #건강 내일 @21:30 !높음 *고정', base);
    expect(parsed).toEqual({
      title: '운동하기',
      category: '건강',
      priority: 'high',
      recurrence: 'daily',
      dueDate: '2026-11-24',
      reminderAt: '2026-11-24T21:30',
      pinned: true,
    });

    const explicitDate = parseQuickTodoInput('세금 신고 2026-12-15 p3 #재무', base);
    expect(explicitDate).toEqual({
      title: '세금 신고',
      category: '재무',
      priority: 'low',
      dueDate: '2026-12-15',
      reminderAt: undefined,
      recurrence: undefined,
      pinned: undefined,
    });
  });
});
