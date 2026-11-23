import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/worker/index';
import type { Env } from '../src/worker/types';

interface StoredTodoRow {
  id: string;
  title: string;
  notes: string;
  status: string;
  priority: string;
  category: string;
  due_date: string | null;
  pinned: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface StoredAttemptRow {
  ip_hash: string;
  failures: number;
  locked_until: number;
  updated_at: number;
}

interface StoredOtpRow {
  email_hash: string;
  code_hash: string;
  attempts: number;
  expires_at: number;
  last_sent_at: number;
}

function createMockD1(): D1Database {
  const todos = new Map<string, StoredTodoRow>();
  const attempts = new Map<string, StoredAttemptRow>();
  const otps = new Map<string, StoredOtpRow>();

  function execute(sql: string, params: unknown[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized.startsWith('CREATE TABLE') || normalized.startsWith('CREATE INDEX')) {
      return { results: [], meta: { changes: 0 } };
    }

    if (normalized.startsWith('SELECT failures, locked_until FROM auth_attempts')) {
      const row = attempts.get(String(params[0]));
      return { results: row ? [row] : [], meta: { changes: 0 } };
    }

    if (normalized.startsWith('INSERT INTO auth_attempts')) {
      const [ip_hash, failures, locked_until, updated_at] = params as [
        string,
        number,
        number,
        number,
      ];
      attempts.set(ip_hash, { ip_hash, failures, locked_until, updated_at });
      return { results: [], meta: { changes: 1 } };
    }

    if (normalized.startsWith('DELETE FROM auth_attempts')) {
      const existed = attempts.delete(String(params[0]));
      return { results: [], meta: { changes: existed ? 1 : 0 } };
    }

    if (normalized.startsWith('SELECT last_sent_at FROM email_otps')) {
      const row = otps.get(String(params[0]));
      return { results: row ? [{ last_sent_at: row.last_sent_at }] : [], meta: { changes: 0 } };
    }

    if (normalized.startsWith('SELECT code_hash, attempts, expires_at FROM email_otps')) {
      const row = otps.get(String(params[0]));
      return { results: row ? [row] : [], meta: { changes: 0 } };
    }

    if (normalized.startsWith('INSERT INTO email_otps')) {
      const [email_hash, code_hash, expires_at, last_sent_at] = params as [
        string,
        string,
        number,
        number,
      ];
      otps.set(email_hash, { email_hash, code_hash, attempts: 0, expires_at, last_sent_at });
      return { results: [], meta: { changes: 1 } };
    }

    if (normalized.startsWith('UPDATE email_otps SET attempts = attempts + 1')) {
      const row = otps.get(String(params[0]));
      if (row) {
        row.attempts += 1;
      }
      return { results: [], meta: { changes: row ? 1 : 0 } };
    }

    if (normalized.startsWith('DELETE FROM email_otps')) {
      const existed = otps.delete(String(params[0]));
      return { results: [], meta: { changes: existed ? 1 : 0 } };
    }

    if (normalized.startsWith('SELECT id, title, notes') && normalized.includes('WHERE id = ?')) {
      const row = todos.get(String(params[0]));
      return { results: row ? [row] : [], meta: { changes: 0 } };
    }

    if (normalized.startsWith('SELECT id, title, notes') && normalized.includes('FROM todos')) {
      const rows = Array.from(todos.values()).sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned - a.pinned;
        return b.created_at.localeCompare(a.created_at);
      });
      return { results: rows, meta: { changes: 0 } };
    }

    if (normalized.startsWith('INSERT INTO todos')) {
      const [
        id,
        title,
        notes,
        status,
        priority,
        category,
        due_date,
        pinned,
        created_at,
        updated_at,
        completed_at,
      ] = params as [
        string,
        string,
        string,
        string,
        string,
        string,
        string | null,
        number,
        string,
        string,
        string | null,
      ];
      todos.set(id, {
        id,
        title,
        notes,
        status,
        priority,
        category,
        due_date,
        pinned,
        created_at,
        updated_at,
        completed_at,
      });
      return { results: [], meta: { changes: 1 } };
    }

