import type {
  AuthStatusResponse,
  CategorySource,
  CreateTodoInput,
  TodoAttachment,
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
  suggestCategory?: (title: string, notes?: string) => Promise<{ category: string; source: CategorySource }>;
  autoCategorizeTodos?: () => Promise<{ updatedCount: number; items: TodoItem[] }>;
  uploadAttachment: (todoId: string, fileName: string, dataBase64: string) => Promise<TodoAttachment>;
  readAttachment: (todoId: string, attachmentId: string) => Promise<{ meta: TodoAttachment; dataBase64: string }>;
  deleteAttachment: (todoId: string, attachmentId: string) => Promise<void>;
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

export async function createTodoApi(
  input: CreateTodoInput
): Promise<{ item: TodoItem; categorySource: CategorySource }> {
  if (isLocalDesktopMode()) {
    const item = await window.privateTodoDesktop!.createTodo(input);
    const hadManual = Boolean(input.category?.trim());
    const categorySource: CategorySource = hadManual
      ? 'manual'
      : item.category
        ? 'fallback'
        : 'none';
    return { item, categorySource };
  }
  const res = await requestJson<{ item: TodoItem; categorySource?: CategorySource }>('/api/todos', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return {
    item: res.item,
    categorySource: res.categorySource ?? (res.item.category ? 'manual' : 'none'),
  };
}

export async function suggestCategoryApi(
  title: string,
  notes = ''
): Promise<{ category: string; source: CategorySource }> {
  if (isLocalDesktopMode()) {
    if (window.privateTodoDesktop?.suggestCategory) {
      return window.privateTodoDesktop.suggestCategory(title, notes);
    }
    return { category: '', source: 'none' };
  }
  return requestJson<{ category: string; source: CategorySource }>('/api/todos/suggest-category', {
    method: 'POST',
    body: JSON.stringify({ title, notes }),
  });
}

export async function autoCategorizeTodosApi(): Promise<{
  updatedCount: number;
  items: TodoItem[];
}> {
  if (isLocalDesktopMode()) {
    if (window.privateTodoDesktop?.autoCategorizeTodos) {
      return window.privateTodoDesktop.autoCategorizeTodos();
    }
    return { updatedCount: 0, items: [] };
  }
  return requestJson<{ updatedCount: number; items: TodoItem[] }>('/api/todos/auto-categorize', {
    method: 'POST',
  });
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export async function uploadAttachmentApi(todoId: string, file: File): Promise<TodoAttachment> {
  if (isLocalDesktopMode()) {
    const buffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    return window.privateTodoDesktop!.uploadAttachment(todoId, file.name, base64);
  }

  const form = new FormData();
  form.append('file', file, file.name);
  const response = await fetch(`/api/todos/${encodeURIComponent(todoId)}/attachments`, {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && typeof data.error === 'string'
        ? data.error
        : `파일 업로드에 실패했습니다. (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return (data as { attachment: TodoAttachment }).attachment;
}

export async function downloadAttachmentApi(
  todoId: string,
  attachment: TodoAttachment
): Promise<void> {
  if (isLocalDesktopMode()) {
    const { meta, dataBase64 } = await window.privateTodoDesktop!.readAttachment(
      todoId,
      attachment.id
    );
    const blob = base64ToBlob(dataBase64, meta.mimeType);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = meta.fileName;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }

  const url = `/api/todos/${encodeURIComponent(todoId)}/attachments/${encodeURIComponent(attachment.id)}`;
  const link = document.createElement('a');
  link.href = url;
  link.download = attachment.fileName;
  link.click();
}

export async function loadAttachmentImageUrl(
  todoId: string,
  attachment: TodoAttachment
): Promise<{ url: string; revoke: boolean }> {
  if (isLocalDesktopMode()) {
    const { meta, dataBase64 } = await window.privateTodoDesktop!.readAttachment(
      todoId,
      attachment.id
    );
    const blob = base64ToBlob(dataBase64, meta.mimeType);
    return { url: URL.createObjectURL(blob), revoke: true };
  }
  return {
    url: `/api/todos/${encodeURIComponent(todoId)}/attachments/${encodeURIComponent(attachment.id)}?inline=1`,
    revoke: false,
  };
}

export async function deleteAttachmentApi(todoId: string, attachmentId: string): Promise<void> {
  if (isLocalDesktopMode()) {
    await window.privateTodoDesktop!.deleteAttachment(todoId, attachmentId);
    return;
  }
  await requestJson<{ deleted: boolean }>(
    `/api/todos/${encodeURIComponent(todoId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { method: 'DELETE' }
  );
}
