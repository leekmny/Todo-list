export type TodoStatus = 'todo' | 'in_progress' | 'done';
export type TodoPriority = 'low' | 'medium' | 'high';

export interface TodoItem {
  id: string;
  title: string;
  notes: string;
  status: TodoStatus;
  priority: TodoPriority;
  category: string;
  dueDate: string | null;
  pinned: boolean;
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
  pinned?: boolean;
}

export interface UpdateTodoInput {
  title?: string;
  notes?: string;
  status?: TodoStatus;
  priority?: TodoPriority;
  category?: string;
  dueDate?: string | null;
  pinned?: boolean;
}

export interface AuthStatusResponse {
  authenticated: boolean;
  configured: boolean;
  emailOtpReady: boolean;
  cfAccessEnabled: boolean;
  authMethod: 'email-otp' | 'cf-access' | null;
  userEmail: string | null;
}

export const TODO_LIMITS = {
  MAX_TITLE_LENGTH: 200,
  MAX_NOTES_LENGTH: 5000,
  MAX_CATEGORY_LENGTH: 40,
  MAX_IMPORT_ITEMS: 500,
} as const;

export const TODO_STATUSES: readonly TodoStatus[] = ['todo', 'in_progress', 'done'];
export const TODO_PRIORITIES: readonly TodoPriority[] = ['low', 'medium', 'high'];
