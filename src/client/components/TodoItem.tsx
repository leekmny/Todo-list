import { Calendar, Check, Pencil, Pin, Tag, Trash2 } from 'lucide-react';
import type { TodoItem as TodoModel, TodoStatus } from '../../shared/types';

interface TodoItemProps {
  todo: TodoModel;
  todayStr: string;
  onToggleDone: (todo: TodoModel) => void;
  onCycleStatus: (todo: TodoModel) => void;
  onTogglePin: (todo: TodoModel) => void;
  onEdit: (todo: TodoModel) => void;
  onDelete: (todo: TodoModel) => void;
}

const STATUS_LABELS: Record<TodoStatus, string> = {
  todo: '할 일',
  in_progress: '진행 중',
  done: '완료',
};

const PRIORITY_LABELS = {
  low: '낮음',
  medium: '보통',
  high: '높음',
} as const;

export function TodoItem({
  todo,
  todayStr,
  onToggleDone,
  onCycleStatus,
  onTogglePin,
  onEdit,
  onDelete,
}: TodoItemProps) {
  const isDone = todo.status === 'done';
  const isOverdue = Boolean(todo.dueDate && !isDone && todo.dueDate < todayStr);
  const isDueToday = Boolean(todo.dueDate && !isDone && todo.dueDate === todayStr);

  return (
    <article className={`todo-item ${isDone ? 'is-done' : ''} ${todo.pinned ? 'is-pinned' : ''}`}>
      <button
        type="button"
        className={`todo-checkbox ${isDone ? 'is-checked' : ''}`}
        onClick={() => onToggleDone(todo)}
        aria-label={isDone ? '완료 해제' : '완료 표시'}
      >
        {isDone && <Check size={14} strokeWidth={3} />}
      </button>

      <div className="todo-body" onDoubleClick={() => onEdit(todo)}>
        <div className="todo-title-row">
          <span className="todo-title">{todo.title}</span>
          {todo.pinned && (
            <span className="pin-indicator" title="상단 고정됨">
              <Pin size={12} />
            </span>
          )}
        </div>

        {todo.notes && <p className="todo-notes">{todo.notes}</p>}

        <div className="todo-meta">
          <button
            type="button"
            className={`meta-badge status-badge status-${todo.status}`}
            onClick={() => onCycleStatus(todo)}
            title="클릭하여 상태 변경"
          >
            {STATUS_LABELS[todo.status]}
          </button>

          <span className={`meta-badge priority-badge priority-${todo.priority}`}>
            {PRIORITY_LABELS[todo.priority]}
          </span>

          {todo.category && (
            <span className="meta-badge category-badge">
              <Tag size={11} />
              {todo.category}
            </span>
          )}

          {todo.dueDate && (
            <span
              className={`meta-badge due-badge ${
                isOverdue ? 'is-overdue' : isDueToday ? 'is-today' : ''
              }`}
            >
              <Calendar size={11} />
              {isOverdue ? `지남 · ${todo.dueDate}` : isDueToday ? '오늘 마감' : todo.dueDate}
            </span>
          )}
        </div>
      </div>

      <div className="todo-actions">
        <button
          type="button"
          className={`icon-btn ${todo.pinned ? 'is-highlighted' : ''}`}
          onClick={() => onTogglePin(todo)}
          title={todo.pinned ? '고정 해제' : '상단 고정'}
          aria-label={todo.pinned ? '고정 해제' : '상단 고정'}
        >
          <Pin size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => onEdit(todo)}
          title="편집"
          aria-label="편집"
        >
          <Pencil size={15} />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn-danger"
          onClick={() => onDelete(todo)}
          title="삭제"
          aria-label="삭제"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}
