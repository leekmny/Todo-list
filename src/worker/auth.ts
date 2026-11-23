import type { Env } from './types';

export const SESSION_COOKIE_NAME = 'private_todo_session';
export const LONG_SESSION_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days (Remember me)
export const SHORT_SESSION_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const SESSION_RENEW_THRESHOLD_SECONDS = 60 * 60 * 12; // Renew silently after 12 hours
const MAX_AUTH_FAILURES = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const OTP_MAX_ATTEMPTS = 5;
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_CODE_RE = /^\d{6}$/;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

interface SessionPayload {
  v: 1;
  sub: string;
  rm?: boolean;
  iat: number;
  exp: number;
}

export interface VerifiedSession {
  valid: boolean;
  email: string | null;
  rememberMe: boolean;
  shouldRenew: boolean;
}

interface JwksKey extends JsonWebKey {
  kid?: string;
}

interface JwksCacheEntry {
  keys: JwksKey[];
  expiresAt: number;
}

const jwksCache = new Map<string, JwksCacheEntry>();

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

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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

export async function verifySecretEqual(input: string, expected: string): Promise<boolean> {
  const ephemeralKey = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const [a, b] = await Promise.all([
    hmacSha256(ephemeralKey, textEncoder.encode(input)),
    hmacSha256(ephemeralKey, textEncoder.encode(expected)),
  ]);
  return constantTimeEqual(a, b);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmailFormat(email: string): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length <= 254 && EMAIL_RE.test(normalized);
}

export function isValidOtpFormat(code: string): boolean {
  return OTP_CODE_RE.test(code.trim());
}

export function getAllowedEmails(env: Env): string[] {
  const combined = [env.ALLOWED_EMAILS ?? '', env.ALLOWED_EMAIL ?? ''].join(',');
  const unique = new Set<string>();
  for (const part of combined.split(/[\s,;]+/)) {
    const normalized = normalizeEmail(part);
    if (normalized && isValidEmailFormat(normalized)) {
      unique.add(normalized);
    }
  }
  return Array.from(unique);
}

