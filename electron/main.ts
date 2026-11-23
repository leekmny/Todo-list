import fs from 'node:fs';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  protocol,
  safeStorage,
  session,
  shell,
} from 'electron';
import { EncryptedDesktopVault, validateCloudUrl, type KeyProtector } from './vault';

const LOCAL_APP_ORIGIN = 'app://private-todo';
const LOCAL_CSP = [
  "default-src 'self' app:",
  "script-src 'self' app:",
  "style-src 'self' 'unsafe-inline' app:",
  "img-src 'self' data: app:",
  "font-src 'self' data: app:",
  "connect-src 'self' app:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;
let vault: EncryptedDesktopVault | null = null;
let allowedCloudOrigin: string | null = null;

function createOsKeyProtector(): KeyProtector {
  return {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain: Buffer) => safeStorage.encryptString(plain.toString('base64')),
    decrypt: (cipher: Buffer) => Buffer.from(safeStorage.decryptString(cipher), 'base64'),
  };
}

function getClientDistDir(): string {
  return path.join(app.getAppPath(), 'dist', 'desktop-client');
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

function isAllowedNavigationUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.origin === LOCAL_APP_ORIGIN) return true;
    if (allowedCloudOrigin && parsed.origin === allowedCloudOrigin) return true;
    if (
      allowedCloudOrigin &&
      parsed.hostname.endsWith('.cloudflareaccess.com') &&
      parsed.protocol === 'https:'
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function registerLocalProtocol(): void {
  const distDir = getClientDistDir();

  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'private-todo') {
      return new Response('Forbidden', { status: 403 });
    }

    let reqPath = decodeURIComponent(url.pathname);
    if (reqPath === '/' || reqPath === '') {
      reqPath = '/index.html';
    }

    const resolved = path.resolve(distDir, `.${reqPath}`);
    const relative = path.relative(distDir, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return new Response('Forbidden', { status: 403 });
    }

    const targetFile =
      fs.existsSync(resolved) && fs.statSync(resolved).isFile()
        ? resolved
        : path.join(distDir, 'index.html');

    const body = await fs.promises.readFile(targetFile);
    const ext = path.extname(targetFile).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Security-Policy': LOCAL_CSP,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    });
  });
}

function buildAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Private Todo',
      submenu: [
        {
          label: '로컬 암호화 보관함으로 전환',
          click: () => {
            vault?.setCloudUrl(null);
            allowedCloudOrigin = null;
            void mainWindow?.loadURL(`${LOCAL_APP_ORIGIN}/`);
          },
        },
        { type: 'separator' },
        { role: 'reload', label: '새로고침' },
        { type: 'separator' },
        { role: 'quit', label: '종료' },
      ],
    },
    {
      label: '편집',
      submenu: [
        { role: 'undo', label: '실행 취소' },
        { role: 'redo', label: '다시 실행' },
        { type: 'separator' },
        { role: 'cut', label: '잘라내기' },
        { role: 'copy', label: '복사' },
        { role: 'paste', label: '붙여넣기' },
        { role: 'selectAll', label: '모두 선택' },
      ],
    },
    {
      label: '보기',
      submenu: [
        { role: 'resetZoom', label: '원래 크기' },
        { role: 'zoomIn', label: '확대' },
        { role: 'zoomOut', label: '축소' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '전체 화면' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): void {
  const preloadPath = path.join(__dirname, 'preload.cjs');
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 420,
    minHeight: 560,
    title: 'Private Todo',
    backgroundColor: '#0c0d10',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      partition: 'persist:private-todo',
    },
  });

  // Lock down all external navigations and popups
  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isAllowedNavigationUrl(targetUrl)) {
      event.preventDefault();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:') {
        void shell.openExternal(url);
      }
    } catch {
      // Ignore invalid external URLs
    }
    return { action: 'deny' };
  });

  const savedCloudUrl = vault?.getSettings().cloudUrl ?? null;
  if (savedCloudUrl) {
    const validated = validateCloudUrl(savedCloudUrl);
    if (validated.ok) {
      allowedCloudOrigin = validated.url;
      void win.loadURL(validated.url);
    } else {
      void win.loadURL(`${LOCAL_APP_ORIGIN}/`);
    }
  } else {
    void win.loadURL(`${LOCAL_APP_ORIGIN}/`);
  }

  win.on('closed', () => {
    mainWindow = null;
  });

  mainWindow = win;
}

