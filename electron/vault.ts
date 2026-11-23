import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  CreateTodoInput,
  TodoItem,
  TodoRecurrence,
  UpdateTodoInput,
} from '../src/shared/types';
import {
  validateCreateTodo,
  validateImportPayload,
  validateReorderPayload,
  validateUpdateTodo,
} from '../src/worker/validation';

const PBKDF2_ITERATIONS = 310_000;
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const MAX_PASSCODE_FAILURES = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

export interface KeyProtector {
  isAvailable(): boolean;
  encrypt(plain: Buffer): Buffer;
  decrypt(cipher: Buffer): Buffer;
}

interface EncryptedVaultFile {
  version: 2;
  mode: 'os-key' | 'passcode';
  saltHex?: string;
  iterations?: number;
  wrappedKeyB64?: string;
  ivHex: string;
  tagHex: string;
  ciphertextB64: string;
}

interface VaultData {
  todos: TodoItem[];
}

interface DesktopSettings {
  cloudUrl: string | null;
}

export interface DesktopVaultStatus {
  authenticated: boolean;
  configured: boolean;
  emailOtpReady: boolean;
  cfAccessEnabled: boolean;
  oauthProviders: { google: boolean; github: boolean };
  authMethod: 'local-vault' | null;
  userEmail: string | null;
  desktopMode: true;
  localPasscodeEnabled: boolean;
  encryptionLabel: string;
  cloudUrl: string | null;
}

export function validateCloudUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: '클라우드 서버 주소를 입력해 주세요.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: '올바른 URL 형식이 아닙니다. (예: https://your-worker.workers.dev)' };
  }

  const isLocal =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '::1';

  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocal)) {
    return { ok: false, error: '보안을 위해 https:// 주소만 연결할 수 있습니다.' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: 'URL에 인증 정보를 포함할 수 없습니다.' };
  }

  return { ok: true, url: parsed.origin };
}

function computeNextRecurrenceDate(
  baseDate: string | null,
  recurrence: TodoRecurrence
): string | null {
  if (recurrence === 'none') return null;
  const base =
    baseDate && /^\d{4}-\d{2}-\d{2}$/.test(baseDate)
      ? (() => {
          const [y, m, d] = baseDate.split('-').map(Number);
          return new Date(Date.UTC(y, m - 1, d));
        })()
      : (() => {
          const now = new Date();
          return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        })();

  if (recurrence === 'daily') {
    base.setUTCDate(base.getUTCDate() + 1);
  } else if (recurrence === 'weekly') {
    base.setUTCDate(base.getUTCDate() + 7);
  } else if (recurrence === 'monthly') {
    const origDay = base.getUTCDate();
    base.setUTCDate(1);
    base.setUTCMonth(base.getUTCMonth() + 1);
    const maxDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
    base.setUTCDate(Math.min(origDay, maxDay));
  }

  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, '0');
  const d = String(base.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function encryptAesGcm(key: Buffer, plaintext: string): { ivHex: string; tagHex: string; ciphertextB64: string } {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ivHex: iv.toString('hex'),
    tagHex: tag.toString('hex'),
    ciphertextB64: encrypted.toString('base64'),
  };
}

