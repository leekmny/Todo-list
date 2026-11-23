import { describe, expect, it } from 'vitest';
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

describe('multi-user email auth & session utilities', () => {
  it('generates valid 6-digit numeric OTP codes', () => {
    for (let i = 0; i < 30; i += 1) {
      const code = generateSixDigitOtp();
      expect(isValidOtpFormat(code)).toBe(true);
    }
    expect(isValidOtpFormat('12345')).toBe(false);
    expect(isValidOtpFormat('abcdef')).toBe(false);
  });

  it('parses ALLOWED_EMAILS and ALLOWED_EMAIL cleanly with case-insensitive matching', async () => {
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
  });

  it('creates, verifies, and revokes sessions when removed from allowlist or expired', async () => {
    const secret = 'very-long-random-session-secret';
    const now = Date.UTC(2026, 0, 1, 0, 0, 0);
    const token = await createSessionToken('alice@example.com', secret, now);

    expect(
      await verifySessionToken(token, secret, ['alice@example.com', 'bob@example.com'], now + 1000)
    ).toEqual({
      valid: true,
      email: 'alice@example.com',
    });

    // Removed from allowlist -> immediately rejected
    expect(await verifySessionToken(token, secret, ['bob@example.com'], now + 1000)).toEqual({
      valid: false,
      email: null,
    });

    expect(
      await verifySessionToken(token, 'wrong-secret', ['alice@example.com'], now + 1000)
    ).toEqual({
      valid: false,
      email: null,
    });

    expect(
      await verifySessionToken(`${token}x`, secret, ['alice@example.com'], now + 1000)
    ).toEqual({
      valid: false,
      email: null,
    });

    const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
    expect(
      await verifySessionToken(token, secret, ['alice@example.com'], now + eightDaysMs)
    ).toEqual({
      valid: false,
      email: null,
    });
  });

  it('builds strict HttpOnly cookies and parses them cleanly', () => {
    const cookie = buildSessionCookie('abc.def', true);
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=abc.def`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Secure');

    expect(getCookieValue(`foo=1; ${SESSION_COOKIE_NAME}=abc.def; bar=2`, SESSION_COOKIE_NAME)).toBe(
      'abc.def'
    );

    const cleared = buildClearSessionCookie(false);
    expect(cleared).toContain('Max-Age=0');
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

    const crossSiteFetch = new Request('https://todo.example.com/api/todos', {
      method: 'POST',
      headers: { 'Sec-Fetch-Site': 'cross-site' },
    });
    expect(isSameOriginMutation(crossSiteFetch)).toBe(false);
  });
});
