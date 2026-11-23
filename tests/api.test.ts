import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/worker/index';
import type { Env } from '../src/worker/types';

interface StoredTodoRow {
  id: string;
  owner_email: string;
  title: string;
  notes: string;
  status: string;
  priority: string;
  category: string;
  due_date: string | null;
  pinned: number;
  subtasks: string;
  recurrence: string;
  sort_order: number;
  focus_minutes: number;
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

    if (
      normalized.startsWith('CREATE TABLE') ||
      normalized.startsWith('CREATE INDEX') ||
      normalized.startsWith('ALTER TABLE')
    ) {
      return { results: [], meta: { changes: 0 } };
    }

    if (normalized === 'PRAGMA table_info(todos)') {
      return {
        results: [
          { name: 'id' },
          { name: 'owner_email' },
          { name: 'subtasks' },
          { name: 'recurrence' },
          { name: 'sort_order' },
          { name: 'focus_minutes' },
        ],
        meta: { changes: 0 },
      };
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
      if (row) row.attempts += 1;
      return { results: [], meta: { changes: row ? 1 : 0 } };
    }

    if (normalized.startsWith('DELETE FROM email_otps')) {
      const existed = otps.delete(String(params[0]));
      return { results: [], meta: { changes: existed ? 1 : 0 } };
    }

    if (
      normalized.startsWith('SELECT id, owner_email, title, notes') &&
      normalized.includes('WHERE id = ? AND owner_email = ?')
    ) {
      const [id, owner] = params as [string, string];
      const row = todos.get(id);
      return { results: row && row.owner_email === owner ? [row] : [], meta: { changes: 0 } };
    }

    if (
      normalized.startsWith('SELECT id, owner_email, title, notes') &&
      normalized.includes('WHERE owner_email = ?')
    ) {
      const owner = String(params[0]);
      const rows = Array.from(todos.values())
        .filter((row) => row.owner_email === owner)
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return b.pinned - a.pinned;
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
          return b.created_at.localeCompare(a.created_at);
        });
      return { results: rows, meta: { changes: 0 } };
    }

    if (normalized.startsWith('INSERT INTO todos')) {
      const [
        id,
        owner_email,
        title,
        notes,
        status,
        priority,
        category,
        due_date,
        pinned,
        subtasks,
        recurrence,
        sort_order,
        focus_minutes,
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
        string,
        string | null,
        number,
        string,
        string,
        number,
        number,
        string,
        string,
        string | null,
      ];
      todos.set(id, {
        id,
        owner_email,
        title,
        notes,
        status,
        priority,
        category,
        due_date,
        pinned,
        subtasks,
        recurrence,
        sort_order,
        focus_minutes,
        created_at,
        updated_at,
        completed_at,
      });
      return { results: [], meta: { changes: 1 } };
    }

    if (normalized.startsWith('UPDATE todos SET sort_order = ?')) {
      const [sort_order, updated_at, id, owner_email] = params as [number, string, string, string];
      const existing = todos.get(id);
      if (!existing || existing.owner_email !== owner_email) {
        return { results: [], meta: { changes: 0 } };
      }
      todos.set(id, { ...existing, sort_order, updated_at });
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
        subtasks,
        recurrence,
        sort_order,
        focus_minutes,
        updated_at,
        completed_at,
        id,
        owner_email,
      ] = params as [
        string,
        string,
        string,
        string,
        string,
        string | null,
        number,
        string,
        string,
        number,
        number,
        string,
        string | null,
        string,
        string,
      ];
      const existing = todos.get(id);
      if (!existing || existing.owner_email !== owner_email) {
        return { results: [], meta: { changes: 0 } };
      }
      todos.set(id, {
        ...existing,
        title,
        notes,
        status,
        priority,
        category,
        due_date,
        pinned,
        subtasks,
        recurrence,
        sort_order,
        focus_minutes,
        updated_at,
        completed_at,
      });
      return { results: [], meta: { changes: 1 } };
    }

    if (normalized === "DELETE FROM todos WHERE owner_email = ? AND status = 'done'") {
      const owner = String(params[0]);
      let changes = 0;
      for (const [id, row] of todos.entries()) {
        if (row.owner_email === owner && row.status === 'done') {
          todos.delete(id);
          changes += 1;
        }
      }
      return { results: [], meta: { changes } };
    }

    if (normalized.startsWith('DELETE FROM todos WHERE id = ? AND owner_email = ?')) {
      const [id, owner] = params as [string, string];
      const row = todos.get(id);
      if (!row || row.owner_email !== owner) {
        return { results: [], meta: { changes: 0 } };
      }
      todos.delete(id);
      return { results: [], meta: { changes: 1 } };
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
    ALLOWED_EMAILS: 'alice@example.com,bob@example.com',
    SESSION_SECRET: 'session-signing-secret-1234567890',
    RESEND_API_KEY: 'test-resend-key',
    ...overrides,
  };
}

