import { Hono, type MiddlewareHandler } from 'hono';
import type { AuthStatusResponse } from '../shared/types';
import {
  buildClearSessionCookie,
  buildSessionCookie,
  checkRateLimit,
  clearAuthFailures,
  createSessionToken,
  getCookieValue,
  hashClientIdentifier,
  isAllowedEmail,
  isCfAccessEnabled,
  isEmailOtpConfigured,
  isSameOriginMutation,
  isValidEmailFormat,
  isValidOtpFormat,
  issueEmailOtp,
  normalizeEmail,
  recordAuthFailure,
  sendOtpEmail,
  SESSION_COOKIE_NAME,
  verifyCloudflareAccessJwt,
  verifyEmailOtp,
  verifySessionToken,
} from './auth';
import {
  clearCompletedTodos,
  createTodo,
  deleteTodo,
  ensureSchema,
  importTodos,
  listTodos,
  updateTodo,
} from './db';
import type { AppVariables, Env } from './types';
import { validateCreateTodo, validateImportPayload, validateUpdateTodo } from './validation';

function applySecurityHeaders(headers: Headers, isApi: boolean): void {
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isApi) {
    headers.set('Cache-Control', 'no-store, private');
  }
}

function isHttpsRequest(request: Request): boolean {
  const url = new URL(request.url);
  if (url.protocol === 'https:') return true;
  return request.headers.get('X-Forwarded-Proto') === 'https';
}

