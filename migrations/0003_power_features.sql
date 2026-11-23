-- Power features: subtasks checklist, recurring schedules, manual sort_order, focus timer minutes

ALTER TABLE todos ADD COLUMN subtasks TEXT NOT NULL DEFAULT '[]';
ALTER TABLE todos ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly'));
ALTER TABLE todos ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE todos ADD COLUMN focus_minutes INTEGER NOT NULL DEFAULT 0;
