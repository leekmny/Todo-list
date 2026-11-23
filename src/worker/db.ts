import type {
  CreateTodoInput,
  SubtaskItem,
  TodoItem,
  TodoPriority,
  TodoRecurrence,
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
  reminder_at: string | null;
  pinned: number;
  subtasks: string | null;
  recurrence: TodoRecurrence | null;
  sort_order: number | null;
  focus_minutes: number | null;
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
    reminder_at TEXT,
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    subtasks TEXT NOT NULL DEFAULT '[]',
    recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    focus_minutes INTEGER NOT NULL DEFAULT 0,
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
  `CREATE INDEX IF NOT EXISTS idx_todos_owner_reminder ON todos(owner_email, reminder_at)`,
];

const OPTIONAL_COLUMNS: ReadonlyArray<{ name: string; alterSql: string }> = [
  { name: 'owner_email', alterSql: "ALTER TABLE todos ADD COLUMN owner_email TEXT NOT NULL DEFAULT ''" },
  { name: 'reminder_at', alterSql: 'ALTER TABLE todos ADD COLUMN reminder_at TEXT' },
  { name: 'subtasks', alterSql: "ALTER TABLE todos ADD COLUMN subtasks TEXT NOT NULL DEFAULT '[]'" },
  {
    name: 'recurrence',
    alterSql:
      "ALTER TABLE todos ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly'))",
  },
  { name: 'sort_order', alterSql: 'ALTER TABLE todos ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0' },
  { name: 'focus_minutes', alterSql: 'ALTER TABLE todos ADD COLUMN focus_minutes INTEGER NOT NULL DEFAULT 0' },
];

const SELECT_COLUMNS =
  'id, owner_email, title, notes, status, priority, category, due_date, reminder_at, pinned, subtasks, recurrence, sort_order, focus_minutes, created_at, updated_at, completed_at';

function requireOwnerEmail(ownerEmail: string): string {
  const normalized = normalizeEmail(ownerEmail);
  if (!normalized) {
    throw new Error('Authenticated owner email is required for database operations.');
  }
  return normalized;
}

function parseSubtasksJson(raw: string | null | undefined): SubtaskItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object' && typeof item.title === 'string')
      .map((item) => ({
        id: typeof item.id === 'string' && item.id ? item.id : crypto.randomUUID(),
        title: String(item.title),
        done: Boolean(item.done),
      }));
  } catch {
    return [];
  }
}