export function isLocalhostUrl(requestUrl: string): boolean {
  try {
    const host = new URL(requestUrl).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

export function isCfAccessEnabled(env: Env): boolean {
  return (
    env.CF_ACCESS_ENABLED === 'true' &&
    Boolean(env.CF_ACCESS_TEAM_DOMAIN?.trim()) &&
    Boolean(env.CF_ACCESS_AUD?.trim())
  );
}

export function isPublicSignupEnabled(env: Env): boolean {
  return env.ALLOW_PUBLIC_SIGNUP === 'true';
}

export function isEmailOtpConfigured(env: Env, requestUrl: string): boolean {
  const hasAccessRule = getAllowedEmails(env).length > 0 || isPublicSignupEnabled(env);
  const hasSessionSecret = Boolean(env.SESSION_SECRET?.trim());
  const hasMailSender =
    Boolean(env.RESEND_API_KEY?.trim()) ||
    (env.DEV_OTP_CONSOLE === 'true' && isLocalhostUrl(requestUrl));
  return hasAccessRule && hasSessionSecret && hasMailSender;
}

export async function isAllowedEmail(email: string, env: Env): Promise<boolean> {
  if (isPublicSignupEnabled(env)) {
    return isValidEmailFormat(email);
  }
  const allowedList = getAllowedEmails(env);
  if (allowedList.length === 0) return false;

  const candidate = normalizeEmail(email);
  let matched = false;
  for (const allowed of allowedList) {
    if (await verifySecretEqual(candidate, allowed)) {
      matched = true;
    }
  }
  return matched;
}

export function generateSixDigitOtp(): string {
  const maxUnbiased = 4_294_000_000;
  const buf = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(buf);
    if (buf[0] < maxUnbiased) {
      return String(buf[0] % 1_000_000).padStart(6, '0');
    }
  }
}

async function hashEmailKey(email: string, sessionSecret: string): Promise<string> {
  const digest = await hmacSha256(
    sessionSecret,
    textEncoder.encode(`email:${normalizeEmail(email)}`)
  );
  return bytesToHex(digest);
}

async function hashOtpValue(email: string, code: string, sessionSecret: string): Promise<string> {
  const digest = await hmacSha256(
    sessionSecret,
    textEncoder.encode(`otp:${normalizeEmail(email)}:${code.trim()}`)
  );
  return bytesToHex(digest);
}

export interface IssueOtpResult {
  sent: boolean;
  code?: string;
  cooldownSeconds?: number;
}

export async function issueEmailOtp(
  db: D1Database,
  email: string,
  sessionSecret: string,
  nowMs = Date.now()
): Promise<IssueOtpResult> {
  const emailHash = await hashEmailKey(email, sessionSecret);
  const existing = await db
    .prepare('SELECT last_sent_at FROM email_otps WHERE email_hash = ?')
    .bind(emailHash)
    .first<{ last_sent_at: number }>();

  if (existing && nowMs - existing.last_sent_at < OTP_RESEND_COOLDOWN_MS) {
    const remainingMs = OTP_RESEND_COOLDOWN_MS - (nowMs - existing.last_sent_at);
    return {
      sent: false,
      cooldownSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
    };
  }

  const code = generateSixDigitOtp();
  const codeHash = await hashOtpValue(email, code, sessionSecret);
  const expiresAt = nowMs + OTP_TTL_MS;

  await db
    .prepare(
      `INSERT INTO email_otps (email_hash, code_hash, attempts, expires_at, last_sent_at)
       VALUES (?, ?, 0, ?, ?)
       ON CONFLICT(email_hash) DO UPDATE SET
         code_hash = excluded.code_hash,
         attempts = 0,
         expires_at = excluded.expires_at,
         last_sent_at = excluded.last_sent_at`
    )
    .bind(emailHash, codeHash, expiresAt, nowMs)
    .run();

  return { sent: true, code };
}

export async function verifyEmailOtp(
  db: D1Database,
  email: string,
  code: string,
  sessionSecret: string,
  nowMs = Date.now()
): Promise<{ valid: boolean; reason?: 'expired' | 'attempts' | 'mismatch' }> {
  const emailHash = await hashEmailKey(email, sessionSecret);
  const row = await db
    .prepare('SELECT code_hash, attempts, expires_at FROM email_otps WHERE email_hash = ?')
    .bind(emailHash)
    .first<{ code_hash: string; attempts: number; expires_at: number }>();

  if (!row || row.expires_at <= nowMs) {
    if (row) {
      await db.prepare('DELETE FROM email_otps WHERE email_hash = ?').bind(emailHash).run();
    }
    return { valid: false, reason: 'expired' };
  }

  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    await db.prepare('DELETE FROM email_otps WHERE email_hash = ?').bind(emailHash).run();
    return { valid: false, reason: 'attempts' };
  }

  const candidateHash = await hashOtpValue(email, code, sessionSecret);
  const matches = await verifySecretEqual(candidateHash, row.code_hash);
  if (!matches) {
    await db
      .prepare('UPDATE email_otps SET attempts = attempts + 1 WHERE email_hash = ?')
      .bind(emailHash)
      .run();
    return { valid: false, reason: 'mismatch' };
  }

  await db.prepare('DELETE FROM email_otps WHERE email_hash = ?').bind(emailHash).run();
  return { valid: true };
}

export async function sendOtpEmail(
  recipientEmail: string,
  code: string,
  env: Env,
  requestUrl: string
): Promise<void> {
  const resendApiKey = env.RESEND_API_KEY?.trim();
  if (resendApiKey) {
    const from = env.MAIL_FROM?.trim() || 'Private Todo <onboarding@resend.dev>';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [recipientEmail],
        subject: `[Private Todo] 로그인 인증 코드: ${code}`,
        text: `Private Todo 로그인 인증 코드입니다.\n\n인증 코드: ${code}\n\n이 코드는 10분간 유효합니다. 본인이 요청하지 않았다면 이 메일을 무시하세요.`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 440px; margin: 0 auto; padding: 24px; color: #11131a;">
            <h2 style="margin: 0 0 12px; font-size: 20px;">Private Todo 이메일 인증</h2>
            <p style="margin: 0 0 18px; color: #51586c; font-size: 14px;">아래 6자리 인증 코드를 입력하여 나만의 할 일 공간에 로그인하세요. 코드는 10분 후 만료됩니다.</p>
            <div style="font-size: 30px; font-weight: 700; letter-spacing: 6px; padding: 16px 20px; background: #f4f5f8; border-radius: 10px; text-align: center;">${code}</div>
            <p style="margin: 18px 0 0; color: #848b9f; font-size: 12px;">본인이 요청하지 않은 경우 이 메일을 무시해 주세요.</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      throw new Error(`Email delivery failed (${response.status})`);
    }
    return;
  }

  if (env.DEV_OTP_CONSOLE === 'true' && isLocalhostUrl(requestUrl)) {
    console.log(`[DEV EMAIL OTP] ${recipientEmail} => ${code}`);
    return;
  }

  throw new Error('No email sender configured');
}

