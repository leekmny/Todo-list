import type {
  AuthStatusResponse,
  CreateTodoInput,
  TodoItem,
  UpdateTodoInput,
} from '../shared/types';

export class ApiError extends Error {
  status: number;
  retryAfterSeconds?: number;

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const contentType = response.headers.get('Content-Type') ?? '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && typeof data.error === 'string'
        ? data.error
        : `요청 처리 중 오류가 발생했습니다. (${response.status})`;
    const retryAfter =
      data && typeof data === 'object' && typeof data.retryAfterSeconds === 'number'
        ? data.retryAfterSeconds
        : undefined;
    throw new ApiError(message, response.status, retryAfter);
  }

  return data as T;
}

export function getAuthStatus(): Promise<AuthStatusResponse> {
  return requestJson<AuthStatusResponse>('/api/auth/status');
}

export function requestEmailOtp(
  email: string
): Promise<{ ok: boolean; message: string; cooldownSeconds: number }> {
  return requestJson<{ ok: boolean; message: string; cooldownSeconds: number }>(
    '/api/auth/request-code',
    {
      method: 'POST',
      body: JSON.stringify({ email }),
    }
  );
}

export function verifyEmailOtpApi(
  email: string,
  code: string
): Promise<{ authenticated: boolean; userEmail: string }> {
  return requestJson<{ authenticated: boolean; userEmail: string }>('/api/auth/verify-code', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
}

export function logoutSession(): Promise<{ authenticated: boolean }> {
  return requestJson<{ authenticated: boolean }>('/api/auth/logout', {
    method: 'POST',
  });
}

export async function fetchTodos(): Promise<TodoItem[]> {
  const res = await requestJson<{ items: TodoItem[] }>('/api/todos');
  return res.items;
}

export async function createTodoApi(input: CreateTodoInput): Promise<TodoItem> {
  const res = await requestJson<{ item: TodoItem }>('/api/todos', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.item;
}

export async function updateTodoApi(id: string, patch: UpdateTodoInput): Promise<TodoItem> {
  const res = await requestJson<{ item: TodoItem }>(`/api/todos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return res.item;
}

export async function deleteTodoApi(id: string): Promise<void> {
  await requestJson<{ deleted: boolean }>(`/api/todos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function clearCompletedApi(): Promise<number> {
  const res = await requestJson<{ deletedCount: number }>('/api/todos/completed', {
    method: 'DELETE',
  });
  return res.deletedCount;
}

export async function importTodosApi(items: CreateTodoInput[]): Promise<TodoItem[]> {
  const res = await requestJson<{ items: TodoItem[]; importedCount: number }>('/api/todos/import', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
  return res.items;
}