    if (normalized.startsWith('UPDATE todos')) {
      const [
        title,
        notes,
        status,
        priority,
        category,
        due_date,
        pinned,
        updated_at,
        completed_at,
        id,
      ] = params as [
        string,
        string,
        string,
        string,
        string,
        string | null,
        number,
        string,
        string | null,
        string,
      ];
      const existing = todos.get(id);
      if (!existing) return { results: [], meta: { changes: 0 } };
      todos.set(id, {
        ...existing,
        title,
        notes,
        status,
        priority,
        category,
        due_date,
        pinned,
        updated_at,
        completed_at,
      });
      return { results: [], meta: { changes: 1 } };
    }

    if (normalized === "DELETE FROM todos WHERE status = 'done'") {
      let changes = 0;
      for (const [id, row] of todos.entries()) {
        if (row.status === 'done') {
          todos.delete(id);
          changes += 1;
        }
      }
      return { results: [], meta: { changes } };
    }

    if (normalized.startsWith('DELETE FROM todos WHERE id = ?')) {
      const existed = todos.delete(String(params[0]));
      return { results: [], meta: { changes: existed ? 1 : 0 } };
    }

    throw new Error(`Unhandled SQL in mock D1: ${normalized}`);
  }

  function makeStatement(sql: string, params: unknown[] = []): D1PreparedStatement {
    return {
      bind(...nextParams: unknown[]) {
        return makeStatement(sql, nextParams);
      },
      async first<T>() {
        const res = execute(sql, params);
        return (res.results[0] ?? null) as T | null;
      },
      async all<T>() {
        const res = execute(sql, params);
        return { success: true, results: res.results as T[], meta: res.meta } as unknown as D1Result<T>;
      },
      async run() {
        const res = execute(sql, params);
        return { success: true, results: [], meta: res.meta } as unknown as D1Result;
      },
      async raw() {
        return [];
      },
    } as unknown as D1PreparedStatement;
  }

  return {
    prepare(sql: string) {
      return makeStatement(sql);
    },
    async batch(statements: D1PreparedStatement[]) {
      const out = [];
      for (const stmt of statements) {
        out.push(await stmt.run());
      }
      return out;
    },
  } as unknown as D1Database;
}

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: createMockD1(),
    ALLOWED_EMAIL: 'owner@example.com',
    SESSION_SECRET: 'session-signing-secret-1234567890',
    RESEND_API_KEY: 'test-resend-key',
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Private Todo Worker API (Email Auth)', () => {
  it('blocks bots via robots.txt and sets strict security headers', async () => {
    const app = createApp();
    const env = createEnv();

    const robots = await app.request('https://private.example.com/robots.txt', {}, env);
    expect(robots.status).toBe(200);
    expect(await robots.text()).toContain('Disallow: /');
    expect(robots.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');
    expect(robots.headers.get('X-Frame-Options')).toBe('DENY');

    const health = await app.request('https://private.example.com/api/health', {}, env);
    expect(health.status).toBe(200);
    expect(health.headers.get('Cache-Control')).toBe('no-store, private');
  });

  it('denies unauthenticated access and fails closed when email sender is not configured', async () => {
    const app = createApp();
    const env = createEnv();

    const todosRes = await app.request('https://private.example.com/api/todos', {}, env);
    expect(todosRes.status).toBe(401);

    const unconfiguredEnv = createEnv({ RESEND_API_KEY: '' });
    const reqRes = await app.request(
      'https://private.example.com/api/auth/request-code',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com' }),
      },
      unconfiguredEnv
    );
    expect(reqRes.status).toBe(503);
  });

  it('prevents email enumeration and enforces resend cooldown', async () => {
    const app = createApp();
    const env = createEnv();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }));

    // Disallowed email gets identical 200 without sending email
    const strangerRes = await app.request(
      'https://private.example.com/api/auth/request-code',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'stranger@example.com' }),
      },
      env
    );
    expect(strangerRes.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();

    // Allowed email sends OTP once, then enforces 60s cooldown
    const first = await app.request(
      'https://private.example.com/api/auth/request-code',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com' }),
      },
      env
    );
    expect(first.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const second = await app.request(
      'https://private.example.com/api/auth/request-code',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'owner@example.com' }),
      },
      env
    );
    expect(second.status).toBe(429);
  });

  it('authenticates via email OTP, executes full CRUD & import, enforces CSRF, and logs out', async () => {
    const app = createApp();
    const env = createEnv();
    let capturedCode = '';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const payload = JSON.parse(String(init?.body ?? '{}')) as { subject?: string };
      const match = payload.subject?.match(/(\d{6})/);
      capturedCode = match?.[1] ?? '';
      return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
    });

    // Request OTP
    const reqRes = await app.request(
      'https://private.example.com/api/auth/request-code',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://private.example.com',
        },
        body: JSON.stringify({ email: 'owner@example.com' }),
      },
      env
    );
    expect(reqRes.status).toBe(200);
    expect(capturedCode).toMatch(/^\d{6}$/);

    // Verify OTP
    const verifyRes = await app.request(
      'https://private.example.com/api/auth/verify-code',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://private.example.com',
        },
        body: JSON.stringify({ email: 'owner@example.com', code: capturedCode }),
      },
      env
    );
    expect(verifyRes.status).toBe(200);
    const setCookie = verifyRes.headers.get('Set-Cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    const cookieHeader = setCookie!.split(';')[0];

    // Reusing the same OTP must fail (single-use)
    const replayRes = await app.request(
      'https://private.example.com/api/auth/verify-code',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://private.example.com',
        },
        body: JSON.stringify({ email: 'owner@example.com', code: capturedCode }),
      },
      env
    );
    expect(replayRes.status).toBe(401);

    // Auth status reflects authenticated user email
    const statusRes = await app.request(
      'https://private.example.com/api/auth/status',
      { headers: { Cookie: cookieHeader } },
      env
    );
    expect(await statusRes.json()).toMatchObject({
      authenticated: true,
      configured: true,
      emailOtpReady: true,
      authMethod: 'email-otp',
      userEmail: 'owner@example.com',
    });

    // Cross-origin CSRF blocked even with valid session cookie
    const csrfRes = await app.request(
      'https://private.example.com/api/todos',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader,
          Origin: 'https://attacker.example.net',
        },
        body: JSON.stringify({ title: 'Blocked' }),
      },
      env
    );
    expect(csrfRes.status).toBe(403);

    // Create todo
    const createRes = await app.request(
      'https://private.example.com/api/todos',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader,
          Origin: 'https://private.example.com',
        },
        body: JSON.stringify({
          title: 'Cloudflare 배포하기',
          notes: '이메일 인증 연동 완료',
          priority: 'high',
          category: '개인',
          dueDate: '2026-11-30',
          pinned: true,
        }),
      },
      env
    );
    expect(createRes.status).toBe(201);
    const { item } = (await createRes.json()) as {
      item: { id: string; title: string; pinned: boolean };
    };
    expect(item.title).toBe('Cloudflare 배포하기');
    expect(item.pinned).toBe(true);

    // Patch todo to done
    const patchRes = await app.request(
      `https://private.example.com/api/todos/${item.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader,
        },
        body: JSON.stringify({ status: 'done' }),
      },
      env
    );
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as {
      item: { status: string; completedAt: string | null };
    };
    expect(patched.item.status).toBe('done');
    expect(patched.item.completedAt).toBeTruthy();

    // Import & clear completed
    const importRes = await app.request(
      'https://private.example.com/api/todos/import',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader,
        },
        body: JSON.stringify({
          items: [
            { title: '가져온 할 일 1', priority: 'low' },
            { title: '가져온 할 일 2', status: 'done' },
          ],
        }),
      },
      env
    );
    expect(importRes.status).toBe(201);

    const clearRes = await app.request(
      'https://private.example.com/api/todos/completed',
      {
        method: 'DELETE',
        headers: { Cookie: cookieHeader },
      },
      env
    );
    expect(clearRes.status).toBe(200);
    expect(await clearRes.json()).toEqual({ deletedCount: 2 });

    // Logout clears cookie
    const logoutRes = await app.request(
      'https://private.example.com/api/auth/logout',
      {
        method: 'POST',
        headers: { Cookie: cookieHeader },
      },
      env
    );
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });

  it('locks out brute-force OTP verification attempts after 5 failures', async () => {
    const app = createApp();
    const env = createEnv();

    for (let i = 0; i < 4; i += 1) {
      const res = await app.request(
        'https://private.example.com/api/auth/verify-code',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '203.0.113.10',
          },
          body: JSON.stringify({ email: 'owner@example.com', code: '000000' }),
        },
        env
      );
      expect(res.status).toBe(401);
    }

    const fifth = await app.request(
      'https://private.example.com/api/auth/verify-code',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.10',
        },
        body: JSON.stringify({ email: 'owner@example.com', code: '000000' }),
      },
      env
    );
    expect(fifth.status).toBe(429);
  });
});
