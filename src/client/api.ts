import type {
  AuthStatusResponse,
  CreateTodoInput,
  TodoItem,
  UpdateTodoInput,
} from '../shared/types';

interface DesktopBridge {
  isLocalMode: boolean;
  getVaultStatus: () => Promise<AuthStatusResponse>;
  unlockVault: (passcode: string) => Promise<{ ok: boolean; error?: string; retryAfterSeconds?: number }>;
  lockVault: () => Promise<void>;
  enablePasscode: (newPasscode: string) => Promise<{ ok: boolean; error?: string }>;
  disablePasscode: (currentPasscode: string) => Promise<{ ok: boolean; error?: string }>;
  connectCloudServer: (url: string) => Promise<{ ok: boolean; error?: string }>;
  switchToLocalVault: () => Promise<void>;
  notify?: (title: string, body: string) => Promise<void>;
  listTodos: () => Promise<TodoItem[]>;
  createTodo: (input: CreateTodoInput) => Promise<TodoItem>;
  updateTodo: (id: string, patch: UpdateTodoInput) => Promise<{ item: TodoItem; nextItem: TodoItem | null }>;
  reorderTodos: (orderedIds: string[]) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
  clearCompleted: () => Promise<number>;
  importTodos: (items: CreateTodoInput[]) => Promise<TodoItem[]>;
}

declare global {
  interface Window {
    privateTodoDesktop?: DesktopBridge;
  }
}

export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && Boolean(window.privateTodoDesktop);
}

export function isLocalDesktopMode(): boolean {
  return typeof window !== 'undefined' && Boolean(window.privateTodoDesktop?.isLocalMode);
}

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
  if (isLocalDesktopMode()) {
    return window.privateTodoDesktop!.getVaultStatus();
  }
  return requestJson<AuthStatusResponse>('/api/auth/status');
}

export async function unlockDesktopVaultApi(passcode: string): Promise<void> {
  if (!isLocalDesktopMode()) {
    throw new ApiError('데스크톱 로컬 보관함 모드가 아닙니다.', 400);
  }
  const res = await window.privateTodoDesktop!.unlockVault(passcode);
  if (!res.ok) {
    throw new ApiError(
      res.error ?? '잠금 비밀번호가 일치하지 않습니다.',
      res.retryAfterSeconds ? 429 : 401,
      res.retryAfterSeconds
    );
  }
}

export async function enableDesktopPasscodeApi(newPasscode: string): Promise<void> {
  const res = await window.privateTodoDesktop!.enablePasscode(newPasscode);
  if (!res.ok) {
    throw new ApiError(res.error ?? '앱 잠금 설정에 실패했습니다.', 400);
  }
}

export async function disableDesktopPasscodeApi(currentPasscode: string): Promise<void> {
  const res = await window.privateTodoDesktop!.disablePasscode(currentPasscode);
  if (!res.ok) {
    throw new ApiError(res.error ?? '앱 잠금 해제에 실패했습니다.', 400);
  }
}

export async function connectDesktopCloudApi(url: string): Promise<void> {
  const res = await window.privateTodoDesktop!.connectCloudServer(url);
  if (!res.ok) {
    throw new ApiError(res.error ?? '클라우드 서버 연결에 실패했습니다.', 400);
  }
}

export async function switchDesktopToLocalApi(): Promise<void> {
  await window.privateTodoDesktop?.switchToLocalVault();
}

export async function triggerNativeNotification(title: string, body: string): Promise<void> {
  if (window.privateTodoDesktop?.notify) {
    await window.privateTodoDesktop.notify(title, body);
    return;
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
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
  code: string,
  rememberMe = true
): Promise<{ authenticated: boolean; userEmail: string; rememberMe: boolean }> {
  return requestJson<{ authenticated: boolean; userEmail: string; rememberMe: boolean }>(
    '/api/auth/verify-code',
    {
      method: 'POST',
      body: JSON.stringify({ email, code, rememberMe }),
    }
  );
}

export async function logoutSession(): Promise<{ authenticated: boolean }> {
  if (isLocalDesktopMode()) {
    await window.privateTodoDesktop!.lockVault();
    return { authenticated: false };
  }
  return requestJson<{ authenticated: boolean }>('/api/auth/logout', {
    method: 'POST',
  });
}

export async function fetchTodos(): Promise<TodoItem[]> {
  if (isLocalDesktopMode()) {
    return window.privateTodoDesktop!.listTodos();
  }
  const res = await requestJson<{ items: TodoItem[] }>('/api/todos');
  return res.items;
}

export async function createTodoApi(input: CreateTodoInput): Promise<TodoItem> {
  if (isLocalDesktopMode()) {
    return window.privateTodoDesktop!.createTodo(input);
  }
  const res = await requestJson<{ item: TodoItem }>('/api/todos', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.item;
}

export async function updateTodoApi(
  id: string,
  patch: UpdateTodoInput
): Promise<{ item: TodoItem; nextItem: TodoItem | null }> {
  if (isLocalDesktopMode()) {
    return window.privateTodoDesktop!.updateTodo(id, patch);
  }
  return requestJson<{ item: TodoItem; nextItem: TodoItem | null }>(
    `/api/todos/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }
  );
}

export async function reorderTodosApi(orderedIds: string[]): Promise<void> {
  if (isLocalDesktopMode()) {
    await window.privateTodoDesktop!.reorderTodos(orderedIds);
    return;
  }
  await requestJson<{ ok: boolean }>('/api/todos/reorder', {
    method: 'POST',
    body: JSON.stringify({ orderedIds }),
  });
}

export async function deleteTodoApi(id: string): Promise<void> {
  if (isLocalDesktopMode()) {
    await window.privateTodoDesktop!.deleteTodo(id);
    return;
  }
  await requestJson<{ deleted: boolean }>(`/api/todos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function clearCompletedApi(): Promise<number> {
  if (isLocalDesktopMode()) {
    return window.privateTodoDesktop!.clearCompleted();
  }
  const res = await requestJson<{ deletedCount: number }>('/api/todos/completed', {
    method: 'DELETE',
  });
  return res.deletedCount;
}

export async function importTodosApi(items: CreateTodoInput[]): Promise<TodoItem[]> {
  if (isLocalDesktopMode()) {
    return window.privateTodoDesktop!.importTodos(items);
  }
  const res = await requestJson<{ items: TodoItem[]; importedCount: number }>('/api/todos/import', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
  return res.items;
}