export async function createSessionToken(
  email: string,
  sessionSecret: string,
  rememberMe = true,
  nowMs = Date.now()
): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  const ttl = rememberMe ? LONG_SESSION_TTL_SECONDS : SHORT_SESSION_TTL_SECONDS;
  const payload: SessionPayload = {
    v: 1,
    sub: normalizeEmail(email),
    rm: rememberMe,
    iat,
    exp: iat + ttl,
  };
  const encodedPayload = toBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const sig = await hmacSha256(sessionSecret, textEncoder.encode(encodedPayload));
  return `${encodedPayload}.${toBase64Url(sig)}`;
}

export async function verifySessionToken(
  token: string | null | undefined,
  sessionSecret: string | undefined,
  allowedEmails?: readonly string[],
  nowMs = Date.now()
): Promise<VerifiedSession> {
  const invalid: VerifiedSession = {
    valid: false,
    email: null,
    rememberMe: false,
    shouldRenew: false,
  };

  if (!token || !sessionSecret) return invalid;
  const parts = token.split('.');
  if (parts.length !== 2) return invalid;

  const [encodedPayload, encodedSig] = parts;
  const providedSig = fromBase64Url(encodedSig);
  if (!providedSig) return invalid;

  const expectedSig = await hmacSha256(sessionSecret, textEncoder.encode(encodedPayload));
  if (!constantTimeEqual(providedSig, expectedSig)) return invalid;

  const payloadBytes = fromBase64Url(encodedPayload);
  if (!payloadBytes) return invalid;

  try {
    const payload = JSON.parse(textDecoder.decode(payloadBytes)) as Partial<SessionPayload>;
    const nowSec = Math.floor(nowMs / 1000);
    if (
      payload.v !== 1 ||
      typeof payload.sub !== 'string' ||
      !isValidEmailFormat(payload.sub) ||
      typeof payload.exp !== 'number' ||
      typeof payload.iat !== 'number' ||
      payload.exp <= nowSec ||
      payload.iat > nowSec + 60
    ) {
      return invalid;
    }

    const email = normalizeEmail(payload.sub);
    if (allowedEmails && allowedEmails.length > 0) {
      const normalizedList = allowedEmails.map(normalizeEmail);
      if (!normalizedList.includes(email)) {
        return invalid;
      }
    }

    const rememberMe = payload.rm !== false;
    const ageSeconds = nowSec - payload.iat;
    const shouldRenew = rememberMe && ageSeconds >= SESSION_RENEW_THRESHOLD_SECONDS;

    return { valid: true, email, rememberMe, shouldRenew };
  } catch {
    return invalid;
  }
}

export function getCookieValue(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';');
  for (const part of cookies) {
    const trimmed = part.trim();
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    if (trimmed.slice(0, eqIndex) === name) {
      return trimmed.slice(eqIndex + 1);
    }
  }
  return null;
}

