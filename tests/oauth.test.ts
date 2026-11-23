import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/worker/index';
import type { Env } from '../src/worker/types';

function createOAuthEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    ALLOWED_EMAILS: 'alice@example.com,bob@example.com',
    SESSION_SECRET: 'super-secret-signing-key-1234567890',
    GOOGLE_CLIENT_ID: 'google-client-id-123',
    GOOGLE_CLIENT_SECRET: 'google-client-secret-xyz',
    GITHUB_CLIENT_ID: 'github-client-id-123',
    GITHUB_CLIENT_SECRET: 'github-client-secret-xyz',
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Google & GitHub OAuth 2.0 + PKCE authentication', () => {
  it('exposes configured oauthProviders in /api/auth/status', async () => {
    const app = createApp();
    const env = createOAuthEnv();

    const res = await app.request('https://todo.example.com/api/auth/status', {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      authenticated: false,
      configured: true,
      oauthProviders: { google: true, github: true },
    });
  });

  it('completes Google OAuth 2.0 PKCE flow and rejects unverified emails', async () => {
    const app = createApp();
    const env = createOAuthEnv();

    // Step 1: Start Google OAuth
    const startRes = await app.request('https://todo.example.com/api/auth/oauth/google', {}, env);
    expect(startRes.status).toBe(302);
    const location = startRes.headers.get('Location')!;
    const authUrl = new URL(location);
    expect(authUrl.origin).toBe('https://accounts.google.com');
    expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authUrl.searchParams.get('code_challenge')).toBeTruthy();
    const state = authUrl.searchParams.get('state')!;
    const stateCookie = startRes.headers.get('Set-Cookie')!.split(';')[0];

    // Mock Google token + userinfo (verified allowed email)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'g-access-token' }), { status: 200 });
      }
      if (url.includes('openidconnect.googleapis.com/v1/userinfo')) {
        return new Response(
          JSON.stringify({ email: 'Alice@Example.com', email_verified: true }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    // Step 2: Callback succeeds and issues 90-day session cookie
    const cbRes = await app.request(
      `https://todo.example.com/api/auth/oauth/google/callback?code=abc123&state=${encodeURIComponent(state)}`,
      { headers: { Cookie: stateCookie } },
      env
    );
    expect(cbRes.status).toBe(302);
    expect(cbRes.headers.get('Location')).toBe('/');
    const setCookies = cbRes.headers.getSetCookie();
    const sessionCookie = setCookies.find((c) => c.startsWith('private_todo_session='));
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('SameSite=Lax');
    expect(sessionCookie).toContain('Max-Age=7776000');

    // Verify session is active
    const statusRes = await app.request(
      'https://todo.example.com/api/auth/status',
      { headers: { Cookie: sessionCookie!.split(';')[0] } },
      env
    );
    expect(await statusRes.json()).toMatchObject({
      authenticated: true,
      userEmail: 'alice@example.com',
    });

    // Reject unverified Google email
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'g-access-token' }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ email: 'alice@example.com', email_verified: false }),
        { status: 200 }
      );
    });

    const unverifiedCb = await app.request(
      `https://todo.example.com/api/auth/oauth/google/callback?code=abc&state=${encodeURIComponent(state)}`,
      { headers: { Cookie: stateCookie } },
      env
    );
    expect(unverifiedCb.status).toBe(302);
    expect(unverifiedCb.headers.get('Location')).toBe('/?authError=unverified_email');
  });

  it('completes GitHub OAuth PKCE flow, blocks CSRF state mismatch, and blocks uninvited users', async () => {
    const app = createApp();
    const env = createOAuthEnv();

    const startRes = await app.request('https://todo.example.com/api/auth/oauth/github', {}, env);
    expect(startRes.status).toBe(302);
    const authUrl = new URL(startRes.headers.get('Location')!);
    expect(authUrl.origin).toBe('https://github.com');
    const state = authUrl.searchParams.get('state')!;
    const stateCookie = startRes.headers.get('Set-Cookie')!.split(';')[0];

    // Mismatched state blocked (Login CSRF protection)
    const badStateRes = await app.request(
      'https://todo.example.com/api/auth/oauth/github/callback?code=gh1&state=tampered-state',
      { headers: { Cookie: stateCookie } },
      env
    );
    expect(badStateRes.status).toBe(302);
    expect(badStateRes.headers.get('Location')).toBe('/?authError=invalid_state');

    // Verified secondary email matching ALLOWED_EMAILS succeeds
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('github.com/login/oauth/access_token')) {
        return new Response(JSON.stringify({ access_token: 'gh-token' }), { status: 200 });
      }
      if (url.includes('api.github.com/user/emails')) {
        return new Response(
          JSON.stringify([
            { email: 'unverified@example.com', primary: true, verified: false },
            { email: 'other@example.com', primary: false, verified: true },
            { email: 'bob@example.com', primary: false, verified: true },
          ]),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const okCb = await app.request(
      `https://todo.example.com/api/auth/oauth/github/callback?code=gh1&state=${encodeURIComponent(state)}`,
      { headers: { Cookie: stateCookie } },
      env
    );
    expect(okCb.status).toBe(302);
    expect(okCb.headers.get('Location')).toBe('/');
    const sessionCookie = okCb.headers
      .getSetCookie()
      .find((c) => c.startsWith('private_todo_session='));
    expect(sessionCookie).toBeTruthy();

    // Uninvited user blocked cleanly
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('github.com/login/oauth/access_token')) {
        return new Response(JSON.stringify({ access_token: 'gh-token' }), { status: 200 });
      }
      return new Response(
        JSON.stringify([{ email: 'stranger@example.net', primary: true, verified: true }]),
        { status: 200 }
      );
    });

    const deniedCb = await app.request(
      `https://todo.example.com/api/auth/oauth/github/callback?code=gh2&state=${encodeURIComponent(state)}`,
      { headers: { Cookie: stateCookie } },
      env
    );
    expect(deniedCb.status).toBe(302);
    expect(deniedCb.headers.get('Location')).toBe('/?authError=email_not_allowed');
  });
});
