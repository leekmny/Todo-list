import { Hono, type MiddlewareHandler } from 'hono';
import type { AuthStatusResponse } from '../shared/types';
import {
  buildClearSessionCookie,
  buildSessionCookie,
  checkRateLimit,
  clearAuthFailures,
  createSessionToken,
  getAllowedEmails,
  getCookieValue,
  hashClientIdentifier,
  isAllowedEmail,
  isCfAccessEnabled,
  isEmailOtpConfigured,
  isPublicSignupEnabled,
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
  buildContentDisposition,
  isInlinePreviewableImage,
  validateAttachmentUpload,
} from './attachments';
import {
  addAttachment,
  clearCompletedTodos,
  createTodo,
  deleteAttachment,
  deleteTodo,
  ensureSchema,
  getAttachmentWithData,
  importTodos,
  listTodos,
  reorderTodos,
  updateTodo,
} from './db';
import {
  buildClearOAuthStateCookie,
  buildGitHubAuthorizeUrl,
  buildGoogleAuthorizeUrl,
  createOAuthStateCookie,
  exchangeGitHubCodeForVerifiedEmails,
  exchangeGoogleCodeForVerifiedEmail,
  generatePkcePair,
  generateRandomToken,
  getOAuthProvidersStatus,
  verifyOAuthStateCookie,
  type OAuthProvider,
} from './oauth';
import type { AppVariables, Env } from './types';
import {
  validateCreateTodo,
  validateImportPayload,
  validateReorderPayload,
  validateUpdateTodo,
} from './validation';

const MAX_BODY_BYTES = 512 * 1024; // 512 KB for JSON requests
const MAX_UPLOAD_BODY_BYTES = 2 * 1024 * 1024; // 2 MB multipart envelope for 1.5 MB files