export function buildSessionCookie(
  token: string,
  isHttps: boolean,
  rememberMe = true,
  nowMs = Date.now()
): string {
  const ttl = rememberMe ? LONG_SESSION_TTL_SECONDS : SHORT_SESSION_TTL_SECONDS;
  const expires = new Date(nowMs + ttl * 1000).toUTCString();
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${ttl}`,
    `Expires=${expires}`,
  ];
  if (isHttps) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function buildClearSessionCookie(isHttps: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
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

export async function hashClientIdentifier(request: Request, sessionSecret: string): Promise<string> {
  const ip =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'local';
  const digest = await hmacSha256(sessionSecret || 'fallback', textEncoder.encode(`ip:${ip}`));
  return bytesToHex(digest);
}

export interface RateLimitStatus {
  allowed: boolean;
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  db: D1Database,
  ipHash: string,
  nowMs = Date.now()
): Promise<RateLimitStatus> {
  const row = await db
    .prepare('SELECT failures, locked_until FROM auth_attempts WHERE ip_hash = ?')
    .bind(ipHash)
    .first<{ failures: number; locked_until: number }>();

  if (!row || row.locked_until <= nowMs) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((row.locked_until - nowMs) / 1000)),
  };
}

export async function recordAuthFailure(
  db: D1Database,
  ipHash: string,
  nowMs = Date.now()
): Promise<RateLimitStatus> {
  const row = await db
    .prepare('SELECT failures, locked_until FROM auth_attempts WHERE ip_hash = ?')
    .bind(ipHash)
    .first<{ failures: number; locked_until: number }>();

  const resetWindow = Boolean(row && row.locked_until > 0 && row.locked_until <= nowMs);
  const failures = (resetWindow ? 0 : row?.failures ?? 0) + 1;
  const lockedUntil = failures >= MAX_AUTH_FAILURES ? nowMs + LOCKOUT_MS : 0;

  await db
    .prepare(
      `INSERT INTO auth_attempts (ip_hash, failures, locked_until, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(ip_hash) DO UPDATE SET
         failures = excluded.failures,
         locked_until = excluded.locked_until,
         updated_at = excluded.updated_at`
    )
    .bind(ipHash, failures, lockedUntil, nowMs)
    .run();

  if (lockedUntil > nowMs) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((lockedUntil - nowMs) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function clearAuthFailures(db: D1Database, ipHash: string): Promise<void> {
  await db.prepare('DELETE FROM auth_attempts WHERE ip_hash = ?').bind(ipHash).run();
}

export function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get('Origin');
  if (origin) {
    const reqOrigin = new URL(request.url).origin;
    if (origin !== reqOrigin) {
      return false;
    }
  }
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return false;
  }
  return true;
}

async function fetchCfAccessKeys(teamDomain: string): Promise<JwksKey[]> {
  const normalizedDomain = teamDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const cached = jwksCache.get(normalizedDomain);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.keys;
  }

  const response = await fetch(`https://${normalizedDomain}/cdn-cgi/access/certs`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as { keys?: JwksKey[] };
  const keys = Array.isArray(data.keys) ? data.keys : [];
  jwksCache.set(normalizedDomain, { keys, expiresAt: Date.now() + JWKS_CACHE_TTL_MS });
  return keys;
}

export async function verifyCloudflareAccessJwt(
  request: Request,
  env: Env
): Promise<{ valid: boolean; email: string | null }> {
  if (!isCfAccessEnabled(env)) return { valid: false, email: null };

  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) return { valid: false, email: null };

  const parts = jwt.split('.');
  if (parts.length !== 3) return { valid: false, email: null };

  const [headerB64, payloadB64, sigB64] = parts;
  const headerBytes = fromBase64Url(headerB64);
  const payloadBytes = fromBase64Url(payloadB64);
  const sigBytes = fromBase64Url(sigB64);
  if (!headerBytes || !payloadBytes || !sigBytes) return { valid: false, email: null };

  let header: { kid?: string; alg?: string };
  let payload: { aud?: string | string[]; exp?: number; nbf?: number; email?: string };
  try {
    header = JSON.parse(textDecoder.decode(headerBytes));
    payload = JSON.parse(textDecoder.decode(payloadBytes));
  } catch {
    return { valid: false, email: null };
  }

  if (header.alg !== 'RS256') return { valid: false, email: null };

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    return { valid: false, email: null };
  }
  if (typeof payload.nbf === 'number' && payload.nbf > nowSec + 60) {
    return { valid: false, email: null };
  }

  const expectedAud = env.CF_ACCESS_AUD!.trim();
  const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (!audiences.includes(expectedAud)) return { valid: false, email: null };

  const email = typeof payload.email === 'string' ? normalizeEmail(payload.email) : null;
  if (!email || !isValidEmailFormat(email)) {
    return { valid: false, email: null };
  }

  const allowedList = getAllowedEmails(env);
  if (allowedList.length > 0 && !allowedList.includes(email)) {
    return { valid: false, email: null };
  }

  const keys = await fetchCfAccessKeys(env.CF_ACCESS_TEAM_DOMAIN!.trim());
  const candidates = header.kid ? keys.filter((k) => k.kid === header.kid) : keys;
  const signingInput = textEncoder.encode(`${headerB64}.${payloadB64}`);

  for (const jwk of candidates) {
    try {
      const cryptoKey = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );
      const valid = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        sigBytes,
        signingInput
      );
      if (valid) return { valid: true, email };
    } catch {
      continue;
    }
  }

  return { valid: false, email: null };
}