export function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  app.use('*', async (c, next) => {
    await next();
    const isApi = new URL(c.req.url).pathname.startsWith('/api/');
    applySecurityHeaders(c.res.headers, isApi);
  });

  app.get('/robots.txt', (c) => {
    return c.text('User-agent: *\nDisallow: /\n', 200, {
      'Content-Type': 'text/plain; charset=utf-8',
    });
  });

  app.get('/api/health', (c) => {
    return c.json({ ok: true });
  });

  app.get('/api/auth/status', async (c) => {
    const cfAccessEnabled = isCfAccessEnabled(c.env);
    const emailOtpReady = isEmailOtpConfigured(c.env, c.req.url);
    const configured = cfAccessEnabled || emailOtpReady;

    if (cfAccessEnabled) {
      const cfResult = await verifyCloudflareAccessJwt(c.req.raw, c.env);
      if (cfResult.valid) {
        const res: AuthStatusResponse = {
          authenticated: true,
          configured,
          emailOtpReady,
          cfAccessEnabled,
          authMethod: 'cf-access',
          userEmail: cfResult.email,
        };
        return c.json(res);
      }
    }

    const token = getCookieValue(c.req.header('Cookie'), SESSION_COOKIE_NAME);
    const session = await verifySessionToken(token, c.env.SESSION_SECRET, c.env.ALLOWED_EMAIL);

    const res: AuthStatusResponse = {
      authenticated: session.valid,
      configured,
      emailOtpReady,
      cfAccessEnabled,
      authMethod: session.valid ? 'email-otp' : null,
      userEmail: session.valid ? session.email : null,
    };
    return c.json(res);
  });

  app.post('/api/auth/request-code', async (c) => {
    if (!isSameOriginMutation(c.req.raw)) {
      return c.json({ error: '허용되지 않은 요청 출처입니다.' }, 403);
    }

    if (!isEmailOtpConfigured(c.env, c.req.url)) {
      return c.json(
        { error: '이메일 인증 발송 설정(ALLOWED_EMAIL / SESSION_SECRET / 메일 발송기)이 필요합니다.' },
        503
      );
    }

    await ensureSchema(c.env.DB);
    const ipHash = await hashClientIdentifier(c.req.raw, c.env.SESSION_SECRET!);
    const limit = await checkRateLimit(c.env.DB, ipHash);
    if (!limit.allowed) {
      return c.json(
        {
          error: `인증 시도가 너무 많습니다. ${limit.retryAfterSeconds}초 후 다시 시도해 주세요.`,
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        429
      );
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'JSON 요청 형식이 올바르지 않습니다.' }, 400);
    }

    const email =
      body && typeof body === 'object' && typeof (body as Record<string, unknown>).email === 'string'
        ? normalizeEmail((body as Record<string, unknown>).email as string)
        : '';

    if (!isValidEmailFormat(email)) {
      return c.json({ error: '올바른 이메일 주소를 입력해 주세요.' }, 400);
    }

    const allowed = await isAllowedEmail(email, c.env);
    if (!allowed) {
      // Anti-enumeration: respond identically without sending an email
      return c.json({
        ok: true,
        message: '허용된 이메일이라면 6자리 인증 코드를 발송했습니다.',
        cooldownSeconds: 60,
      });
    }

    const issued = await issueEmailOtp(c.env.DB, email, c.env.SESSION_SECRET!);
    if (!issued.sent) {
      return c.json(
        {
          error: `인증 코드는 ${issued.cooldownSeconds}초 후에 다시 요청할 수 있습니다.`,
          retryAfterSeconds: issued.cooldownSeconds,
        },
        429
      );
    }

    try {
      await sendOtpEmail(email, issued.code!, c.env, c.req.url);
    } catch {
      return c.json({ error: '인증 메일 발송에 실패했습니다. 메일 설정을 확인해 주세요.' }, 502);
    }

    return c.json({
      ok: true,
      message: '허용된 이메일이라면 6자리 인증 코드를 발송했습니다.',
      cooldownSeconds: 60,
    });
  });

  app.post('/api/auth/verify-code', async (c) => {
    if (!isSameOriginMutation(c.req.raw)) {
      return c.json({ error: '허용되지 않은 요청 출처입니다.' }, 403);
    }

    if (!isEmailOtpConfigured(c.env, c.req.url)) {
      return c.json({ error: '이메일 인증 설정이 완료되지 않았습니다.' }, 503);
    }

    await ensureSchema(c.env.DB);
    const ipHash = await hashClientIdentifier(c.req.raw, c.env.SESSION_SECRET!);
    const limit = await checkRateLimit(c.env.DB, ipHash);
    if (!limit.allowed) {
      return c.json(
        {
          error: `인증 시도가 너무 많습니다. ${limit.retryAfterSeconds}초 후 다시 시도해 주세요.`,
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        429
      );
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'JSON 요청 형식이 올바르지 않습니다.' }, 400);
    }

    const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const email = typeof raw.email === 'string' ? normalizeEmail(raw.email) : '';
    const code = typeof raw.code === 'string' ? raw.code.trim() : '';

    if (!isValidEmailFormat(email) || !isValidOtpFormat(code)) {
      return c.json({ error: '이메일과 6자리 숫자 인증 코드를 입력해 주세요.' }, 400);
    }

    const allowed = await isAllowedEmail(email, c.env);
    const otpResult = allowed
      ? await verifyEmailOtp(c.env.DB, email, code, c.env.SESSION_SECRET!)
      : { valid: false as const, reason: 'mismatch' as const };

    if (!otpResult.valid) {
      const nextLimit = await recordAuthFailure(c.env.DB, ipHash);
      if (!nextLimit.allowed) {
        return c.json(
          {
            error: `인증 코드를 여러 번 잘못 입력했습니다. ${nextLimit.retryAfterSeconds}초 동안 잠깁니다.`,
            retryAfterSeconds: nextLimit.retryAfterSeconds,
          },
          429
        );
      }
      const message =
        otpResult.reason === 'expired'
          ? '인증 코드가 만료되었거나 존재하지 않습니다. 코드를 다시 요청해 주세요.'
          : '이메일 또는 인증 코드가 올바르지 않습니다.';
      return c.json({ error: message }, 401);
    }

    await clearAuthFailures(c.env.DB, ipHash);
    const token = await createSessionToken(email, c.env.SESSION_SECRET!);
    c.header('Set-Cookie', buildSessionCookie(token, isHttpsRequest(c.req.raw)));
    return c.json({ authenticated: true, authMethod: 'email-otp', userEmail: email });
  });

  app.post('/api/auth/logout', (c) => {
    if (!isSameOriginMutation(c.req.raw)) {
      return c.json({ error: '허용되지 않은 요청 출처입니다.' }, 403);
    }
    c.header('Set-Cookie', buildClearSessionCookie(isHttpsRequest(c.req.raw)));
    return c.json({ authenticated: false });
  });

  const requireAuth: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = async (
    c,
    next
  ) => {
    const method = c.req.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      if (!isSameOriginMutation(c.req.raw)) {
        return c.json({ error: '허용되지 않은 요청 출처입니다.' }, 403);
      }
    }

    if (isCfAccessEnabled(c.env)) {
      const cfResult = await verifyCloudflareAccessJwt(c.req.raw, c.env);
      if (cfResult.valid) {
        c.set('authMethod', 'cf-access');
        c.set('userEmail', cfResult.email ?? '');
        await ensureSchema(c.env.DB);
        return next();
      }
    }

    const token = getCookieValue(c.req.header('Cookie'), SESSION_COOKIE_NAME);
    const session = await verifySessionToken(token, c.env.SESSION_SECRET, c.env.ALLOWED_EMAIL);
    if (!session.valid) {
      return c.json({ error: '이메일 인증이 필요합니다.' }, 401);
    }

    c.set('authMethod', 'email-otp');
    c.set('userEmail', session.email ?? '');
    await ensureSchema(c.env.DB);
    return next();
  };

  app.use('/api/todos', requireAuth);
  app.use('/api/todos/*', requireAuth);

  app.get('/api/todos', async (c) => {
    const items = await listTodos(c.env.DB);
    return c.json({ items });
  });

  app.post('/api/todos', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'JSON 요청 형식이 올바르지 않습니다.' }, 400);
    }

    const parsed = validateCreateTodo(body);
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }

    const item = await createTodo(c.env.DB, parsed.data);
    return c.json({ item }, 201);
  });

  app.post('/api/todos/import', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'JSON 요청 형식이 올바르지 않습니다.' }, 400);
    }

    const parsed = validateImportPayload(body);
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }

    const items = await importTodos(c.env.DB, parsed.data);
    return c.json({ items, importedCount: items.length }, 201);
  });

  app.delete('/api/todos/completed', async (c) => {
    const deletedCount = await clearCompletedTodos(c.env.DB);
    return c.json({ deletedCount });
  });

  app.patch('/api/todos/:id', async (c) => {
    const id = c.req.param('id');
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'JSON 요청 형식이 올바르지 않습니다.' }, 400);
    }

    const parsed = validateUpdateTodo(body);
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }

    const item = await updateTodo(c.env.DB, id, parsed.data);
    if (!item) {
      return c.json({ error: '할 일을 찾을 수 없습니다.' }, 404);
    }

    return c.json({ item });
  });

  app.delete('/api/todos/:id', async (c) => {
    const id = c.req.param('id');
    const deleted = await deleteTodo(c.env.DB, id);
    if (!deleted) {
      return c.json({ error: '할 일을 찾을 수 없습니다.' }, 404);
    }
    return c.json({ deleted: true, id });
  });

  app.all('/api/*', (c) => {
    return c.json({ error: '요청한 API 경로를 찾을 수 없습니다.' }, 404);
  });

  app.all('*', async (c) => {
    if (c.env.ASSETS) {
      const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
      const response = new Response(assetResponse.body, assetResponse);
      applySecurityHeaders(response.headers, false);
      return response;
    }
    return c.text('Not Found', 404);
  });

  return app;
}

const app = createApp();
export default app;