async function loginAs(app: ReturnType<typeof createApp>, env: Env, email: string): Promise<string> {
  let capturedCode = '';
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const payload = JSON.parse(String(init?.body ?? '{}')) as { subject?: string };
    const match = payload.subject?.match(/(\d{6})/);
    capturedCode = match?.[1] ?? '';
    return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
  });

  const reqRes = await app.request(
    'https://private.example.com/api/auth/request-code',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://private.example.com',
      },
      body: JSON.stringify({ email }),
    },
    env
  );
  expect(reqRes.status).toBe(200);
  spy.mockRestore();

  const verifyRes = await app.request(
    'https://private.example.com/api/auth/verify-code',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://private.example.com',
      },
      body: JSON.stringify({ email, code: capturedCode, rememberMe: true }),
    },
    env
  );
  expect(verifyRes.status).toBe(200);
  const setCookie = verifyRes.headers.get('Set-Cookie');
  expect(setCookie).toBeTruthy();
  return setCookie!.split(';')[0];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Private Todo Worker API (Hardened Multi-user + Power Features)', () => {
  it('enforces hardened security headers (CSP, HSTS, COOP, CORP, robots) and rejects oversized payloads', async () => {
    const app = createApp();
    const env = createEnv();

    const robots = await app.request('https://private.example.com/robots.txt', {}, env);
    expect(robots.status).toBe(200);
    expect(await robots.text()).toContain('Disallow: /');
    expect(robots.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');
    expect(robots.headers.get('X-Frame-Options')).toBe('DENY');
    expect(robots.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
    expect(robots.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(robots.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect(robots.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");

    const oversized = await app.request(
      'https://private.example.com/api/auth/request-code',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(1024 * 1024),
        },
        body: '{}',
      },
      env
    );
    expect(oversized.status).toBe(413);
  });

  it('strictly isolates todos between users and revokes removed users', async () => {
    const app = createApp();
    const env = createEnv();

    const aliceCookie = await loginAs(app, env, 'alice@example.com');
    const bobCookie = await loginAs(app, env, 'bob@example.com');

    const aliceCreate = await app.request(
      'https://private.example.com/api/todos',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: aliceCookie,
          Origin: 'https://private.example.com',
        },
        body: JSON.stringify({ title: 'Alice secret plan' }),
      },
      env
    );
    expect(aliceCreate.status).toBe(201);
    const { item: aliceTodo } = (await aliceCreate.json()) as { item: { id: string } };

    const bobPatchAlice = await app.request(
      `https://private.example.com/api/todos/${aliceTodo.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: bobCookie },
        body: JSON.stringify({ title: 'Hacked' }),
      },
      env
    );
    expect(bobPatchAlice.status).toBe(404);

    const envWithoutBob = { ...env, ALLOWED_EMAILS: 'alice@example.com' };
    const revokedRes = await app.request(
      'https://private.example.com/api/todos',
      { headers: { Cookie: bobCookie } },
      envWithoutBob
    );
    expect(revokedRes.status).toBe(401);
  });

  it('supports subtasks, recurring auto-regeneration, focus minutes, and manual reorder', async () => {
    const app = createApp();
    const env = createEnv();
    const aliceCookie = await loginAs(app, env, 'alice@example.com');

    // Create a weekly recurring todo with subtasks
    const createRes = await app.request(
      'https://private.example.com/api/todos',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({
          title: '주간 리뷰',
          dueDate: '2026-11-23',
          recurrence: 'weekly',
          subtasks: [
            { id: 's1', title: '진행상황 정리', done: true },
            { id: 's2', title: '다음 주 계획', done: false },
          ],
        }),
      },
      env
    );
    expect(createRes.status).toBe(201);
    const { item } = (await createRes.json()) as { item: { id: string; subtasks: Array<{ done: boolean }> } };
    expect(item.subtasks).toHaveLength(2);

    // Completing recurring todo automatically creates next week's occurrence with reset subtasks
    const doneRes = await app.request(
      `https://private.example.com/api/todos/${item.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ status: 'done', focusMinutes: 25 }),
      },
      env
    );
    expect(doneRes.status).toBe(200);
    const doneBody = (await doneRes.json()) as {
      item: { status: string; recurrence: string; focusMinutes: number };
      nextItem: { id: string; dueDate: string; recurrence: string; subtasks: Array<{ done: boolean }> } | null;
    };
    expect(doneBody.item.status).toBe('done');
    expect(doneBody.item.focusMinutes).toBe(25);
    expect(doneBody.nextItem).toBeTruthy();
    expect(doneBody.nextItem!.dueDate).toBe('2026-11-30');
    expect(doneBody.nextItem!.recurrence).toBe('weekly');
    expect(doneBody.nextItem!.subtasks.every((s) => s.done === false)).toBe(true);

    // Manual reorder succeeds
    const reorderRes = await app.request(
      'https://private.example.com/api/todos/reorder',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ orderedIds: [doneBody.nextItem!.id, item.id] }),
      },
      env
    );
    expect(reorderRes.status).toBe(200);
  });
});
