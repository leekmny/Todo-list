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
  reminder_at: string | null;
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

interface StoredAttachmentRow {
  id: string;
  todo_id: string;
  owner_email: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  data: Uint8Array;
  created_at: string;
}

function createMockD1(): D1Database {
  const todos = new Map<string, StoredTodoRow>();
  const attempts = new Map<string, StoredAttemptRow>();
  const otps = new Map<string, StoredOtpRow>();
  const attachments = new Map<string, StoredAttachmentRow>();

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
          { name: 'reminder_at' },
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

    if (normalized.startsWith('SELECT category, COUNT(*) AS cnt FROM todos')) {
      const owner = String(params[0]);
      const counts = new Map<string, number>();
      for (const row of todos.values()) {
        if (row.owner_email === owner && row.category.trim()) {
          counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
        }
      }
      const rows = Array.from(counts.entries())
        .map(([category, cnt]) => ({ category, cnt }))
        .sort((a, b) => b.cnt - a.cnt || a.category.localeCompare(b.category));
      return { results: rows.slice(0, 30), meta: { changes: 0 } };
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
        reminder_at,
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
        reminder_at,
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

    if (normalized.startsWith('UPDATE todos SET category = ?, updated_at = ?')) {
      const [category, updated_at, id, owner, previousCategory, title, notes] = params as string[];
      const existing = todos.get(id);
      if (
        !existing || existing.owner_email !== owner || existing.category !== previousCategory ||
        existing.title !== title || existing.notes !== notes
      ) {
        return { results: [], meta: { changes: 0 } };
      }
      todos.set(id, { ...existing, category, updated_at });
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
        reminder_at,
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
        reminder_at,
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

    if (
      normalized.startsWith('SELECT id, todo_id, file_name, mime_type, size_bytes, created_at FROM todo_attachments') &&
      normalized.includes('WHERE todo_id = ? AND owner_email = ?')
    ) {
      const [todoId, owner] = params as [string, string];
      const rows = Array.from(attachments.values()).filter(
        (a) => a.todo_id === todoId && a.owner_email === owner
      );
      return { results: rows, meta: { changes: 0 } };
    }

    if (
      normalized.startsWith('SELECT id, todo_id, file_name, mime_type, size_bytes, created_at FROM todo_attachments') &&
      normalized.includes('WHERE owner_email = ?')
    ) {
      const owner = String(params[0]);
      const rows = Array.from(attachments.values()).filter((a) => a.owner_email === owner);
      return { results: rows, meta: { changes: 0 } };
    }

    if (normalized.startsWith('SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes FROM todo_attachments')) {
      const owner = String(params[0]);
      const total = Array.from(attachments.values())
        .filter((a) => a.owner_email === owner)
        .reduce((sum, a) => sum + a.size_bytes, 0);
      return { results: [{ total_bytes: total }], meta: { changes: 0 } };
    }

    if (normalized.startsWith('INSERT INTO todo_attachments')) {
      const [id, todo_id, owner_email, file_name, mime_type, size_bytes, data, created_at] =
        params as [string, string, string, string, string, number, Uint8Array, string];
      attachments.set(id, {
        id,
        todo_id,
        owner_email,
        file_name,
        mime_type,
        size_bytes,
        data,
        created_at,
      });
      return { results: [], meta: { changes: 1 } };
    }

    if (normalized.startsWith('SELECT id, todo_id, file_name, mime_type, size_bytes, data, created_at FROM todo_attachments')) {
      const [id, todoId, owner] = params as [string, string, string];
      const row = attachments.get(id);
      return {
        results: row && row.todo_id === todoId && row.owner_email === owner ? [row] : [],
        meta: { changes: 0 },
      };
    }

    if (normalized.startsWith('DELETE FROM todo_attachments WHERE id = ? AND todo_id = ? AND owner_email = ?')) {
      const [id, todoId, owner] = params as [string, string, string];
      const row = attachments.get(id);
      if (!row || row.todo_id !== todoId || row.owner_email !== owner) {
        return { results: [], meta: { changes: 0 } };
      }
      attachments.delete(id);
      return { results: [], meta: { changes: 1 } };
    }

    if (normalized.startsWith('DELETE FROM todo_attachments WHERE todo_id = ? AND owner_email = ?')) {
      const [todoId, owner] = params as [string, string];
      let changes = 0;
      for (const [id, row] of attachments.entries()) {
        if (row.todo_id === todoId && row.owner_email === owner) {
          attachments.delete(id);
          changes += 1;
        }
      }
      return { results: [], meta: { changes } };
    }

    if (normalized.startsWith('DELETE FROM todo_attachments WHERE owner_email = ? AND todo_id IN')) {
      const owner = String(params[0]);
      let changes = 0;
      for (const [id, row] of attachments.entries()) {
        const parent = todos.get(row.todo_id);
        if (row.owner_email === owner && parent && parent.status === 'done') {
          attachments.delete(id);
          changes += 1;
        }
      }
      return { results: [], meta: { changes } };
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
          reminderAt: '2026-11-23T09:00',
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
      nextItem: {
        id: string;
        dueDate: string;
        reminderAt: string | null;
        recurrence: string;
        subtasks: Array<{ done: boolean }>;
      } | null;
    };
    expect(doneBody.item.status).toBe('done');
    expect(doneBody.item.focusMinutes).toBe(25);
    expect(doneBody.nextItem).toBeTruthy();
    expect(doneBody.nextItem!.dueDate).toBe('2026-11-30');
    expect(doneBody.nextItem!.reminderAt).toBe('2026-11-30T09:00');
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

  it('supports secure per-user file attachments and blocks dangerous extensions or cross-user downloads', async () => {
    const app = createApp();
    const env = createEnv();
    const aliceCookie = await loginAs(app, env, 'alice@example.com');
    const bobCookie = await loginAs(app, env, 'bob@example.com');

    const createRes = await app.request(
      'https://private.example.com/api/todos',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ title: '파일 첨부 테스트' }),
      },
      env
    );
    const { item } = (await createRes.json()) as { item: { id: string } };

    // Reject dangerous HTML/SVG/EXE upload
    const badForm = new FormData();
    badForm.append('file', new File(['<script>alert(1)</script>'], 'xss.html', { type: 'text/html' }));
    const badUpload = await app.request(
      `https://private.example.com/api/todos/${item.id}/attachments`,
      { method: 'POST', headers: { Cookie: aliceCookie }, body: badForm },
      env
    );
    expect(badUpload.status).toBe(400);

    // Upload valid Markdown file
    const okForm = new FormData();
    okForm.append('file', new File(['# 제안서 메모\n내용'], 'proposal.md', { type: 'text/markdown' }));
    const okUpload = await app.request(
      `https://private.example.com/api/todos/${item.id}/attachments`,
      { method: 'POST', headers: { Cookie: aliceCookie }, body: okForm },
      env
    );
    expect(okUpload.status).toBe(201);
    const { attachment } = (await okUpload.json()) as {
      attachment: { id: string; fileName: string; sizeBytes: number };
    };
    expect(attachment.fileName).toBe('proposal.md');
    expect(attachment.sizeBytes).toBeGreaterThan(0);

    // Bob cannot download or delete Alice's attachment
    const bobDownload = await app.request(
      `https://private.example.com/api/todos/${item.id}/attachments/${attachment.id}`,
      { headers: { Cookie: bobCookie } },
      env
    );
    expect(bobDownload.status).toBe(404);

    // Alice downloads with strict sandbox CSP + attachment disposition
    const aliceDownload = await app.request(
      `https://private.example.com/api/todos/${item.id}/attachments/${attachment.id}`,
      { headers: { Cookie: aliceCookie } },
      env
    );
    expect(aliceDownload.status).toBe(200);
    expect(aliceDownload.headers.get('Content-Disposition')).toContain('attachment;');
    expect(aliceDownload.headers.get('Content-Security-Policy')).toContain('sandbox');
    expect(await aliceDownload.text()).toContain('# 제안서 메모');

    // Alice deletes attachment
    const delRes = await app.request(
      `https://private.example.com/api/todos/${item.id}/attachments/${attachment.id}`,
      { method: 'DELETE', headers: { Cookie: aliceCookie } },
      env
    );
    expect(delRes.status).toBe(200);
  });

  it('preserves a manual category assigned while batch classification is running', async () => {
    const app = createApp();
    const baseUrl = 'https://private.example.com';
    const env = createEnv();
    const cookie = await loginAs(app, env, 'alice@example.com');
    const headers = { 'Content-Type': 'application/json', Cookie: cookie };
    const createRes = await app.request(
      `${baseUrl}/api/todos`,
      { method: 'POST', headers, body: JSON.stringify({ title: '병원 예약', autoCategorize: false }) },
      env
    );
    const { item } = (await createRes.json()) as { item: { id: string } };
    const todoUrl = `${baseUrl}/api/todos/${item.id}`;
    env.AI = {
      async run() {
        const editRes = await app.request(
          todoUrl,
          { method: 'PATCH', headers, body: JSON.stringify({ category: '가족' }) },
          env
        );
        expect(editRes.status).toBe(200);
        return { response: { category: '건강' } };
      },
    } as unknown as Ai;

    const batchRes = await app.request(
      `${baseUrl}/api/todos/auto-categorize`,
      { method: 'POST', headers },
      env
    );
    expect(batchRes.status).toBe(200);
    expect(await batchRes.json()).toEqual({ updatedCount: 0, items: [] });

    const listRes = await app.request(`${baseUrl}/api/todos`, { headers }, env);
    const { items } = (await listRes.json()) as { items: Array<{ id: string; category: string }> };
    expect(items).toMatchObject([{ id: item.id, category: '가족' }]);
  });

  it('auto-categorizes todos via Cloudflare Workers AI, respects manual categories, and supports suggest/batch organize', async () => {
    const aiCalls: Array<{ model: string; input: Record<string, unknown> }> = [];
    const mockAi = {
      async run(model: string, input: Record<string, unknown>) {
        aiCalls.push({ model, input });
        const messages = (input.messages ?? []) as Array<{ role: string; content: string }>;
        const userText = messages.find((m) => m.role === 'user')?.content ?? '';
        if (userText.includes('엄마')) {
          return { response: '{"category": "#가족\\n무시할 문장"}' };
        }
        if (userText.includes('강아지')) {
          return { response: { category: '반려동물' } };
        }
        if (userText.includes('사이드')) {
          return { response: '{"category": "내프로젝트"}' };
        }
        return { response: '{"category": "개발"}' };
      },
    } as unknown as Ai;

    const app = createApp();
    const env = createEnv({ AI: mockAi });
    const aliceCookie = await loginAs(app, env, 'alice@example.com');

    // Status exposes aiCategorizeReady: true when AI binding is present
    const statusRes = await app.request(
      'https://private.example.com/api/auth/status',
      { headers: { Cookie: aliceCookie } },
      env
    );
    expect(statusRes.status).toBe(200);
    const statusBody = (await statusRes.json()) as { aiCategorizeReady?: boolean };
    expect(statusBody.aiCategorizeReady).toBe(true);

    // 1. Manual category is respected without calling AI
    const manualRes = await app.request(
      'https://private.example.com/api/todos',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ title: '블로그 개편', category: '내프로젝트' }),
      },
      env
    );
    expect(manualRes.status).toBe(201);
    const manualBody = (await manualRes.json()) as { item: { category: string }; categorySource: string };
    expect(manualBody.item.category).toBe('내프로젝트');
    expect(manualBody.categorySource).toBe('manual');
    expect(aiCalls).toHaveLength(0);

    // 2. Empty category triggers Workers AI & sanitizes messy response
    const aiRes = await app.request(
      'https://private.example.com/api/todos',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ title: '엄마한테 저번에 말한 거 챙겨드리기', autoCategorize: true }),
      },
      env
    );
    expect(aiRes.status).toBe(201);
    const aiBody = (await aiRes.json()) as { item: { category: string }; categorySource: string };
    expect(aiBody.item.category).toBe('가족');
    expect(aiBody.categorySource).toBe('ai');
    expect(aiCalls).toHaveLength(1);
    const messages = aiCalls[0].input.messages as Array<{ role: string; content: string }>;
    expect(messages.find((message) => message.role === 'system')?.content).not.toContain('내프로젝트');
    expect(JSON.parse(messages.find((message) => message.role === 'user')!.content))
      .toMatchObject({ existingCategories: ['내프로젝트'] });

    // 3. Explicit autoCategorize: false keeps todo uncategorized
    const uncatRes = await app.request(
      'https://private.example.com/api/todos',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ title: '강아지 심장사상충 약 챙기기', autoCategorize: false }),
      },
      env
    );
    expect(uncatRes.status).toBe(201);
    const uncatBody = (await uncatRes.json()) as { item: { category: string }; categorySource: string };
    expect(uncatBody.item.category).toBe('');
    expect(uncatBody.categorySource).toBe('none');

    // 4. Suggest category endpoint works for edit modal
    const suggestRes = await app.request(
      'https://private.example.com/api/todos/suggest-category',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ title: '사이드 서비스 런칭 준비' }),
      },
      env
    );
    expect(suggestRes.status).toBe(200);
    const suggestBody = (await suggestRes.json()) as { category: string; source: string };
    expect(suggestBody.category).toBe('내프로젝트');
    expect(suggestBody.source).toBe('ai');

    // 5. Batch auto-categorize updates uncategorized todos
    const batchRes = await app.request(
      'https://private.example.com/api/todos/auto-categorize',
      {
        method: 'POST',
        headers: { Cookie: aliceCookie },
      },
      env
    );
    expect(batchRes.status).toBe(200);
    const batchBody = (await batchRes.json()) as {
      updatedCount: number;
      items: Array<{ title: string; category: string }>;
    };
    expect(batchBody.updatedCount).toBe(1);
    expect(batchBody.items[0].category).toBe('반려동물');

    const callCount = aiCalls.length;
    const legacyRes = await app.request(
      'https://private.example.com/api/todos',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ title: '다음 달 병원 예약' }),
      },
      env
    );
    expect(legacyRes.status).toBe(201);
    expect(await legacyRes.json()).toMatchObject({ item: { category: '' }, categorySource: 'none' });
    expect(aiCalls).toHaveLength(callCount);
  });
});
