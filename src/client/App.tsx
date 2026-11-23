import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, CheckCheck, Menu, Search, Sparkles, X } from 'lucide-react';
import type {
  AuthStatusResponse,
  CreateTodoInput,
  TodoItem as TodoModel,
  TodoStatus,
  UpdateTodoInput,
} from '../shared/types';
import {
  ApiError,
  clearCompletedApi,
  createTodoApi,
  deleteTodoApi,
  fetchTodos,
  getAuthStatus,
  importTodosApi,
  logoutSession,
  updateTodoApi,
} from './api';
import { LockScreen } from './components/LockScreen';
import { Sidebar, type SmartView } from './components/Sidebar';
import { TodoComposer } from './components/TodoComposer';
import { TodoEditModal } from './components/TodoEditModal';
import { TodoItem } from './components/TodoItem';

type SortMode = 'default' | 'dueDate' | 'priority';

interface ToastMessage {
  id: number;
  text: string;
  undoTodo?: CreateTodoInput;
}

const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 } as const;

const VIEW_TITLES: Record<SmartView, { title: string; subtitle: string }> = {
  all: { title: '전체 할 일', subtitle: '모든 개인 일정과 메모를 한눈에 관리합니다.' },
  today: { title: '오늘 집중', subtitle: '오늘 마감이거나 고정된 핵심 작업입니다.' },
  active: { title: '진행 중', subtitle: '아직 완료하지 않은 할 일 목록입니다.' },
  important: { title: '중요 / 고정', subtitle: '상단 고정 또는 높은 우선순위 작업입니다.' },
  done: { title: '완료됨', subtitle: '마무리한 기록입니다.' },
};

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function App() {
  const [auth, setAuth] = useState<AuthStatusResponse | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [todos, setTodos] = useState<TodoModel[]>([]);
  const [loadingTodos, setLoadingTodos] = useState(false);

  const [activeView, setActiveView] = useState<SmartView>('all');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [editingTodo, setEditingTodo] = useState<TodoModel | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = window.localStorage.getItem('private-todo-theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  const composerRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const todayStr = getTodayDateString();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('private-todo-theme', theme);
  }, [theme]);

  const showToast = useCallback((text: string, undoTodo?: CreateTodoInput) => {
    const id = Date.now();
    setToast({ id, text, undoTodo });
    window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 5000);
  }, []);

  const loadWorkspace = useCallback(async () => {
    setLoadingTodos(true);
    try {
      const items = await fetchTodos();
      setTodos(items);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuth((prev) => (prev ? { ...prev, authenticated: false, authMethod: null } : prev));
        setTodos([]);
      } else {
        showToast(err instanceof Error ? err.message : '할 일 목록을 불러오지 못했습니다.');
      }
    } finally {
      setLoadingTodos(false);
    }
  }, [showToast]);

  const refreshAuth = useCallback(async () => {
    setLoadingAuth(true);
    try {
      const status = await getAuthStatus();
      setAuth(status);
      if (status.authenticated) {
        await loadWorkspace();
      }
    } catch {
      setAuth({
        authenticated: false,
        configured: false,
        emailOtpReady: false,
        cfAccessEnabled: false,
        authMethod: null,
        userEmail: null,
      });
    } finally {
      setLoadingAuth(false);
    }
  }, [loadWorkspace]);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  useEffect(() => {
    if (!auth?.authenticated) return;
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isTyping || editingTodo) return;

      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        composerRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [auth?.authenticated, editingTodo]);

  const counts = useMemo<Record<SmartView, number>>(() => {
    let today = 0;
    let active = 0;
    let important = 0;
    let done = 0;

    for (const item of todos) {
      if (item.status === 'done') {
        done += 1;
      } else {
        active += 1;
        if (item.pinned || (item.dueDate && item.dueDate <= todayStr)) {
          today += 1;
        }
        if (item.pinned || item.priority === 'high') {
          important += 1;
        }
      }
    }

    return {
      all: todos.length,
      today,
      active,
      important,
      done,
    };
  }, [todos, todayStr]);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of todos) {
      if (!item.category) continue;
      map.set(item.category, (map.get(item.category) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
  }, [todos]);

  const filteredTodos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const matched = todos.filter((item) => {
      if (selectedCategory) {
        if (item.category !== selectedCategory) return false;
      } else {
        if (activeView === 'today') {
          if (item.status === 'done') return false;
          const isDueOrOverdue = Boolean(item.dueDate && item.dueDate <= todayStr);
          if (!item.pinned && !isDueOrOverdue) return false;
        } else if (activeView === 'active') {
          if (item.status === 'done') return false;
        } else if (activeView === 'important') {
          if (item.status === 'done') return false;
          if (!item.pinned && item.priority !== 'high') return false;
        } else if (activeView === 'done') {
          if (item.status !== 'done') return false;
        }
      }

      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.notes.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });

    return [...matched].sort((a, b) => {
      if (activeView !== 'done') {
        const aDone = a.status === 'done' ? 1 : 0;
        const bDone = b.status === 'done' ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
      }
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

      if (sortMode === 'dueDate') {
        if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
          return a.dueDate.localeCompare(b.dueDate);
        }
        if (a.dueDate && !b.dueDate) return -1;
        if (!a.dueDate && b.dueDate) return 1;
      } else if (sortMode === 'priority') {
        const diff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
        if (diff !== 0) return diff;
      }

      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [todos, selectedCategory, activeView, todayStr, searchQuery, sortMode]);

  async function handleCreateTodo(input: CreateTodoInput) {
    try {
      const created = await createTodoApi(input);
      setTodos((prev) => [created, ...prev]);
      showToast('할 일을 추가했습니다.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuth((prev) => (prev ? { ...prev, authenticated: false, authMethod: null } : prev));
        return;
      }
      showToast(err instanceof Error ? err.message : '추가하지 못했습니다.');
    }
  }

  async function handleUpdateTodo(id: string, patch: UpdateTodoInput) {
    try {
      const updated = await updateTodoApi(id, patch);
      setTodos((prev) => prev.map((item) => (item.id === id ? updated : item)));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuth((prev) => (prev ? { ...prev, authenticated: false, authMethod: null } : prev));
        return;
      }
      showToast(err instanceof Error ? err.message : '수정하지 못했습니다.');
    }
  }

  function handleToggleDone(todo: TodoModel) {
    const nextStatus: TodoStatus = todo.status === 'done' ? 'todo' : 'done';
    void handleUpdateTodo(todo.id, { status: nextStatus });
  }

  function handleCycleStatus(todo: TodoModel) {
    const order: TodoStatus[] = ['todo', 'in_progress', 'done'];
    const next = order[(order.indexOf(todo.status) + 1) % order.length];
    void handleUpdateTodo(todo.id, { status: next });
  }

  function handleTogglePin(todo: TodoModel) {
    void handleUpdateTodo(todo.id, { pinned: !todo.pinned });
  }

  async function handleDeleteTodo(todo: TodoModel) {
    setTodos((prev) => prev.filter((item) => item.id !== todo.id));
    try {
      await deleteTodoApi(todo.id);
      showToast(`"${todo.title}" 삭제됨`, {
        title: todo.title,
        notes: todo.notes,
        status: todo.status,
        priority: todo.priority,
        category: todo.category,
        dueDate: todo.dueDate,
        pinned: todo.pinned,
      });
    } catch (err) {
      setTodos((prev) => [todo, ...prev]);
      showToast(err instanceof Error ? err.message : '삭제하지 못했습니다.');
    }
  }

  async function handleClearCompleted() {
    if (counts.done === 0) return;
    try {
      const deletedCount = await clearCompletedApi();
      setTodos((prev) => prev.filter((item) => item.status !== 'done'));
      showToast(`완료된 항목 ${deletedCount}개를 정리했습니다.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '완료 항목 정리에 실패했습니다.');
    }
  }

  function handleExportBackup() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      items: todos.map((item) => ({
        title: item.title,
        notes: item.notes,
        status: item.status,
        priority: item.priority,
        category: item.category,
        dueDate: item.dueDate,
        pinned: item.pinned,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `private-todo-backup-${todayStr}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`${todos.length}개 항목을 JSON으로 백업했습니다.`);
  }

  async function handleImportBackup(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { items?: CreateTodoInput[] } | CreateTodoInput[];
      const items = Array.isArray(parsed) ? parsed : parsed.items;
      if (!Array.isArray(items) || items.length === 0) {
        showToast('가져올 할 일 항목이 없습니다.');
        return;
      }
      const imported = await importTodosApi(items);
      setTodos((prev) => [...imported, ...prev]);
      showToast(`${imported.length}개 항목을 복원했습니다.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '백업 파일을 읽지 못했습니다.');
    }
  }

  async function handleLockNow() {
    try {
      await logoutSession();
    } finally {
      setTodos([]);
      setEditingTodo(null);
      setAuth((prev) => (prev ? { ...prev, authenticated: false, authMethod: null } : prev));
    }
  }

  if (loadingAuth) {
    return (
      <div className="loading-shell">
        <div className="spinner" aria-label="불러오는 중" />
      </div>
    );
  }

  if (!auth?.authenticated) {
    return (
      <LockScreen
        emailOtpReady={Boolean(auth?.emailOtpReady)}
        cfAccessEnabled={Boolean(auth?.cfAccessEnabled)}
        onUnlocked={() => void refreshAuth()}
      />
    );
  }

  const headerInfo = selectedCategory
    ? { title: `# ${selectedCategory}`, subtitle: `'${selectedCategory}' 카테고리의 할 일 목록입니다.` }
    : VIEW_TITLES[activeView];

  return (
    <div className="app-layout">
      <Sidebar
        activeView={activeView}
        selectedCategory={selectedCategory}
        counts={counts}
        totalCount={todos.length}
        doneCount={counts.done}
        categories={categories}
        theme={theme}
        authMethod={auth.authMethod}
        userEmail={auth.userEmail}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onSelectView={setActiveView}
        onSelectCategory={setSelectedCategory}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        onExportBackup={handleExportBackup}
        onImportBackup={(file) => void handleImportBackup(file)}
        onLockNow={() => void handleLockNow()}
      />

      <main className="workspace">
        <header className="workspace-header">
          <div className="header-left">
            <button
              type="button"
              className="icon-btn mobile-only"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="메뉴 열기"
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="workspace-title">{headerInfo.title}</h1>
              <p className="workspace-subtitle">{headerInfo.subtitle}</p>
            </div>
          </div>

          <div className="header-controls">
            <div className="search-box">
              <Search size={15} />
              <input
                ref={searchRef}
                type="text"
                className="search-input"
                placeholder="검색 (단축키 /)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setSearchQuery('')}
                  aria-label="검색어 지우기"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="sort-box">
              <ArrowUpDown size={14} />
              <select
                className="sort-select"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                aria-label="정렬 기준"
              >
                <option value="default">최신순</option>
                <option value="dueDate">마감일순</option>
                <option value="priority">우선순위순</option>
              </select>
            </div>

            {activeView === 'done' && counts.done > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void handleClearCompleted()}
              >
                <CheckCheck size={15} />
                <span>완료 비우기</span>
              </button>
            )}
          </div>
        </header>

        <TodoComposer
          inputRef={composerRef}
          existingCategories={categories.map((c) => c.name)}
          defaultCategory={selectedCategory}
          onCreate={handleCreateTodo}
        />

        <section className="todo-list-section" aria-label="할 일 목록">
          {loadingTodos ? (
            <div className="empty-state">불러오는 중...</div>
          ) : filteredTodos.length === 0 ? (
            <div className="empty-state">
              <Sparkles size={26} />
              <p>
                {searchQuery
                  ? `"${searchQuery}"에 해당하는 할 일이 없습니다.`
                  : '표시할 할 일이 없습니다. 위 입력창에서 새 할 일을 추가해 보세요.'}
              </p>
            </div>
          ) : (
            <div className="todo-list">
              {filteredTodos.map((todo) => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  todayStr={todayStr}
                  onToggleDone={handleToggleDone}
                  onCycleStatus={handleCycleStatus}
                  onTogglePin={handleTogglePin}
                  onEdit={setEditingTodo}
                  onDelete={(item) => void handleDeleteTodo(item)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {editingTodo && (
        <TodoEditModal
          todo={editingTodo}
          existingCategories={categories.map((c) => c.name)}
          onClose={() => setEditingTodo(null)}
          onSave={handleUpdateTodo}
          onDelete={handleDeleteTodo}
        />
      )}

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span>{toast.text}</span>
          {toast.undoTodo && (
            <button
              type="button"
              className="toast-undo"
              onClick={() => {
                const payload = toast.undoTodo!;
                setToast(null);
                void handleCreateTodo(payload);
              }}
            >
              되돌리기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