const WEB_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function applySecurityHeaders(headers: Headers, isApi: boolean, isHttps: boolean): void {
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  if (isHttps) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (isApi) {
    headers.set('Cache-Control', 'no-store, private');
  } else if (!headers.has('Content-Security-Policy')) {
    headers.set('Content-Security-Policy', WEB_CSP);
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
    const pathname = new URL(c.req.url).pathname;
    const isAttachmentUpload = /^\/api\/todos\/[^/]+\/attachments$/.test(pathname);
    const maxBytes = isAttachmentUpload ? MAX_UPLOAD_BODY_BYTES : MAX_BODY_BYTES;
    const contentLength = Number(c.req.header('Content-Length') ?? '0');
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return c.json(
        {
          error: isAttachmentUpload
            ? '파일 크기는 개당 최대 1.5MB까지 업로드할 수 있습니다.'
            : '요청 크기가 허용 한도(512KB)를 초과했습니다.',
        },
        413
      );
    }
    await next();
    const isApi = pathname.startsWith('/api/');
    applySecurityHeaders(c.res.headers, isApi, isHttpsRequest(c.req.raw));
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
    const oauthProviders = getOAuthProvidersStatus(c.env);
    const hasOAuth = oauthProviders.google || oauthProviders.github;
    const configured = cfAccessEnabled || emailOtpReady || hasOAuth;

    if (cfAccessEnabled) {
      const cfResult = await verifyCloudflareAccessJwt(c.req.raw, c.env);
      if (cfResult.valid && cfResult.email) {
        const res: AuthStatusResponse = {
          authenticated: true,
          configured,
          emailOtpReady,
          cfAccessEnabled,
          oauthProviders,
          authMethod: 'cf-access',
          userEmail: cfResult.email,
        };
        return c.json(res);
      }
    }

    const token = getCookieValue(c.req.header('Cookie'), SESSION_COOKIE_NAME);
    const allowedEmails = getAllowedEmails(c.env);
    const allowPublic = isPublicSignupEnabled(c.env);
    const session =
      allowedEmails.length > 0 || allowPublic
        ? await verifySessionToken(
            token,
            c.env.SESSION_SECRET,
            allowPublic ? undefined : allowedEmails
          )
        : { valid: false, email: null, rememberMe: false, shouldRenew: false };

    // Sliding session renewal: automatically extends persistent 90-day login
    if (session.valid && session.email && session.shouldRenew && c.env.SESSION_SECRET) {
      const renewedToken = await createSessionToken(
        session.email,
        c.env.SESSION_SECRET,
        session.rememberMe
      );
      c.header(
        'Set-Cookie',
        buildSessionCookie(renewedToken, isHttpsRequest(c.req.raw), session.rememberMe)
      );
    }

    const res: AuthStatusResponse = {
      authenticated: session.valid,
      configured,
      emailOtpReady,
      cfAccessEnabled,
      oauthProviders,
      authMethod: session.valid ? 'email-otp' : null,
      userEmail: session.valid ? session.email : null,
    };
    return c.json(res);
  });

  app.get('/api/auth/oauth/:provider', async (c) => {
    const providerParam = c.req.param('provider');
    if (providerParam !== 'google' && providerParam !== 'github') {
      return c.redirect('/?authError=invalid_provider', 302);
    }
    const provider: OAuthProvider = providerParam;
    const status = getOAuthProvidersStatus(c.env);
    if (!status[provider] || !c.env.SESSION_SECRET?.trim()) {
      return c.redirect('/?authError=oauth_not_configured', 302);
    }

    const reqUrl = new URL(c.req.url);
    const rememberMe = reqUrl.searchParams.get('rememberMe') !== '0';
    const state = generateRandomToken(32);
    const { codeVerifier, codeChallenge } = await generatePkcePair();
    const redirectUri = `${reqUrl.origin}/api/auth/oauth/${provider}/callback`;
    const isHttps = isHttpsRequest(c.req.raw);

    const stateCookie = await createOAuthStateCookie(
      provider,
      state,
      codeVerifier,
      rememberMe,
      c.env.SESSION_SECRET,
      isHttps
    );

    const authorizeUrl =
      provider === 'google'
        ? buildGoogleAuthorizeUrl(c.env.GOOGLE_CLIENT_ID!.trim(), redirectUri, state, codeChallenge)
        : buildGitHubAuthorizeUrl(c.env.GITHUB_CLIENT_ID!.trim(), redirectUri, state, codeChallenge);

    c.header('Set-Cookie', stateCookie);
    return c.redirect(authorizeUrl, 302);
  });

  app.get('/api/auth/oauth/:provider/callback', async (c) => {
    const providerParam = c.req.param('provider');
    const isHttps = isHttpsRequest(c.req.raw);
    const clearStateCookie = buildClearOAuthStateCookie(isHttps);

    if (providerParam !== 'google' && providerParam !== 'github') {
      c.header('Set-Cookie', clearStateCookie);
      return c.redirect('/?authError=invalid_provider', 302);
    }

    const provider: OAuthProvider = providerParam;
    const status = getOAuthProvidersStatus(c.env);
    if (!status[provider] || !c.env.SESSION_SECRET?.trim()) {
      c.header('Set-Cookie', clearStateCookie);
      return c.redirect('/?authError=oauth_not_configured', 302);
    }

    const reqUrl = new URL(c.req.url);
    const oauthError = reqUrl.searchParams.get('error');
    if (oauthError) {
      c.header('Set-Cookie', clearStateCookie);
      return c.redirect('/?authError=oauth_cancelled', 302);
    }

    const code = reqUrl.searchParams.get('code');
    const state = reqUrl.searchParams.get('state');
    const verifiedState = await verifyOAuthStateCookie(
      c.req.header('Cookie'),
      provider,
      state,
      c.env.SESSION_SECRET
    );

    if (!code || !verifiedState) {
      c.header('Set-Cookie', clearStateCookie);
      return c.redirect('/?authError=invalid_state', 302);
    }

    const redirectUri = `${reqUrl.origin}/api/auth/oauth/${provider}/callback`;
    const result =
      provider === 'google'
        ? await exchangeGoogleCodeForVerifiedEmail(
            code,
            verifiedState.codeVerifier,
            redirectUri,
            c.env
          )
        : await exchangeGitHubCodeForVerifiedEmails(
            code,
            verifiedState.codeVerifier,
            redirectUri,
            c.env
          );

    if (!result.ok) {
      c.header('Set-Cookie', clearStateCookie);
      return c.redirect(`/?authError=${result.code}`, 302);
    }

    let matchedEmail: string | null = null;
    for (const candidate of result.emails) {
      if (await isAllowedEmail(candidate, c.env)) {
        matchedEmail = candidate;
        break;
      }
    }

    if (!matchedEmail) {
      c.header('Set-Cookie', clearStateCookie);
      return c.redirect('/?authError=email_not_allowed', 302);
    }

    const sessionToken = await createSessionToken(
      matchedEmail,
      c.env.SESSION_SECRET,
      verifiedState.rememberMe
    );
    const sessionCookie = buildSessionCookie(sessionToken, isHttps, verifiedState.rememberMe);

    const headers = new Headers();
    headers.append('Set-Cookie', clearStateCookie);
    headers.append('Set-Cookie', sessionCookie);
    headers.set('Location', '/');
    return new Response(null, { status: 302, headers });
  });

  app.post('/api/auth/request-code', async (c) => {
    if (!isSameOriginMutation(c.req.raw)) {
      return c.json({ error: '허용되지 않은 요청 출처입니다.' }, 403);
    }

    if (!isEmailOtpConfigured(c.env, c.req.url)) {
      return c.json(
        {
          error:
            '이메일 인증 발송 설정(ALLOWED_EMAILS / SESSION_SECRET / 메일 발송기)이 필요합니다.',
        },
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
      return c.json({
        ok: true,
        message: '인증 코드가 이메일로 발송되었습니다. 받은편지함을 확인해 주세요.',
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
      message: '인증 코드가 이메일로 발송되었습니다. 받은편지함을 확인해 주세요.',
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
    const rememberMe = raw.rememberMe !== false;

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
    const token = await createSessionToken(email, c.env.SESSION_SECRET!, rememberMe);
    c.header('Set-Cookie', buildSessionCookie(token, isHttpsRequest(c.req.raw), rememberMe));
    return c.json({ authenticated: true, authMethod: 'email-otp', userEmail: email, rememberMe });
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
      if (cfResult.valid && cfResult.email) {
        c.set('authMethod', 'cf-access');
        c.set('userEmail', cfResult.email);
        await ensureSchema(c.env.DB);
        return next();
      }
    }

    const allowedEmails = getAllowedEmails(c.env);
    const allowPublic = isPublicSignupEnabled(c.env);
    if (allowedEmails.length === 0 && !allowPublic) {
      return c.json({ error: '이메일 인증이 필요합니다.' }, 401);
    }

    const token = getCookieValue(c.req.header('Cookie'), SESSION_COOKIE_NAME);
    const session = await verifySessionToken(
      token,
      c.env.SESSION_SECRET,
      allowPublic ? undefined : allowedEmails
    );
    if (!session.valid || !session.email) {
      return c.json({ error: '이메일 인증이 필요합니다.' }, 401);
    }

    if (session.shouldRenew && c.env.SESSION_SECRET) {
      const renewedToken = await createSessionToken(
        session.email,
        c.env.SESSION_SECRET,
        session.rememberMe
      );
      c.header(
        'Set-Cookie',
        buildSessionCookie(renewedToken, isHttpsRequest(c.req.raw), session.rememberMe)
      );
    }

    c.set('authMethod', 'email-otp');
    c.set('userEmail', session.email);
    await ensureSchema(c.env.DB);
    return next();
  };

  app.use('/api/todos', requireAuth);
  app.use('/api/todos/*', requireAuth);

  app.get('/api/todos', async (c) => {
    const items = await listTodos(c.env.DB, c.get('userEmail'));
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

    const item = await createTodo(c.env.DB, c.get('userEmail'), parsed.data);
    return c.json({ item }, 201);
  });

  app.post('/api/todos/reorder', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'JSON 요청 형식이 올바르지 않습니다.' }, 400);
    }

    const parsed = validateReorderPayload(body);
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }

    await reorderTodos(c.env.DB, c.get('userEmail'), parsed.data);
    return c.json({ ok: true });
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

    const items = await importTodos(c.env.DB, c.get('userEmail'), parsed.data);
    return c.json({ items, importedCount: items.length }, 201);
  });

  app.delete('/api/todos/completed', async (c) => {
    const deletedCount = await clearCompletedTodos(c.env.DB, c.get('userEmail'));
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

    const result = await updateTodo(c.env.DB, c.get('userEmail'), id, parsed.data);
    if (!result) {
      return c.json({ error: '할 일을 찾을 수 없습니다.' }, 404);
    }

    return c.json(result);
  });

  app.post('/api/todos/:id/attachments', async (c) => {
    const todoId = c.req.param('id');
    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      return c.json({ error: '파일 업로드 요청 형식이 올바르지 않습니다.' }, 400);
    }

    const entry = formData.get('file');
    if (!entry || typeof entry === 'string') {
      return c.json({ error: '업로드할 파일을 선택해 주세요.' }, 400);
    }

    const file = entry as File;
    const validated = validateAttachmentUpload(file.name, file.size);
    if (!validated.ok) {
      return c.json({ error: validated.error }, 400);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const doubleCheck = validateAttachmentUpload(file.name, bytes.byteLength);
    if (!doubleCheck.ok) {
      return c.json({ error: doubleCheck.error }, 400);
    }

    const saved = await addAttachment(
      c.env.DB,
      c.get('userEmail'),
      todoId,
      doubleCheck.fileName,
      doubleCheck.mimeType,
      bytes
    );

    if (!saved.ok) {
      return c.json({ error: saved.error }, saved.status as 400 | 404 | 413);
    }

    return c.json({ attachment: saved.attachment }, 201);
  });

  app.get('/api/todos/:id/attachments/:attachmentId', async (c) => {
    const todoId = c.req.param('id');
    const attachmentId = c.req.param('attachmentId');
    const found = await getAttachmentWithData(c.env.DB, c.get('userEmail'), todoId, attachmentId);
    if (!found) {
      return c.json({ error: '첨부 파일을 찾을 수 없습니다.' }, 404);
    }

    const wantInline =
      new URL(c.req.url).searchParams.get('inline') === '1' &&
      isInlinePreviewableImage(found.meta.mimeType);

    const headers = new Headers();
    headers.set('Content-Type', found.meta.mimeType);
    headers.set('Content-Length', String(found.data.byteLength));
    headers.set('Content-Disposition', buildContentDisposition(found.meta.fileName, wantInline));
    headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'no-store, private');

    return new Response(found.data, { status: 200, headers });
  });

  app.delete('/api/todos/:id/attachments/:attachmentId', async (c) => {
    const todoId = c.req.param('id');
    const attachmentId = c.req.param('attachmentId');
    const deleted = await deleteAttachment(c.env.DB, c.get('userEmail'), todoId, attachmentId);
    if (!deleted) {
      return c.json({ error: '첨부 파일을 찾을 수 없습니다.' }, 404);
    }
    return c.json({ deleted: true, id: attachmentId });
  });

  app.delete('/api/todos/:id', async (c) => {
    const id = c.req.param('id');
    const deleted = await deleteTodo(c.env.DB, c.get('userEmail'), id);
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
      applySecurityHeaders(response.headers, false, isHttpsRequest(c.req.raw));
      return response;
    }
    return c.text('Not Found', 404);
  });

  return app;
}

const app = createApp();
export default app;
