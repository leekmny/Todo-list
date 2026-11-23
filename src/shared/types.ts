export type TodoStatus = 'todo' | 'in_progress' | 'done';
export type TodoPriority = 'low' | 'medium' | 'high';
export type TodoRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';

export interface SubtaskItem {
  id: string;
  title: string;
  done: boolean;
}

export interface TodoItem {
  id: string;
  title: string;
  notes: string;
  status: TodoStatus;
  priority: TodoPriority;
  category: string;
  dueDate: string | null;
  reminderAt: string | null;
  pinned: boolean;
  subtasks: SubtaskItem[];
  recurrence: TodoRecurrence;
  sortOrder: number;
  focusMinutes: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreateTodoInput {
  title: string;
  notes?: string;
  status?: TodoStatus;
  priority?: TodoPriority;
  category?: string;
  dueDate?: string | null;
  reminderAt?: string | null;
  pinned?: boolean;
  subtasks?: SubtaskItem[];
  recurrence?: TodoRecurrence;
  focusMinutes?: number;
}

export interface UpdateTodoInput {
  title?: string;
  notes?: string;
  status?: TodoStatus;
  priority?: TodoPriority;
  category?: string;
  dueDate?: string | null;
  reminderAt?: string | null;
  pinned?: boolean;
  subtasks?: SubtaskItem[];
  recurrence?: TodoRecurrence;
  sortOrder?: number;
  focusMinutes?: number;
}

export interface OAuthProvidersStatus {
  google: boolean;
  github: boolean;
}

export interface AuthStatusResponse {
  authenticated: boolean;
  configured: boolean;
  emailOtpReady: boolean;
  cfAccessEnabled: boolean;
  oauthProviders: OAuthProvidersStatus;
  authMethod: 'email-otp' | 'cf-access' | 'oauth-google' | 'oauth-github' | 'local-vault' | null;
  userEmail: string | null;
  desktopMode?: boolean;
  localPasscodeEnabled?: boolean;
  encryptionLabel?: string;
  cloudUrl?: string | null;
}

export const TODO_LIMITS = {
  MAX_TITLE_LENGTH: 200,
  MAX_NOTES_LENGTH: 5000,
  MAX_CATEGORY_LENGTH: 40,
  MAX_IMPORT_ITEMS: 500,
  MAX_SUBTASKS: 30,
  MAX_SUBTASK_TITLE_LENGTH: 140,
  MAX_FOCUS_MINUTES: 100_000,
} as const;

export const TODO_STATUSES: readonly TodoStatus[] = ['todo', 'in_progress', 'done'];
export const TODO_PRIORITIES: readonly TodoPriority[] = ['low', 'medium', 'high'];
export const TODO_RECURRENCES: readonly TodoRecurrence[] = ['none', 'daily', 'weekly', 'monthly'];
