-- Add per-todo reminder alarm timestamp (YYYY-MM-DDTHH:mm)

ALTER TABLE todos ADD COLUMN reminder_at TEXT;

CREATE INDEX IF NOT EXISTS idx_todos_owner_reminder
  ON todos(owner_email, reminder_at);
