import type { OAuthProvidersStatus } from '../shared/types';
import { getCookieValue, normalizeEmail, verifySecretEqual } from './auth';
import type { Env } from './types';

export type OAuthProvider = 'google' | 'github';

export const OAUTH_STATE_COOKIE_NAME = 'private_todo_oauth_state';
const OAUTH_STATE_TTL_SECONDS = 60 * 10; // 10 minutes

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface OAuthStatePayload {
  v: 1;
  provider: OAuthProvider;
  state: string;
  codeVerifier: string;
  rememberMe: boolean;
  exp: number;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const binary = atob(padded + '='.repeat(padLen));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function hmacSha256(secret: string, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return new Uint8Array(sig);
}

export function getOAuthProvidersStatus(env: Env): OAuthProvidersStatus {
  const hasSessionSecret = Boolean(env.SESSION_SECRET?.trim());
  const google =
    hasSessionSecret &&
    Boolean(env.GOOGLE_CLIENT_ID?.trim()) &&
    Boolean(env.GOOGLE_CLIENT_SECRET?.trim());
  const github =
    hasSessionSecret &&
    Boolean(env.GITHUB_CLIENT_ID?.trim()) &&
    Boolean(env.GITHUB_CLIENT_SECRET?.trim());
  return { google, github };
}

export function generateRandomToken(byteLength = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function generatePkcePair(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const codeVerifier = generateRandomToken(32);
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(codeVerifier));
  const codeChallenge = toBase64Url(new Uint8Array(digest));
  return { codeVerifier, codeChallenge };
}

export async function createOAuthStateCookie(
  provider: OAuthProvider,
  state: string,
  codeVerifier: string,
  rememberMe: boolean,
  sessionSecret: string,
  isHttps: boolean,
  nowMs = Date.now()
): Promise<string> {
  const payload: OAuthStatePayload = {
    v: 1,
    provider,
    state,
    codeVerifier,
    rememberMe,
    exp: Math.floor(nowMs / 1000) + OAUTH_STATE_TTL_SECONDS,
  };
  const encodedPayload = toBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const sig = await hmacSha256(sessionSecret, textEncoder.encode(encodedPayload));
  const token = `${encodedPayload}.${toBase64Url(sig)}`;

  const parts = [
    `${OAUTH_STATE_COOKIE_NAME}=${token}`,
    'Path=/api/auth/oauth',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${OAUTH_STATE_TTL_SECONDS}`,
  ];
  if (isHttps) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function buildClearOAuthStateCookie(isHttps: boolean): string {
  const parts = [
    `${OAUTH_STATE_COOKIE_NAME}=`,
    'Path=/api/auth/oauth',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (isHttps) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export async function verifyOAuthStateCookie(
  cookieHeader: string | null | undefined,
  expectedProvider: OAuthProvider,
  providedState: string | null | undefined,
  sessionSecret: string | undefined,
  nowMs = Date.now()
): Promise<OAuthStatePayload | null> {
  if (!providedState || !sessionSecret) return null;
  const token = getCookieValue(cookieHeader, OAUTH_STATE_COOKIE_NAME);
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, encodedSig] = parts;
  const sigBytes = fromBase64Url(encodedSig);
  if (!sigBytes) return null;

  const expectedSig = await hmacSha256(sessionSecret, textEncoder.encode(encodedPayload));
  if (!constantTimeEqual(sigBytes, expectedSig)) return null;

  const payloadBytes = fromBase64Url(encodedPayload);
  if (!payloadBytes) return null;

  try {
    const payload = JSON.parse(textDecoder.decode(payloadBytes)) as Partial<OAuthStatePayload>;
    const nowSec = Math.floor(nowMs / 1000);
    if (
      payload.v !== 1 ||
      payload.provider !== expectedProvider ||
      typeof payload.state !== 'string' ||
      typeof payload.codeVerifier !== 'string' ||
      typeof payload.exp !== 'number' ||
      payload.exp <= nowSec
    ) {
      return null;
    }

    const stateMatches = await verifySecretEqual(providedState, payload.state);
    if (!stateMatches) return null;

    return {
      v: 1,
      provider: payload.provider,
      state: payload.state,
      codeVerifier: payload.codeVerifier,
      rememberMe: payload.rememberMe !== false,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export function buildGoogleAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  codeChallenge: string
): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

export function buildGitHubAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  codeChallenge: string
): string {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'read:user user:email');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export async function exchangeGoogleCodeForVerifiedEmail(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  env: Env
): Promise<{ ok: true; emails: string[] } | { ok: false; code: 'token_failed' | 'unverified_email' }> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!.trim(),
      client_secret: env.GOOGLE_CLIENT_SECRET!.trim(),
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    return { ok: false, code: 'token_failed' };
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) {
    return { ok: false, code: 'token_failed' };
  }

  const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userRes.ok) {
    return { ok: false, code: 'token_failed' };
  }

  const profile = (await userRes.json()) as { email?: string; email_verified?: boolean };
  if (!profile.email || profile.email_verified !== true) {
    return { ok: false, code: 'unverified_email' };
  }

  return { ok: true, emails: [normalizeEmail(profile.email)] };
}

export async function exchangeGitHubCodeForVerifiedEmails(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  env: Env
): Promise<{ ok: true; emails: string[] } | { ok: false; code: 'token_failed' | 'unverified_email' }> {
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'private-todo-app',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID!.trim(),
      client_secret: env.GITHUB_CLIENT_SECRET!.trim(),
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    return { ok: false, code: 'token_failed' };
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenData.access_token || tokenData.error) {
    return { ok: false, code: 'token_failed' };
  }

  const emailsRes = await fetch('https://api.github.com/user/emails', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'private-todo-app',
    },
  });

  if (!emailsRes.ok) {
    return { ok: false, code: 'token_failed' };
  }

  const entries = (await emailsRes.json()) as Array<{
    email?: string;
    primary?: boolean;
    verified?: boolean;
  }>;

  if (!Array.isArray(entries)) {
    return { ok: false, code: 'token_failed' };
  }

  const verified = entries
    .filter((entry) => entry.verified === true && typeof entry.email === 'string' && entry.email.trim())
    .sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)))
    .map((entry) => normalizeEmail(entry.email!));

  if (verified.length === 0) {
    return { ok: false, code: 'unverified_email' };
  }

  return { ok: true, emails: Array.from(new Set(verified)) };
}