function computeNextRecurrenceDate(baseDate: string | null, recurrence: TodoRecurrence): string | null {
  if (recurrence === 'none') return null;

  const base =
    baseDate && /^\d{4}-\d{2}-\d{2}$/.test(baseDate)
      ? (() => {
          const [y, m, d] = baseDate.split('-').map(Number);
          return new Date(Date.UTC(y, m - 1, d));
        })()
      : (() => {
          const now = new Date();
          return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        })();

  if (recurrence === 'daily') {
    base.setUTCDate(base.getUTCDate() + 1);
  } else if (recurrence === 'weekly') {
    base.setUTCDate(base.getUTCDate() + 7);
  } else if (recurrence === 'monthly') {
    const origDay = base.getUTCDate();
    base.setUTCDate(1);
    base.setUTCMonth(base.getUTCMonth() + 1);
    const maxDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
    base.setUTCDate(Math.min(origDay, maxDay));
  }

  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, '0');
  const d = String(base.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
    reminderAt: row.reminder_at ?? null,
    pinned: row.pinned === 1,
    subtasks: parseSubtasksJson(row.subtasks),
    recurrence: row.recurrence ?? 'none',
    sortOrder: row.sort_order ?? 0,
    focusMinutes: row.focus_minutes ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export async function ensureSchema(db: D1Database): Promise<void> {
  if (initializedDatabases.has(db)) return;

  await db.batch(BASE_SCHEMA_STATEMENTS.map((sql) => db.prepare(sql)));

  try {
    const info = await db.prepare('PRAGMA table_info(todos)').all<{ name: string }>();
    if (info.results && info.results.length > 0) {
      const existing = new Set(info.results.map((col) => col.name));
      for (const col of OPTIONAL_COLUMNS) {
        if (!existing.has(col.name)) {
          await db.prepare(col.alterSql).run();
        }
      }
    }
  } catch {
    // Ignore if mock DB does not support PRAGMA table_info
  }

  await db.batch(INDEX_STATEMENTS.map((sql) => db.prepare(sql)));
  initializedDatabases.add(db);
}

export async function listTodos(db: D1Database, ownerEmail: string): Promise<TodoItem[]> {
  const owner = requireOwnerEmail(ownerEmail);
  const { results } = await db
    .prepare(
      `SELECT ${SELECT_COLUMNS}
       FROM todos
       WHERE owner_email = ?
       ORDER BY pinned DESC, sort_order ASC, created_at DESC`
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
      `SELECT ${SELECT_COLUMNS}
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
  const reminderAt = input.reminderAt ?? null;
  const pinned = input.pinned ? 1 : 0;
  const subtasks = input.subtasks ?? [];
  const recurrence = input.recurrence ?? 'none';
  const sortOrder = 0;
  const focusMinutes = input.focusMinutes ?? 0;
  const completedAt = status === 'done' ? now : null;

  await db
    .prepare(
      `INSERT INTO todos (id, owner_email, title, notes, status, priority, category, due_date, reminder_at, pinned, subtasks, recurrence, sort_order, focus_minutes, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      reminderAt,
      pinned,
      JSON.stringify(subtasks),
      recurrence,
      sortOrder,
      focusMinutes,
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
    reminderAt,
    pinned: pinned === 1,
    subtasks,
    recurrence,
    sortOrder,
    focusMinutes,
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
): Promise<{ item: TodoItem; nextItem: TodoItem | null } | null> {
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
  const nextReminderAt = patch.reminderAt !== undefined ? patch.reminderAt : existing.reminderAt;
  const nextPinned = patch.pinned !== undefined ? patch.pinned : existing.pinned;
  const nextSubtasks = patch.subtasks ?? existing.subtasks;
  const nextRecurrence = patch.recurrence ?? existing.recurrence;
  const nextSortOrder = patch.sortOrder ?? existing.sortOrder;
  const nextFocusMinutes = patch.focusMinutes ?? existing.focusMinutes;

  const transitionedToDone = patch.status === 'done' && existing.status !== 'done';
  let nextCompletedAt = existing.completedAt;
  if (patch.status !== undefined) {
    if (transitionedToDone) {
      nextCompletedAt = now;
    } else if (nextStatus !== 'done') {
      nextCompletedAt = null;
    }
  }

  // If a recurring task is completed, spawn the next scheduled occurrence and clear recurrence on the archived one
  const shouldSpawnRecurring = transitionedToDone && nextRecurrence !== 'none';
  const storedRecurrenceOnCompleted: TodoRecurrence = shouldSpawnRecurring ? 'none' : nextRecurrence;

  await db
    .prepare(
      `UPDATE todos
       SET title = ?, notes = ?, status = ?, priority = ?, category = ?, due_date = ?, reminder_at = ?, pinned = ?, subtasks = ?, recurrence = ?, sort_order = ?, focus_minutes = ?, updated_at = ?, completed_at = ?
       WHERE id = ? AND owner_email = ?`
    )
    .bind(
      nextTitle,
      nextNotes,
      nextStatus,
      nextPriority,
      nextCategory,
      nextDueDate,
      nextReminderAt,
      nextPinned ? 1 : 0,
      JSON.stringify(nextSubtasks),
      storedRecurrenceOnCompleted,
      nextSortOrder,
      nextFocusMinutes,
      now,
      nextCompletedAt,
      id,
      owner
    )
    .run();

  const updatedItem: TodoItem = {
    id,
    title: nextTitle,
    notes: nextNotes,
    status: nextStatus,
    priority: nextPriority,
    category: nextCategory,
    dueDate: nextDueDate,
    reminderAt: nextReminderAt,
    pinned: nextPinned,
    subtasks: nextSubtasks,
    recurrence: storedRecurrenceOnCompleted,
    sortOrder: nextSortOrder,
    focusMinutes: nextFocusMinutes,
    createdAt: existing.createdAt,
    updatedAt: now,
    completedAt: nextCompletedAt,
  };

  let spawnedNextItem: TodoItem | null = null;
  if (shouldSpawnRecurring) {
    const nextOccurrenceDate = computeNextRecurrenceDate(nextDueDate, nextRecurrence);
    const nextReminderForRecurring =
      nextReminderAt && nextOccurrenceDate ? `${nextOccurrenceDate}${nextReminderAt.slice(10)}` : null;
    const resetSubtasks = nextSubtasks.map((st) => ({
      id: crypto.randomUUID(),
      title: st.title,
      done: false,
    }));
    spawnedNextItem = await createTodo(db, owner, {
      title: nextTitle,
      notes: nextNotes,
      status: 'todo',
      priority: nextPriority,
      category: nextCategory,
      dueDate: nextOccurrenceDate,
      reminderAt: nextReminderForRecurring,
      pinned: nextPinned,
      subtasks: resetSubtasks,
      recurrence: nextRecurrence,
      focusMinutes: 0,
    });
  }

  return { item: updatedItem, nextItem: spawnedNextItem };
}

export async function reorderTodos(
  db: D1Database,
  ownerEmail: string,
  orderedIds: string[]
): Promise<void> {
  const owner = requireOwnerEmail(ownerEmail);
  const now = new Date().toISOString();
  const statements = orderedIds.map((id, index) =>
    db
      .prepare('UPDATE todos SET sort_order = ?, updated_at = ? WHERE id = ? AND owner_email = ?')
      .bind(index + 1, now, id, owner)
  );
  if (statements.length > 0) {
    await db.batch(statements);
  }
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
    const reminderAt = input.reminderAt ?? null;
    const pinned = input.pinned ? 1 : 0;
    const subtasks = input.subtasks ?? [];
    const recurrence = input.recurrence ?? 'none';
    const sortOrder = 0;
    const focusMinutes = input.focusMinutes ?? 0;
    const completedAt = status === 'done' ? now : null;

    statements.push(
      db
        .prepare(
          `INSERT INTO todos (id, owner_email, title, notes, status, priority, category, due_date, reminder_at, pinned, subtasks, recurrence, sort_order, focus_minutes, created_at, updated_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          reminderAt,
          pinned,
          JSON.stringify(subtasks),
          recurrence,
          sortOrder,
          focusMinutes,
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
      reminderAt,
      pinned: pinned === 1,
      subtasks,
      recurrence,
      sortOrder,
      focusMinutes,
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
