import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  ArrowUpDown,
  CalendarDays,
  CheckCheck,
  Columns3,
  List,
  Menu,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  AuthStatusResponse,
  CreateTodoInput,
  SubtaskItem,
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
  isDesktopApp,
  isLocalDesktopMode,
  logoutSession,
  reorderTodosApi,
  switchDesktopToLocalApi,
  updateTodoApi,
} from './api';
import { CalendarView } from './components/CalendarView';
import { DesktopSecurityModal } from './components/DesktopSecurityModal';
import { KanbanBoard } from './components/KanbanBoard';
import { LockScreen } from './components/LockScreen';
import { PomodoroWidget } from './components/PomodoroWidget';
import { Sidebar, type SmartView } from './components/Sidebar';
import { TodoComposer } from './components/TodoComposer';
import { TodoEditModal } from './components/TodoEditModal';
import { TodoItem } from './components/TodoItem';

type SortMode = 'default' | 'dueDate' | 'priority';
type DisplayMode = 'list' | 'kanban' | 'calendar';

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
  const [displayMode, setDisplayMode] = useState<DisplayMode>('list');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [editingTodo, setEditingTodo] = useState<TodoModel | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showDesktopSecurity, setShowDesktopSecurity] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const [pomoOpen, setPomoOpen] = useState(false);
  const [focusTodoId, setFocusTodoId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

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

      if (event.key === 'Escape') {
        setShowShortcuts(false);
        return;
      }

      if (isTyping || editingTodo) return;

      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        composerRef.current?.focus();
      } else if (event.key === '1') {
        setDisplayMode('list');
      } else if (event.key === '2') {
        setDisplayMode('kanban');
      } else if (event.key === '3') {
        setDisplayMode('calendar');
      } else if (event.key === '?') {
        event.preventDefault();
        setShowShortcuts((prev) => !prev);
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

  const totalFocusMinutes = useMemo(
    () => todos.reduce((sum, item) => sum + (item.focusMinutes ?? 0), 0),
    [todos]
  );

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
      } else if (displayMode === 'list') {
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
        item.category.toLowerCase().includes(q) ||
        item.subtasks.some((st) => st.title.toLowerCase().includes(q))
      );
    });

    return [...matched].sort((a, b) => {
      if (activeView !== 'done' && displayMode === 'list') {
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
      } else {
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
      }

      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [todos, selectedCategory, activeView, displayMode, todayStr, searchQuery, sortMode]);

  const activeFocusTodo = useMemo(
    () => (focusTodoId ? todos.find((t) => t.id === focusTodoId) ?? null : null),
    [focusTodoId, todos]
  );

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

  const handleUpdateTodo = useCallback(
    async (id: string, patch: UpdateTodoInput) => {
      try {
        const { item: updated, nextItem } = await updateTodoApi(id, patch);
        setTodos((prev) => {
          const replaced = prev.map((item) => (item.id === id ? updated : item));
          return nextItem ? [nextItem, ...replaced] : replaced;
        });
        if (nextItem) {
          showToast(`다음 반복 일정(${nextItem.dueDate ?? '예정'})이 자동 생성되었습니다.`);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setAuth((prev) => (prev ? { ...prev, authenticated: false, authMethod: null } : prev));
          return;
        }
        showToast(err instanceof Error ? err.message : '수정하지 못했습니다.');
      }
    },
    [showToast]
  );

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

  function handleUpdateSubtasks(todo: TodoModel, subtasks: SubtaskItem[]) {
    void handleUpdateTodo(todo.id, { subtasks });
  }

  function handleStartFocus(todo: TodoModel) {
    setFocusTodoId(todo.id);
    setPomoOpen(true);
  }

  const handleCompleteFocusSession = useCallback(
    (todo: TodoModel | null, minutes: number) => {
      if (todo) {
        void handleUpdateTodo(todo.id, { focusMinutes: (todo.focusMinutes ?? 0) + minutes });
        showToast(`"${todo.title}" ${minutes}분 집중 완료!`);
      } else {
        showToast(`${minutes}분 집중 세션을 완료했습니다!`);
      }
    },
    [handleUpdateTodo, showToast]
  );

  function handleDragOverItem(event: DragEvent, targetId: string) {
    event.preventDefault();
    if (dragOverId !== targetId) setDragOverId(targetId);
  }

  async function handleDropReorder(targetId: string) {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }

    const currentOrder = filteredTodos.map((t) => t.id);
    const fromIdx = currentOrder.indexOf(draggingId);
    const toIdx = currentOrder.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }

    const reordered = [...currentOrder];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    const orderMap = new Map(reordered.map((id, idx) => [id, idx + 1]));
    setTodos((prev) =>
      prev.map((item) => (orderMap.has(item.id) ? { ...item, sortOrder: orderMap.get(item.id)! } : item))
    );
    setDraggingId(null);
    setDragOverId(null);

    try {
      await reorderTodosApi(reordered);
    } catch {
      showToast('순서 저장에 실패했습니다.');
    }
  }

  async function handleDeleteTodo(todo: TodoModel) {
    setTodos((prev) => prev.filter((item) => item.id !== todo.id));
    if (focusTodoId === todo.id) setFocusTodoId(null);
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
        subtasks: todo.subtasks,
        recurrence: todo.recurrence,
        focusMinutes: todo.focusMinutes,
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
      version: 2,
      exportedAt: new Date().toISOString(),
      items: todos.map((item) => ({
        title: item.title,
        notes: item.notes,
        status: item.status,
        priority: item.priority,
        category: item.category,
        dueDate: item.dueDate,
        pinned: item.pinned,
        subtasks: item.subtasks,
        recurrence: item.recurrence,
        focusMinutes: item.focusMinutes,
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
      setPomoOpen(false);
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
        desktopMode={Boolean(auth?.desktopMode)}
        localPasscodeEnabled={Boolean(auth?.localPasscodeEnabled)}
        emailOtpReady={Boolean(auth?.emailOtpReady)}
        cfAccessEnabled={Boolean(auth?.cfAccessEnabled)}
        onUnlocked={() => void refreshAuth()}
      />
    );
  }

  const headerInfo = selectedCategory
    ? { title: `# ${selectedCategory}`, subtitle: `'${selectedCategory}' 카테고리의 할 일 목록입니다.` }
    : displayMode === 'kanban'
      ? { title: '칸반 보드', subtitle: '카드를 드래그해서 진행 상태를 바로 옮길 수 있습니다.' }
      : displayMode === 'calendar'
        ? { title: '일정 캘린더', subtitle: '마감일 기준으로 월별 일정을 한눈에 확인합니다.' }
        : VIEW_TITLES[activeView];

  const canDragReorder = displayMode === 'list' && sortMode === 'default' && !searchQuery.trim();

  return (
    <div className="app-layout">
      <Sidebar
        activeView={activeView}
        selectedCategory={selectedCategory}
        counts={counts}
        totalCount={todos.length}
        doneCount={counts.done}
        totalFocusMinutes={totalFocusMinutes}
        categories={categories}
        theme={theme}
        authMethod={auth.authMethod}
        userEmail={auth.userEmail}
        desktopMode={Boolean(auth.desktopMode)}
        localPasscodeEnabled={Boolean(auth.localPasscodeEnabled)}
        isDesktopCloud={isDesktopApp() && !isLocalDesktopMode()}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onSelectView={(view) => {
          setActiveView(view);
          setDisplayMode('list');
        }}
        onSelectCategory={setSelectedCategory}
        onOpenPomodoro={() => setPomoOpen((prev) => !prev)}
        onOpenShortcuts={() => setShowShortcuts(true)}
        onOpenDesktopSecurity={() => setShowDesktopSecurity(true)}
        onSwitchToLocalVault={() => void switchDesktopToLocalApi()}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        onExportBackup={handleExportBackup}
        onImportBackup={(file) => void handleImportBackup(file)}
        onLockNow={() => void handleLockNow()}
      />

      <main className={`workspace ${displayMode !== 'list' ? 'workspace-wide' : ''}`}>
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
            <div className="view-switcher" role="tablist" aria-label="화면 전환">
              <button
                type="button"
                role="tab"
                aria-selected={displayMode === 'list'}
                className={`view-tab ${displayMode === 'list' ? 'is-active' : ''}`}
                onClick={() => setDisplayMode('list')}
                title="리스트 보기 (단축키 1)"
              >
                <List size={14} />
                <span>리스트</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={displayMode === 'kanban'}
                className={`view-tab ${displayMode === 'kanban' ? 'is-active' : ''}`}
                onClick={() => setDisplayMode('kanban')}
                title="칸반 보드 (단축키 2)"
              >
                <Columns3 size={14} />
                <span>칸반</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={displayMode === 'calendar'}
                className={`view-tab ${displayMode === 'calendar' ? 'is-active' : ''}`}
                onClick={() => setDisplayMode('calendar')}
                title="캘린더 보기 (단축키 3)"
              >
                <CalendarDays size={14} />
                <span>캘린더</span>
              </button>
            </div>

            <div className="search-box">
              <Search size={15} />
              <input
                ref={searchRef}
                type="text"
                className="search-input"
                placeholder="검색 (/)"
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

            {displayMode === 'list' && (
              <div className="sort-box">
                <ArrowUpDown size={14} />
                <select
                  className="sort-select"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  aria-label="정렬 기준"
                >
                  <option value="default">직접 정렬</option>
                  <option value="dueDate">마감일순</option>
                  <option value="priority">우선순위순</option>
                </select>
              </div>
            )}

            {displayMode === 'list' && activeView === 'done' && counts.done > 0 && (
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

        {loadingTodos ? (
          <div className="empty-state">불러오는 중...</div>
        ) : displayMode === 'kanban' ? (
          <KanbanBoard
            todos={filteredTodos}
            todayStr={todayStr}
            defaultCategory={selectedCategory}
            focusTodoId={focusTodoId}
            onChangeStatus={(todo, status) => void handleUpdateTodo(todo.id, { status })}
            onCreate={handleCreateTodo}
            onStartFocus={handleStartFocus}
            onEdit={setEditingTodo}
          />
        ) : displayMode === 'calendar' ? (
          <CalendarView
            todos={filteredTodos}
            todayStr={todayStr}
            defaultCategory={selectedCategory}
            onCreate={handleCreateTodo}
            onToggleDone={handleToggleDone}
            onEdit={setEditingTodo}
          />
        ) : (
          <section className="todo-list-section" aria-label="할 일 목록">
            {filteredTodos.length === 0 ? (
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
                    draggable={canDragReorder}
                    isDragOver={dragOverId === todo.id && draggingId !== todo.id}
                    isFocusing={pomoOpen && focusTodoId === todo.id}
                    onDragStart={setDraggingId}
                    onDragOver={handleDragOverItem}
                    onDrop={(id) => void handleDropReorder(id)}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOverId(null);
                    }}
                    onToggleDone={handleToggleDone}
                    onCycleStatus={handleCycleStatus}
                    onTogglePin={handleTogglePin}
                    onUpdateSubtasks={handleUpdateSubtasks}
                    onStartFocus={handleStartFocus}
                    onEdit={setEditingTodo}
                    onDelete={(item) => void handleDeleteTodo(item)}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {pomoOpen && (
        <PomodoroWidget
          activeTodo={activeFocusTodo}
          onCompleteFocusSession={handleCompleteFocusSession}
          onClose={() => setPomoOpen(false)}
        />
      )}

      {editingTodo && (
        <TodoEditModal
          todo={editingTodo}
          existingCategories={categories.map((c) => c.name)}
          onClose={() => setEditingTodo(null)}
          onSave={handleUpdateTodo}
          onDelete={handleDeleteTodo}
        />
      )}

      {showDesktopSecurity && (
        <DesktopSecurityModal
          localPasscodeEnabled={Boolean(auth.localPasscodeEnabled)}
          encryptionLabel={auth.encryptionLabel ?? 'AES-256-GCM 로컬 암호화'}
          onClose={() => setShowDesktopSecurity(false)}
          onChanged={(msg) => {
            showToast(msg);
            void refreshAuth();
          }}
        />
      )}

      {showShortcuts && (
        <div
          className="modal-backdrop"
          onClick={() => setShowShortcuts(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-card shortcuts-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>단축키 · 빠른 자연어 입력</h2>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowShortcuts(false)}
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="shortcuts-section">
              <h3>키보드 단축키</h3>
              <ul className="shortcuts-list">
                <li>
                  <span>새 할 일 입력</span>
                  <kbd>N</kbd>
                </li>
                <li>
                  <span>검색창 이동</span>
                  <kbd>/</kbd>
                </li>
                <li>
                  <span>리스트 / 칸반 / 캘린더 전환</span>
                  <span>
                    <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>
                  </span>
                </li>
                <li>
                  <span>이 도움말 열기</span>
                  <kbd>?</kbd>
                </li>
              </ul>
            </div>

            <div className="shortcuts-section">
              <h3>빠른 자연어 입력 문법</h3>
              <ul className="shortcuts-list">
                <li>
                  <span>카테고리 자동 지정</span>
                  <code>#업무</code>
                </li>
                <li>
                  <span>우선순위 지정</span>
                  <code>!높음 / p1 / p2 / p3</code>
                </li>
                <li>
                  <span>마감일 자동 지정</span>
                  <code>오늘 / 내일 / 모레 / 다음주 / 2026-12-01</code>
                </li>
                <li>
                  <span>반복 일정 설정</span>
                  <code>매일 / 매주 / 매월</code>
                </li>
                <li>
                  <span>상단 고정</span>
                  <code>*고정</code>
                </li>
              </ul>
            </div>
          </div>
        </div>
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
