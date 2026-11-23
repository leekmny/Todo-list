import { contextBridge, ipcRenderer } from 'electron';
import type { CreateTodoInput, TodoItem, UpdateTodoInput } from '../src/shared/types';
import type { DesktopVaultStatus } from './vault';

const isLocalMode = window.location.protocol === 'app:';

export interface PrivateTodoDesktopBridge {
  isLocalMode: boolean;
  getVaultStatus: () => Promise<DesktopVaultStatus>;
  unlockVault: (passcode: string) => Promise<{ ok: boolean; error?: string; retryAfterSeconds?: number }>;
  lockVault: () => Promise<void>;
  enablePasscode: (newPasscode: string) => Promise<{ ok: boolean; error?: string }>;
  disablePasscode: (currentPasscode: string) => Promise<{ ok: boolean; error?: string }>;
  connectCloudServer: (url: string) => Promise<{ ok: boolean; error?: string }>;
  switchToLocalVault: () => Promise<void>;
  notify: (title: string, body: string) => Promise<void>;
  listTodos: () => Promise<TodoItem[]>;
  createTodo: (input: CreateTodoInput) => Promise<TodoItem>;
  updateTodo: (id: string, patch: UpdateTodoInput) => Promise<{ item: TodoItem; nextItem: TodoItem | null }>;
  reorderTodos: (orderedIds: string[]) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
  clearCompleted: () => Promise<number>;
  importTodos: (items: CreateTodoInput[]) => Promise<TodoItem[]>;
}

const api: PrivateTodoDesktopBridge = {
  isLocalMode,
  getVaultStatus: () => ipcRenderer.invoke('vault:status'),
  unlockVault: (passcode) => ipcRenderer.invoke('vault:unlock', passcode),
  lockVault: () => ipcRenderer.invoke('vault:lock'),
  enablePasscode: (newPasscode) => ipcRenderer.invoke('vault:enable-passcode', newPasscode),
  disablePasscode: (currentPasscode) => ipcRenderer.invoke('vault:disable-passcode', currentPasscode),
  connectCloudServer: (url) => ipcRenderer.invoke('app:connect-cloud', url),
  switchToLocalVault: () => ipcRenderer.invoke('app:switch-local'),
  notify: (title, body) => ipcRenderer.invoke('app:notify', title, body),
  listTodos: () => ipcRenderer.invoke('todos:list'),
  createTodo: (input) => ipcRenderer.invoke('todos:create', input),
  updateTodo: (id, patch) => ipcRenderer.invoke('todos:update', id, patch),
  reorderTodos: (orderedIds) => ipcRenderer.invoke('todos:reorder', orderedIds),
  deleteTodo: (id) => ipcRenderer.invoke('todos:delete', id),
  clearCompleted: () => ipcRenderer.invoke('todos:clear-completed'),
  importTodos: (items) => ipcRenderer.invoke('todos:import', items),
};

contextBridge.exposeInMainWorld('privateTodoDesktop', api);