function assertLocalIpcOrigin(event: Electron.IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? '';
  if (!url.startsWith(`${LOCAL_APP_ORIGIN}/`) && url !== LOCAL_APP_ORIGIN) {
    throw new Error('로컬 보관함 API는 로컬 앱 화면에서만 호출할 수 있습니다.');
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('vault:status', (event) => {
    assertLocalIpcOrigin(event);
    return vault!.getStatus();
  });

  ipcMain.handle('vault:unlock', (event, passcode: unknown) => {
    assertLocalIpcOrigin(event);
    if (typeof passcode !== 'string') {
      return { ok: false, error: '비밀번호를 입력해 주세요.' };
    }
    return vault!.unlockWithPasscode(passcode);
  });

  ipcMain.handle('vault:lock', (event) => {
    assertLocalIpcOrigin(event);
    vault!.lock();
  });

  ipcMain.handle('vault:enable-passcode', (event, newPasscode: unknown) => {
    assertLocalIpcOrigin(event);
    try {
      if (typeof newPasscode !== 'string') throw new Error('비밀번호 형식이 올바르지 않습니다.');
      vault!.enablePasscode(newPasscode);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : '설정 실패' };
    }
  });

  ipcMain.handle('vault:disable-passcode', (event, currentPasscode: unknown) => {
    assertLocalIpcOrigin(event);
    try {
      if (typeof currentPasscode !== 'string') throw new Error('비밀번호 형식이 올바르지 않습니다.');
      vault!.disablePasscode(currentPasscode);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : '해제 실패' };
    }
  });

  ipcMain.handle('app:connect-cloud', async (event, rawUrl: unknown) => {
    assertLocalIpcOrigin(event);
    try {
      if (typeof rawUrl !== 'string') throw new Error('서버 URL을 입력해 주세요.');
      const settings = vault!.setCloudUrl(rawUrl);
      allowedCloudOrigin = settings.cloudUrl;
      if (settings.cloudUrl && mainWindow) {
        await mainWindow.loadURL(settings.cloudUrl);
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : '연결 실패' };
    }
  });

  ipcMain.handle('app:switch-local', async () => {
    vault!.setCloudUrl(null);
    allowedCloudOrigin = null;
    if (mainWindow) {
      await mainWindow.loadURL(`${LOCAL_APP_ORIGIN}/`);
    }
  });

  ipcMain.handle('todos:list', (event) => {
    assertLocalIpcOrigin(event);
    return vault!.listTodos();
  });

  ipcMain.handle('todos:create', (event, input: unknown) => {
    assertLocalIpcOrigin(event);
    return vault!.createTodo(input);
  });

  ipcMain.handle('todos:update', (event, id: unknown, patch: unknown) => {
    assertLocalIpcOrigin(event);
    if (typeof id !== 'string') throw new Error('잘못된 할 일 ID입니다.');
    return vault!.updateTodo(id, patch);
  });

  ipcMain.handle('todos:reorder', (event, orderedIds: unknown) => {
    assertLocalIpcOrigin(event);
    vault!.reorderTodos({ orderedIds });
  });

  ipcMain.handle('todos:delete', (event, id: unknown) => {
    assertLocalIpcOrigin(event);
    if (typeof id !== 'string') throw new Error('잘못된 할 일 ID입니다.');
    vault!.deleteTodo(id);
  });

  ipcMain.handle('todos:clear-completed', (event) => {
    assertLocalIpcOrigin(event);
    return vault!.clearCompleted();
  });

  ipcMain.handle('todos:import', (event, items: unknown) => {
    assertLocalIpcOrigin(event);
    return vault!.importTodos({ items });
  });
}

const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Deny dangerous browser hardware permissions across both default and persistent sessions
    for (const ses of [session.defaultSession, session.fromPartition('persist:private-todo')]) {
      ses.setPermissionRequestHandler((_webContents, _permission, callback) => {
        callback(false);
      });
    }

    vault = new EncryptedDesktopVault(path.join(app.getPath('userData'), 'vault'), createOsKeyProtector());
    registerLocalProtocol();
    registerIpcHandlers();
    buildAppMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
