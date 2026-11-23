import type {
  CreateTodoInput,
  TodoItem,
  TodoPriority,
  TodoStatus,
  UpdateTodoInput,
} from '../shared/types';
import { normalizeEmail } from './auth';

interface TodoRow {
  id: string;
  owner_email: string;
  title: string;
  notes: string;
  status: TodoStatus;
  priority: TodoPriority;
  category: string;
  due_date: string | null;
  pinned: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

const initializedDatabases = new WeakSet<D1Database>();

const BASE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    owner_email TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    category TEXT NOT NULL DEFAULT '',
    due_date TEXT,
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS auth_attempts (
    ip_hash TEXT PRIMARY KEY,
    failures INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS email_otps (
    email_hash TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL,
    last_sent_at INTEGER NOT NULL
  )`,
];

const INDEX_STATEMENTS = [
  `CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status)`,
  `CREATE INDEX IF NOT EXISTS idx_todos_pinned_created ON todos(pinned DESC, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date)`,
  `CREATE INDEX IF NOT EXISTS idx_todos_owner_pinned_created ON todos(owner_email, pinned DESC, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_todos_owner_status ON todos(owner_email, status)`,
];

function requireOwnerEmail(ownerEmail: string): string {
  const normalized = normalizeEmail(ownerEmail);
  if (!normalized) {
    throw new Error('Authenticated owner email is required for database operations.');
  }
  return normalized;
}

function mapRow(row: TodoRow): TodoItem {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: row.status,
    priority: row.priority,
    category: row.category,
    dueDate: row.due_date,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export async function ensureSchema(db: D1Database): Promise<void> {
  if (initializedDatabases.has(db)) return;

  await db.batch(BASE_SCHEMA_STATEMENTS.map((sql) => db.prepare(sql)));

  // Upgrade older databases created before migration 0002_multi_user.sql
  try {
    const info = await db.prepare('PRAGMA table_info(todos)').all<{ name: string }>();
    const hasOwnerColumn = (info.results ?? []).some((col) => col.name === 'owner_email');
    if (info.results && info.results.length > 0 && !hasOwnerColumn) {
      await db.prepare("ALTER TABLE todos ADD COLUMN owner_email TEXT NOT NULL DEFAULT ''").run();
    }
  } catch {
    // Ignore if runtime mock does not implement PRAGMA table_info
  }

  await db.batch(INDEX_STATEMENTS.map((sql) => db.prepare(sql)));
  initializedDatabases.add(db);
}

export async function listTodos(db: D1Database, ownerEmail: string): Promise<TodoItem[]> {
  const owner = requireOwnerEmail(ownerEmail);
  const { results } = await db
    .prepare(
      `SELECT id, owner_email, title, notes, status, priority, category, due_date, pinned, created_at, updated_at, completed_at
       FROM todos
       WHERE owner_email = ?
       ORDER BY pinned DESC, created_at DESC`
    )
    .bind(owner)
    .all<TodoRow>();

  return (results ?? []).map(mapRow);
}

export async function getTodoById(
  db: D1Database,
  ownerEmail: string,
  id: string
): Promise<TodoItem | null> {
  const owner = requireOwnerEmail(ownerEmail);
  const row = await db
    .prepare(
      `SELECT id, owner_email, title, notes, status, priority, category, due_date, pinned, created_at, updated_at, completed_at
       FROM todos
       WHERE id = ? AND owner_email = ?`
    )
    .bind(id, owner)
    .first<TodoRow>();

  return row ? mapRow(row) : null;
}

export async function createTodo(
  db: D1Database,
  ownerEmail: string,
  input: CreateTodoInput
): Promise<TodoItem> {
  const owner = requireOwnerEmail(ownerEmail);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const status = input.status ?? 'todo';
  const priority = input.priority ?? 'medium';
  const notes = input.notes ?? '';
  const category = input.category ?? '';
  const dueDate = input.dueDate ?? null;
  const pinned = input.pinned ? 1 : 0;
  const completedAt = status === 'done' ? now : null;

  await db
    .prepare(
      `INSERT INTO todos (id, owner_email, title, notes, status, priority, category, due_date, pinned, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      owner,
      input.title,
      notes,
      status,
      priority,
      category,
      dueDate,
      pinned,
      now,
      now,
      completedAt
    )
    .run();

  return {
    id,
    title: input.title,
    notes,
    status,
    priority,
    category,
    dueDate,
    pinned: pinned === 1,
    createdAt: now,
    updatedAt: now,
    completedAt,
  };
}

export async function updateTodo(
  db: D1Database,
  ownerEmail: string,
  id: string,
  patch: UpdateTodoInput
): Promise<TodoItem | null> {
  const owner = requireOwnerEmail(ownerEmail);
  const existing = await getTodoById(db, owner, id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const nextTitle = patch.title ?? existing.title;
  const nextNotes = patch.notes ?? existing.notes;
  const nextStatus = patch.status ?? existing.status;
  const nextPriority = patch.priority ?? existing.priority;
  const nextCategory = patch.category ?? existing.category;
  const nextDueDate = patch.dueDate !== undefined ? patch.dueDate : existing.dueDate;
  const nextPinned = patch.pinned !== undefined ? patch.pinned : existing.pinned;

  let nextCompletedAt = existing.completedAt;
  if (patch.status !== undefined) {
    if (nextStatus === 'done' && existing.status !== 'done') {
      nextCompletedAt = now;
    } else if (nextStatus !== 'done') {
      nextCompletedAt = null;
    }
  }

  await db
    .prepare(
      `UPDATE todos
       SET title = ?, notes = ?, status = ?, priority = ?, category = ?, due_date = ?, pinned = ?, updated_at = ?, completed_at = ?
       WHERE id = ? AND owner_email = ?`
    )
    .bind(
      nextTitle,
      nextNotes,
      nextStatus,
      nextPriority,
      nextCategory,
      nextDueDate,
      nextPinned ? 1 : 0,
      now,
      nextCompletedAt,
      id,
      owner
    )
    .run();

  return {
    id,
    title: nextTitle,
    notes: nextNotes,
    status: nextStatus,
    priority: nextPriority,
    category: nextCategory,
    dueDate: nextDueDate,
    pinned: nextPinned,
    createdAt: existing.createdAt,
    updatedAt: now,
    completedAt: nextCompletedAt,
  };
}

export async function deleteTodo(
  db: D1Database,
  ownerEmail: string,
  id: string
): Promise<boolean> {
  const owner = requireOwnerEmail(ownerEmail);
  const result = await db
    .prepare('DELETE FROM todos WHERE id = ? AND owner_email = ?')
    .bind(id, owner)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function clearCompletedTodos(db: D1Database, ownerEmail: string): Promise<number> {
  const owner = requireOwnerEmail(ownerEmail);
  const result = await db
    .prepare("DELETE FROM todos WHERE owner_email = ? AND status = 'done'")
    .bind(owner)
    .run();
  return result.meta?.changes ?? 0;
}

export async function importTodos(
  db: D1Database,
  ownerEmail: string,
  items: CreateTodoInput[]
): Promise<TodoItem[]> {
  const owner = requireOwnerEmail(ownerEmail);
  const nowBase = Date.now();
  const created: TodoItem[] = [];
  const statements: D1PreparedStatement[] = [];

  for (let i = 0; i < items.length; i += 1) {
    const input = items[i];
    const id = crypto.randomUUID();
    const now = new Date(nowBase + i).toISOString();
    const status = input.status ?? 'todo';
    const priority = input.priority ?? 'medium';
    const notes = input.notes ?? '';
    const category = input.category ?? '';
    const dueDate = input.dueDate ?? null;
    const pinned = input.pinned ? 1 : 0;
    const completedAt = status === 'done' ? now : null;

    statements.push(
      db
        .prepare(
          `INSERT INTO todos (id, owner_email, title, notes, status, priority, category, due_date, pinned, created_at, updated_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          owner,
          input.title,
          notes,
          status,
          priority,
          category,
          dueDate,
          pinned,
          now,
          now,
          completedAt
        )
    );

    created.push({
      id,
      title: input.title,
      notes,
      status,
      priority,
      category,
      dueDate,
      pinned: pinned === 1,
      createdAt: now,
      updatedAt: now,
      completedAt,
    });
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }

  return created;
}
