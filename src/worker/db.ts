import type {
  CreateTodoInput,
  TodoItem,
  TodoPriority,
  TodoStatus,
  UpdateTodoInput,
} from '../shared/types';

interface TodoRow {
  id: string;
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

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
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
  `CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status)`,
  `CREATE INDEX IF NOT EXISTS idx_todos_pinned_created ON todos(pinned DESC, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date)`,
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
  await db.batch(SCHEMA_STATEMENTS.map((sql) => db.prepare(sql)));
  initializedDatabases.add(db);
}

export async function listTodos(db: D1Database): Promise<TodoItem[]> {
  const { results } = await db
    .prepare(
      `SELECT id, title, notes, status, priority, category, due_date, pinned, created_at, updated_at, completed_at
       FROM todos
       ORDER BY pinned DESC, created_at DESC`
    )
    .all<TodoRow>();

  return (results ?? []).map(mapRow);
}

export async function getTodoById(db: D1Database, id: string): Promise<TodoItem | null> {
  const row = await db
    .prepare(
      `SELECT id, title, notes, status, priority, category, due_date, pinned, created_at, updated_at, completed_at
       FROM todos
       WHERE id = ?`
    )
    .bind(id)
    .first<TodoRow>();

  return row ? mapRow(row) : null;
}

export async function createTodo(db: D1Database, input: CreateTodoInput): Promise<TodoItem> {
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
      `INSERT INTO todos (id, title, notes, status, priority, category, due_date, pinned, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, input.title, notes, status, priority, category, dueDate, pinned, now, now, completedAt)
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
  id: string,
  patch: UpdateTodoInput
): Promise<TodoItem | null> {
  const existing = await getTodoById(db, id);
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
       WHERE id = ?`
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
      id
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

export async function deleteTodo(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM todos WHERE id = ?').bind(id).run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function clearCompletedTodos(db: D1Database): Promise<number> {
  const result = await db.prepare("DELETE FROM todos WHERE status = 'done'").run();
  return result.meta?.changes ?? 0;
}

export async function importTodos(db: D1Database, items: CreateTodoInput[]): Promise<TodoItem[]> {
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
          `INSERT INTO todos (id, title, notes, status, priority, category, due_date, pinned, created_at, updated_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(id, input.title, notes, status, priority, category, dueDate, pinned, now, now, completedAt)
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
