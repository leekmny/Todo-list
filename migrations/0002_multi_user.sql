-- Multi-user data isolation: scope every todo strictly to its owner_email

ALTER TABLE todos ADD COLUMN owner_email TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_todos_owner_pinned_created
  ON todos(owner_email, pinned DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_todos_owner_status
  ON todos(owner_email, status);
