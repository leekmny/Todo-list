-- Per-todo simple file attachments (up to 1.5 MB per file, scoped strictly by owner_email)

CREATE TABLE IF NOT EXISTS todo_attachments (
  id TEXT PRIMARY KEY,
  todo_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attachments_owner_todo
  ON todo_attachments(owner_email, todo_id, created_at DESC);
