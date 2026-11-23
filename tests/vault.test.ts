import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EncryptedDesktopVault, validateCloudUrl, type KeyProtector } from '../electron/vault';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'private-todo-vault-test-'));
  tempDirs.push(dir);
  return dir;
}

function createMockOsProtector(): KeyProtector {
  return {
    isAvailable: () => true,
    encrypt: (plain: Buffer) => Buffer.from(plain.map((b) => b ^ 0x5a)),
    decrypt: (cipher: Buffer) => Buffer.from(cipher.map((b) => b ^ 0x5a)),
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('EncryptedDesktopVault (AES-256-GCM + PBKDF2)', () => {
  it('encrypts todos at rest on disk (never writes plaintext) and persists across reloads', () => {
    const dir = createTempDir();
    const protector = createMockOsProtector();

    const vault1 = new EncryptedDesktopVault(dir, protector);
    expect(vault1.getStatus().authenticated).toBe(true);

    const created = vault1.createTodo({
      title: '초기밀 개인 프로젝트 계획',
      notes: '절대 평문 저장 금지',
      priority: 'high',
      recurrence: 'daily',
      dueDate: '2026-11-23',
      subtasks: [{ id: 'st1', title: '암호화 검증', done: true }],
    });

    // Disk file must NOT contain plaintext title or notes
    const rawOnDisk = fs.readFileSync(path.join(dir, 'vault.enc'), 'utf8');
    expect(rawOnDisk).not.toContain('초기밀 개인 프로젝트 계획');
    expect(rawOnDisk).not.toContain('절대 평문 저장 금지');

    // Reloading vault decrypts properly
    const vault2 = new EncryptedDesktopVault(dir, protector);
    const items = vault2.listTodos();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(created.id);
    expect(items[0].title).toBe('초기밀 개인 프로젝트 계획');

    // Completing daily recurring task spawns tomorrow's task with reset subtasks
    const { nextItem } = vault2.updateTodo(created.id, { status: 'done' });
    expect(nextItem).toBeTruthy();
    expect(nextItem!.dueDate).toBe('2026-11-24');
    expect(nextItem!.subtasks[0].done).toBe(false);
  });

  it('supports PBKDF2 passcode lock, brute-force lockout, tamper detection, and unlock', () => {
    const dir = createTempDir();
    const protector = createMockOsProtector();

    const vault = new EncryptedDesktopVault(dir, protector);
    vault.createTodo({ title: '잠금 보호 테스트' });
    vault.enablePasscode('my-strong-passcode');
    vault.lock();

    expect(vault.getStatus().authenticated).toBe(false);
    expect(() => vault.listTodos()).toThrow();

    // 4 wrong attempts -> rejected; 5th triggers lockout
    const now = Date.UTC(2026, 10, 23, 12, 0, 0);
    for (let i = 0; i < 4; i += 1) {
      const res = vault.unlockWithPasscode('wrong-pass', now);
      expect(res.ok).toBe(false);
    }
    const fifth = vault.unlockWithPasscode('wrong-pass', now);
    expect(fifth.ok).toBe(false);
    if (!fifth.ok) expect(fifth.retryAfterSeconds).toBeGreaterThan(0);

    // Even right passcode blocked during lockout window
    const blocked = vault.unlockWithPasscode('my-strong-passcode', now + 10_000);
    expect(blocked.ok).toBe(false);

    // After lockout window -> right passcode succeeds
    const unlocked = vault.unlockWithPasscode('my-strong-passcode', now + 6 * 60 * 1000);
    expect(unlocked.ok).toBe(true);
    expect(vault.listTodos()[0].title).toBe('잠금 보호 테스트');

    // Disabling passcode requires current passcode
    expect(() => vault.disablePasscode('wrong-pass')).toThrow();
    vault.disablePasscode('my-strong-passcode');
    expect(vault.getStatus().localPasscodeEnabled).toBe(false);
  });

  it('detects ciphertext tampering via AES-GCM auth tag', () => {
    const dir = createTempDir();
    const protector = createMockOsProtector();

    const vault = new EncryptedDesktopVault(dir, protector);
    vault.createTodo({ title: '무결성 검사' });

    const vaultFile = path.join(dir, 'vault.enc');
    const json = JSON.parse(fs.readFileSync(vaultFile, 'utf8'));
    const tampered = Buffer.from(json.ciphertextB64, 'base64');
    tampered[0] ^= 0xff;
    json.ciphertextB64 = tampered.toString('base64');
    fs.writeFileSync(vaultFile, JSON.stringify(json), 'utf8');

    expect(() => new EncryptedDesktopVault(dir, protector)).toThrow();
  });

  it('validates Cloud Sync URLs strictly (HTTPS only except localhost)', () => {
    expect(validateCloudUrl('https://my-todo.workers.dev/path')).toEqual({
      ok: true,
      url: 'https://my-todo.workers.dev',
    });
    expect(validateCloudUrl('http://localhost:5173')).toEqual({
      ok: true,
      url: 'http://localhost:5173',
    });
    expect(validateCloudUrl('http://evil.example.com').ok).toBe(false);
    expect(validateCloudUrl('javascript:alert(1)').ok).toBe(false);
    expect(validateCloudUrl('file:///C:/Windows/System32').ok).toBe(false);
    expect(validateCloudUrl('https://user:pass@my-todo.workers.dev').ok).toBe(false);
  });
});
