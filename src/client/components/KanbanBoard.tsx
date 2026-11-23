import { useState, type DragEvent, type FormEvent } from 'react';
import { Calendar, ListChecks, Pencil, Pin, Plus, Repeat, Tag, Timer } from 'lucide-react';
import type { CreateTodoInput, TodoItem, TodoStatus } from '../../shared/types';

interface KanbanBoardProps {
  todos: TodoItem[];
  todayStr: string;
  defaultCategory?: string | null;
  focusTodoId?: string | null;
  onChangeStatus: (todo: TodoItem, status: TodoStatus) => void;
  onCreate: (input: CreateTodoInput) => Promise<void>;
  onStartFocus: (todo: TodoItem) => void;
  onEdit: (todo: TodoItem) => void;
}

const COLUMNS: { status: TodoStatus; label: string; dotClass: string }[] = [
  { status: 'todo', label: '할 일', dotClass: 'col-dot-todo' },
  { status: 'in_progress', label: '진행 중', dotClass: 'col-dot-progress' },
  { status: 'done', label: '완료', dotClass: 'col-dot-done' },
];

export function KanbanBoard({
  todos,
  todayStr,
  defaultCategory,
  focusTodoId,
  onChangeStatus,
  onCreate,
  onStartFocus,
  onEdit,
}: KanbanBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<TodoStatus | null>(null);
  const [quickCol, setQuickCol] = useState<TodoStatus | null>(null);
  const [quickTitle, setQuickTitle] = useState('');

  function handleDragOver(event: DragEvent, status: TodoStatus) {
    event.preventDefault();
    if (overStatus !== status) setOverStatus(status);
  }

  function handleDrop(status: TodoStatus) {
    if (draggingId) {
      const target = todos.find((t) => t.id === draggingId);
      if (target && target.status !== status) {
        onChangeStatus(target, status);
      }
    }
    setDraggingId(null);
    setOverStatus(null);
  }

  async function handleQuickAdd(event: FormEvent, status: TodoStatus) {
    event.preventDefault();
    const trimmed = quickTitle.trim();
    if (!trimmed) return;
    await onCreate({
      title: trimmed,
      status,
      category: defaultCategory ?? '',
    });
    setQuickTitle('');
    setQuickCol(null);
  }

  return (
    <div className="kanban-board">
      {COLUMNS.map((col) => {
        const colItems = todos.filter((item) => item.status === col.status);
        return (
          <section
            key={col.status}
            className={`kanban-column ${overStatus === col.status ? 'is-drop-target' : ''}`}
            onDragOver={(e) => handleDragOver(e, col.status)}
            onDragLeave={() => setOverStatus((prev) => (prev === col.status ? null : prev))}
            onDrop={() => handleDrop(col.status)}
          >
            <header className="kanban-column-header">
              <div className="kanban-column-title">
                <span className={`col-dot ${col.dotClass}`} />
                <h2>{col.label}</h2>
              </div>
              <span className="nav-count">{colItems.length}</span>
            </header>

            <div className="kanban-cards">
              {colItems.map((todo) => {
                const isDone = todo.status === 'done';
                const isOverdue = Boolean(todo.dueDate && !isDone && todo.dueDate < todayStr);
                const doneSubtasks = todo.subtasks.filter((s) => s.done).length;

                return (
                  <article
                    key={todo.id}
                    className={`kanban-card ${todo.pinned ? 'is-pinned' : ''} ${
                      focusTodoId === todo.id ? 'is-focusing' : ''
                    }`}
                    draggable
                    onDragStart={() => setDraggingId(todo.id)}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setOverStatus(null);
                    }}
                    onDoubleClick={() => onEdit(todo)}
                  >
                    <div className="kanban-card-top">
                      <span className={`priority-dot priority-dot-${todo.priority}`} />
                      <span className={`kanban-card-title ${isDone ? 'is-done' : ''}`}>
                        {todo.title}
                      </span>
                      {todo.pinned && <Pin size={12} className="pin-indicator" />}
                    </div>

                    {todo.notes && <p className="kanban-card-notes">{todo.notes}</p>}

                    <div className="kanban-card-footer">
                      <div className="kanban-card-badges">
                        {todo.category && (
                          <span className="meta-badge category-badge">
                            <Tag size={10} />
                            {todo.category}
                          </span>
                        )}
                        {todo.dueDate && (
                          <span className={`meta-badge due-badge ${isOverdue ? 'is-overdue' : ''}`}>
                            <Calendar size={10} />
                            {todo.dueDate}
                          </span>
                        )}
                        {todo.recurrence !== 'none' && (
                          <span className="meta-badge recurrence-badge">
                            <Repeat size={10} />
                          </span>
                        )}
                        {todo.subtasks.length > 0 && (
                          <span className="meta-badge subtask-pill">
                            <ListChecks size={10} />
                            {doneSubtasks}/{todo.subtasks.length}
                          </span>
                        )}
                      </div>

                      <div className="kanban-card-actions">
                        {!isDone && (
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => onStartFocus(todo)}
                            title="뽀모도로 집중"
                          >
                            <Timer size={13} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => onEdit(todo)}
                          title="편집"
                        >
                          <Pencil size={13} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}

              {quickCol === col.status ? (
                <form className="kanban-quick-form" onSubmit={(e) => void handleQuickAdd(e, col.status)}>
                  <input
                    type="text"
                    className="input"
                    placeholder="제목 입력 후 Enter..."
                    value={quickTitle}
                    onChange={(e) => setQuickTitle(e.target.value)}
                    autoFocus
                    onBlur={() => {
                      if (!quickTitle.trim()) setQuickCol(null);
                    }}
                  />
                </form>
              ) : (
                <button
                  type="button"
                  className="kanban-add-btn"
                  onClick={() => {
                    setQuickCol(col.status);
                    setQuickTitle('');
                  }}
                >
                  <Plus size={14} />
                  <span>항목 추가</span>
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