function decryptAesGcm(key: Buffer, ivHex: string, tagHex: string, ciphertextB64: string): string {
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

function derivePasscodeKey(passcode: string, salt: Buffer, iterations = PBKDF2_ITERATIONS): Buffer {
  return crypto.pbkdf2Sync(passcode, salt, iterations, KEY_LENGTH, 'sha256');
}

function atomicWriteJson(filePath: string, payload: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

export class EncryptedDesktopVault {
  private readonly vaultPath: string;
  private readonly settingsPath: string;
  private readonly keyProtector: KeyProtector;

  private activeKey: Buffer | null = null;
  private activeSalt: Buffer | null = null;
  private mode: 'os-key' | 'passcode' = 'os-key';
  private todos: TodoItem[] = [];
  private failedAttempts = 0;
  private lockedUntilMs = 0;

  constructor(dataDir: string, keyProtector: KeyProtector) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.vaultPath = path.join(dataDir, 'vault.enc');
    this.settingsPath = path.join(dataDir, 'settings.json');
    this.keyProtector = keyProtector;
    this.bootstrap();
  }

  private bootstrap(): void {
    if (!fs.existsSync(this.vaultPath)) {
      this.mode = 'os-key';
      this.activeKey = crypto.randomBytes(KEY_LENGTH);
      this.todos = [];
      this.persist();
      return;
    }

    const raw = JSON.parse(fs.readFileSync(this.vaultPath, 'utf8')) as EncryptedVaultFile;
    this.mode = raw.mode === 'passcode' ? 'passcode' : 'os-key';

    if (this.mode === 'os-key') {
      if (!raw.wrappedKeyB64) {
        throw new Error('Encrypted vault key metadata is missing.');
      }
      const wrapped = Buffer.from(raw.wrappedKeyB64, 'base64');
      const key = this.keyProtector.isAvailable() ? this.keyProtector.decrypt(wrapped) : wrapped;
      const plaintext = decryptAesGcm(key, raw.ivHex, raw.tagHex, raw.ciphertextB64);
      const parsed = JSON.parse(plaintext) as VaultData;
      this.activeKey = key;
      this.todos = Array.isArray(parsed.todos) ? parsed.todos : [];
    }
  }

  private persist(): void {
    if (!this.activeKey) {
      throw new Error('보관함이 잠겨 있어 저장할 수 없습니다.');
    }

    const payload = JSON.stringify({ todos: this.todos });
    const encrypted = encryptAesGcm(this.activeKey, payload);

    if (this.mode === 'passcode') {
      if (!this.activeSalt) {
        throw new Error('Passcode salt missing.');
      }
      const fileObj: EncryptedVaultFile = {
        version: 2,
        mode: 'passcode',
        saltHex: this.activeSalt.toString('hex'),
        iterations: PBKDF2_ITERATIONS,
        ...encrypted,
      };
      atomicWriteJson(this.vaultPath, fileObj);
      return;
    }

    const wrappedKey = this.keyProtector.isAvailable()
      ? this.keyProtector.encrypt(this.activeKey)
      : this.activeKey;
    const fileObj: EncryptedVaultFile = {
      version: 2,
      mode: 'os-key',
      wrappedKeyB64: wrappedKey.toString('base64'),
      ...encrypted,
    };
    atomicWriteJson(this.vaultPath, fileObj);
  }

  private assertUnlocked(): void {
    if (!this.activeKey) {
      throw new Error('앱 잠금을 먼저 해제해 주세요.');
    }
  }

  getSettings(): DesktopSettings {
    if (!fs.existsSync(this.settingsPath)) {
      return { cloudUrl: null };
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8')) as Partial<DesktopSettings>;
      return { cloudUrl: typeof parsed.cloudUrl === 'string' ? parsed.cloudUrl : null };
    } catch {
      return { cloudUrl: null };
    }
  }

  setCloudUrl(rawUrl: string | null): DesktopSettings {
    if (rawUrl === null || rawUrl.trim() === '') {
      const next: DesktopSettings = { cloudUrl: null };
      atomicWriteJson(this.settingsPath, next);
      return next;
    }
    const validated = validateCloudUrl(rawUrl);
    if (!validated.ok) {
      throw new Error(validated.error);
    }
    const next: DesktopSettings = { cloudUrl: validated.url };
    atomicWriteJson(this.settingsPath, next);
    return next;
  }

  getStatus(): DesktopVaultStatus {
    const unlocked = this.activeKey !== null;
    const settings = this.getSettings();
    const encryptionLabel =
      this.mode === 'passcode'
        ? 'AES-256-GCM + PBKDF2 앱 잠금 암호화'
        : this.keyProtector.isAvailable()
          ? 'AES-256-GCM + OS 보안 키체인(DPAPI)'
          : 'AES-256-GCM 로컬 암호화';

    return {
      authenticated: unlocked,
      configured: true,
      emailOtpReady: false,
      cfAccessEnabled: false,
      oauthProviders: { google: false, github: false },
      authMethod: unlocked ? 'local-vault' : null,
      userEmail: unlocked ? '로컬 암호화 보관함' : null,
      desktopMode: true,
      localPasscodeEnabled: this.mode === 'passcode',
      encryptionLabel,
      cloudUrl: settings.cloudUrl,
    };
  }

  unlockWithPasscode(passcode: string, nowMs = Date.now()): { ok: true } | { ok: false; error: string; retryAfterSeconds?: number } {
    if (this.mode !== 'passcode') {
      return { ok: true };
    }
    if (this.lockedUntilMs > nowMs) {
      const retryAfterSeconds = Math.max(1, Math.ceil((this.lockedUntilMs - nowMs) / 1000));
      return {
        ok: false,
        error: `비밀번호를 여러 번 잘못 입력했습니다. ${retryAfterSeconds}초 후 다시 시도하세요.`,
        retryAfterSeconds,
      };
    }

    const raw = JSON.parse(fs.readFileSync(this.vaultPath, 'utf8')) as EncryptedVaultFile;
    if (!raw.saltHex) {
      return { ok: false, error: '보관함 암호화 정보가 손상되었습니다.' };
    }

    const salt = Buffer.from(raw.saltHex, 'hex');
    const iterations = raw.iterations ?? PBKDF2_ITERATIONS;
    const key = derivePasscodeKey(passcode, salt, iterations);

    try {
      const plaintext = decryptAesGcm(key, raw.ivHex, raw.tagHex, raw.ciphertextB64);
      const parsed = JSON.parse(plaintext) as VaultData;
      this.activeKey = key;
      this.activeSalt = salt;
      this.todos = Array.isArray(parsed.todos) ? parsed.todos : [];
      this.failedAttempts = 0;
      this.lockedUntilMs = 0;
      return { ok: true };
    } catch {
      this.failedAttempts += 1;
      if (this.failedAttempts >= MAX_PASSCODE_FAILURES) {
        this.lockedUntilMs = nowMs + LOCKOUT_MS;
        this.failedAttempts = 0;
        const retryAfterSeconds = Math.ceil(LOCKOUT_MS / 1000);
        return {
          ok: false,
          error: `잠금 비밀번호를 5회 잘못 입력하여 ${retryAfterSeconds}초 동안 잠깁니다.`,
          retryAfterSeconds,
        };
      }
      return { ok: false, error: '잠금 비밀번호가 일치하지 않습니다.' };
    }
  }

  lock(): void {
    if (this.mode === 'passcode') {
      if (this.activeKey) {
        this.activeKey.fill(0);
      }
      this.activeKey = null;
      this.activeSalt = null;
      this.todos = [];
    }
  }

  enablePasscode(newPasscode: string): void {
    this.assertUnlocked();
    if (!newPasscode || newPasscode.length < 6) {
      throw new Error('앱 잠금 비밀번호는 최소 6자 이상이어야 합니다.');
    }
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = derivePasscodeKey(newPasscode, salt, PBKDF2_ITERATIONS);
    this.mode = 'passcode';
    this.activeSalt = salt;
    this.activeKey = key;
    this.persist();
  }

  disablePasscode(currentPasscode: string): void {
    this.assertUnlocked();
    if (this.mode !== 'passcode') return;

    const raw = JSON.parse(fs.readFileSync(this.vaultPath, 'utf8')) as EncryptedVaultFile;
    const salt = Buffer.from(raw.saltHex ?? '', 'hex');
    const checkKey = derivePasscodeKey(currentPasscode, salt, raw.iterations ?? PBKDF2_ITERATIONS);
    try {
      decryptAesGcm(checkKey, raw.ivHex, raw.tagHex, raw.ciphertextB64);
    } catch {
      throw new Error('현재 비밀번호가 일치하지 않습니다.');
    }

    this.mode = 'os-key';
    this.activeSalt = null;
    this.activeKey = crypto.randomBytes(KEY_LENGTH);
    this.persist();
  }

  listTodos(): TodoItem[] {
    this.assertUnlocked();
    return [...this.todos].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }

  createTodo(rawInput: unknown): TodoItem {
    this.assertUnlocked();
    const parsed = validateCreateTodo(rawInput);
    if (!parsed.ok) throw new Error(parsed.error);
    const input: CreateTodoInput = parsed.data;
    const now = new Date().toISOString();
    const status = input.status ?? 'todo';
    const item: TodoItem = {
      id: crypto.randomUUID(),
      title: input.title,
      notes: input.notes ?? '',
      status,
      priority: input.priority ?? 'medium',
      category: input.category ?? '',
      dueDate: input.dueDate ?? null,
      reminderAt: input.reminderAt ?? null,
      pinned: Boolean(input.pinned),
      subtasks: input.subtasks ?? [],
      recurrence: input.recurrence ?? 'none',
      sortOrder: 0,
      focusMinutes: input.focusMinutes ?? 0,
      createdAt: now,
      updatedAt: now,
      completedAt: status === 'done' ? now : null,
    };
    this.todos.unshift(item);
    this.persist();
    return item;
  }

  updateTodo(id: string, rawPatch: unknown): { item: TodoItem; nextItem: TodoItem | null } {
    this.assertUnlocked();
    const parsed = validateUpdateTodo(rawPatch);
    if (!parsed.ok) throw new Error(parsed.error);
    const patch: UpdateTodoInput = parsed.data;

    const index = this.todos.findIndex((t) => t.id === id);
    if (index === -1) throw new Error('할 일을 찾을 수 없습니다.');

    const existing = this.todos[index];
    const now = new Date().toISOString();
    const nextStatus = patch.status ?? existing.status;
    const nextRecurrence = patch.recurrence ?? existing.recurrence;
    const transitionedToDone = patch.status === 'done' && existing.status !== 'done';

    let nextCompletedAt = existing.completedAt;
    if (patch.status !== undefined) {
      if (transitionedToDone) nextCompletedAt = now;
      else if (nextStatus !== 'done') nextCompletedAt = null;
    }

    const shouldSpawnRecurring = transitionedToDone && nextRecurrence !== 'none';
    const storedRecurrence: TodoRecurrence = shouldSpawnRecurring ? 'none' : nextRecurrence;

    const updated: TodoItem = {
      ...existing,
      title: patch.title ?? existing.title,
      notes: patch.notes ?? existing.notes,
      status: nextStatus,
      priority: patch.priority ?? existing.priority,
      category: patch.category ?? existing.category,
      dueDate: patch.dueDate !== undefined ? patch.dueDate : existing.dueDate,
      reminderAt: patch.reminderAt !== undefined ? patch.reminderAt : existing.reminderAt ?? null,
      pinned: patch.pinned !== undefined ? patch.pinned : existing.pinned,
      subtasks: patch.subtasks ?? existing.subtasks,
      recurrence: storedRecurrence,
      sortOrder: patch.sortOrder ?? existing.sortOrder,
      focusMinutes: patch.focusMinutes ?? existing.focusMinutes,
      updatedAt: now,
      completedAt: nextCompletedAt,
    };
    this.todos[index] = updated;

    let nextItem: TodoItem | null = null;
    if (shouldSpawnRecurring) {
      const nextDueDate = computeNextRecurrenceDate(updated.dueDate, nextRecurrence);
      const nextReminder =
        updated.reminderAt && nextDueDate ? `${nextDueDate}${updated.reminderAt.slice(10)}` : null;
      nextItem = {
        id: crypto.randomUUID(),
        title: updated.title,
        notes: updated.notes,
        status: 'todo',
        priority: updated.priority,
        category: updated.category,
        dueDate: nextDueDate,
        reminderAt: nextReminder,
        pinned: updated.pinned,
        subtasks: updated.subtasks.map((s) => ({
          id: crypto.randomUUID(),
          title: s.title,
          done: false,
        })),
        recurrence: nextRecurrence,
        sortOrder: 0,
        focusMinutes: 0,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      };
      this.todos.unshift(nextItem);
    }

    this.persist();
    return { item: updated, nextItem };
  }

  reorderTodos(rawBody: unknown): void {
    this.assertUnlocked();
    const parsed = validateReorderPayload(rawBody);
    if (!parsed.ok) throw new Error(parsed.error);
    const orderMap = new Map(parsed.data.map((id, idx) => [id, idx + 1]));
    const now = new Date().toISOString();
    this.todos = this.todos.map((item) =>
      orderMap.has(item.id) ? { ...item, sortOrder: orderMap.get(item.id)!, updatedAt: now } : item
    );
    this.persist();
  }

  deleteTodo(id: string): boolean {
    this.assertUnlocked();
    const before = this.todos.length;
    this.todos = this.todos.filter((item) => item.id !== id);
    if (this.todos.length === before) return false;
    this.persist();
    return true;
  }

  clearCompleted(): number {
    this.assertUnlocked();
    const before = this.todos.length;
    this.todos = this.todos.filter((item) => item.status !== 'done');
    const deleted = before - this.todos.length;
    if (deleted > 0) this.persist();
    return deleted;
  }

  importTodos(rawBody: unknown): TodoItem[] {
    this.assertUnlocked();
    const parsed = validateImportPayload(rawBody);
    if (!parsed.ok) throw new Error(parsed.error);

    const created: TodoItem[] = [];
    const nowBase = Date.now();
    for (let i = 0; i < parsed.data.length; i += 1) {
      const input = parsed.data[i];
      const now = new Date(nowBase + i).toISOString();
      const status = input.status ?? 'todo';
      const item: TodoItem = {
        id: crypto.randomUUID(),
        title: input.title,
        notes: input.notes ?? '',
        status,
        priority: input.priority ?? 'medium',
        category: input.category ?? '',
        dueDate: input.dueDate ?? null,
        reminderAt: input.reminderAt ?? null,
        pinned: Boolean(input.pinned),
        subtasks: input.subtasks ?? [],
        recurrence: input.recurrence ?? 'none',
        sortOrder: 0,
        focusMinutes: input.focusMinutes ?? 0,
        createdAt: now,
        updatedAt: now,
        completedAt: status === 'done' ? now : null,
      };
      created.push(item);
      this.todos.unshift(item);
    }

    this.persist();
    return created;
  }
}
