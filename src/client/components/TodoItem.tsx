import { useState, type DragEvent, type FormEvent } from 'react';
import {
  Bell,
  Calendar,
  Check,
  GripVertical,
  ListChecks,
  Pause,
  Pencil,
  Pin,
  Play,
  Plus,
  Repeat,
  Tag,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import type {
  SubtaskItem,
  TodoItem as TodoModel,
  TodoRecurrence,
  TodoStatus,
} from '../../shared/types';

interface TodoItemProps {
  todo: TodoModel;
  todayStr: string;
  draggable?: boolean;
  isDragOver?: boolean;
  isFocusing?: boolean;
  onDragStart?: (id: string) => void;
  onDragOver?: (event: DragEvent, id: string) => void;
  onDrop?: (id: string) => void;
  onDragEnd?: () => void;
  onToggleDone: (todo: TodoModel) => void;
  onToggleInProgress: (todo: TodoModel) => void;
  onCycleStatus: (todo: TodoModel) => void;
  onTogglePin: (todo: TodoModel) => void;
  onUpdateSubtasks: (todo: TodoModel, subtasks: SubtaskItem[]) => void;
  onStartFocus: (todo: TodoModel) => void;
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

const RECURRENCE_LABELS: Record<TodoRecurrence, string> = {
  none: '',
  daily: '매일',
  weekly: '매주',
  monthly: '매월',
};

function formatReminderShort(reminderAt: string): string {
  return reminderAt.replace('T', ' ').slice(5);
}

export function TodoItem({
  todo,
  todayStr,
  draggable = false,
  isDragOver = false,
  isFocusing = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onToggleDone,
  onToggleInProgress,
  onCycleStatus,
  onTogglePin,
  onUpdateSubtasks,
  onStartFocus,
  onEdit,
  onDelete,
}: TodoItemProps) {
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const isDone = todo.status === 'done';
  const isInProgress = todo.status === 'in_progress';
  const isOverdue = Boolean(todo.dueDate && !isDone && todo.dueDate < todayStr);
  const isDueToday = Boolean(todo.dueDate && !isDone && todo.dueDate === todayStr);
  const subtasks = todo.subtasks ?? [];
  const completedSubtasks = subtasks.filter((s) => s.done).length;

  function handleAddSubtask(event: FormEvent) {
    event.preventDefault();
    const trimmed = newSubtaskTitle.trim();
    if (!trimmed) return;
    const next: SubtaskItem[] = [
      ...subtasks,
      { id: crypto.randomUUID(), title: trimmed, done: false },
    ];
    onUpdateSubtasks(todo, next);
    setNewSubtaskTitle('');
  }

  function handleToggleSubtask(subtaskId: string) {
    const next = subtasks.map((st) => (st.id === subtaskId ? { ...st, done: !st.done } : st));
    onUpdateSubtasks(todo, next);
  }

  function handleRemoveSubtask(subtaskId: string) {
    const next = subtasks.filter((st) => st.id !== subtaskId);
    onUpdateSubtasks(todo, next);
  }

  return (
    <article
      className={`todo-item ${isDone ? 'is-done' : ''} ${isInProgress ? 'is-in-progress' : ''} ${
        todo.pinned ? 'is-pinned' : ''
      } ${isDragOver ? 'is-drag-over' : ''} ${isFocusing ? 'is-focusing' : ''}`}
      draggable={draggable}
      onDragStart={() => onDragStart?.(todo.id)}
      onDragOver={(e) => onDragOver?.(e, todo.id)}
      onDrop={() => onDrop?.(todo.id)}
      onDragEnd={() => onDragEnd?.()}
    >
      {draggable && (
        <span className="drag-handle" title="드래그하여 순서 변경" aria-hidden="true">
          <GripVertical size={15} />
        </span>
      )}

      <button
        type="button"
        className={`todo-checkbox ${isDone ? 'is-checked' : ''}`}
        onClick={() => onToggleDone(todo)}
        aria-label={isDone ? '완료 해제' : '완료 표시'}
      >
        {isDone && <Check size={14} strokeWidth={3} />}
      </button>

      <div className="todo-body">
        <div className="todo-title-row" onDoubleClick={() => onEdit(todo)}>
          {isInProgress && (
            <span className="live-badge" title="현재 진행 중인 작업">
              <span className="live-dot" />
              진행 중
            </span>
          )}
          <span className="todo-title">{todo.title}</span>
          {todo.pinned && (
            <span className="pin-indicator" title="상단 고정됨">
              <Pin size={12} />
            </span>
          )}
        </div>

        {todo.notes && (
          <p className="todo-notes" onDoubleClick={() => onEdit(todo)}>
            {todo.notes}
          </p>
        )}

        <div className="todo-meta">
          <button
            type="button"
            className={`meta-badge status-badge status-${todo.status}`}
            onClick={() => onCycleStatus(todo)}
            title="클릭하여 상태 변경 (할 일 → 진행 중 → 완료)"
          >
            {isInProgress && <span className="live-dot live-dot-sm" />}
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

          {todo.reminderAt && !isDone && (
            <span className="meta-badge reminder-badge" title={`알람 예약: ${todo.reminderAt}`}>
              <Bell size={11} />
              {formatReminderShort(todo.reminderAt)}
            </span>
          )}

          {todo.recurrence !== 'none' && (
            <span className="meta-badge recurrence-badge" title="완료 시 다음 일정 자동 생성">
              <Repeat size={11} />
              {RECURRENCE_LABELS[todo.recurrence]}
            </span>
          )}

          {subtasks.length > 0 && (
            <button
              type="button"
              className="meta-badge subtask-pill"
              onClick={() => setShowSubtasks((prev) => !prev)}
              title="하위 체크리스트 열기/접기"
            >
              <ListChecks size={11} />
              <span>
                {completedSubtasks}/{subtasks.length}
              </span>
            </button>
          )}

          {todo.focusMinutes > 0 && (
            <span className="meta-badge focus-badge" title="누적 뽀모도로 집중 시간">
              <Timer size={11} />
              {todo.focusMinutes}분
            </span>
          )}
        </div>

        {showSubtasks && (
          <div className="subtask-drawer">
            {subtasks.length > 0 && (
              <ul className="subtask-list">
                {subtasks.map((subtask) => (
                  <li key={subtask.id} className={`subtask-row ${subtask.done ? 'is-done' : ''}`}>
                    <button
                      type="button"
                      className={`subtask-check ${subtask.done ? 'is-checked' : ''}`}
                      onClick={() => handleToggleSubtask(subtask.id)}
                      aria-label={subtask.done ? '하위 할 일 완료 해제' : '하위 할 일 완료'}
                    >
                      {subtask.done && <Check size={10} strokeWidth={3} />}
                    </button>
                    <span className="subtask-title">{subtask.title}</span>
                    <button
                      type="button"
                      className="subtask-remove"
                      onClick={() => handleRemoveSubtask(subtask.id)}
                      aria-label="하위 할 일 삭제"
                    >
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form className="subtask-add-form" onSubmit={handleAddSubtask}>
              <Plus size={13} />
              <input
                type="text"
                className="subtask-add-input"
                placeholder="하위 체크리스트 추가 후 Enter..."
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                maxLength={140}
              />
            </form>
          </div>
        )}
      </div>

      <div className="todo-actions">
        {!isDone && (
          <button
            type="button"
            className={`icon-btn ${isInProgress ? 'is-live-active' : ''}`}
            onClick={() => onToggleInProgress(todo)}
            title={isInProgress ? '진행 중 해제 (할 일로)' : '진행 중으로 표시'}
            aria-label={isInProgress ? '진행 중 해제' : '진행 중으로 표시'}
          >
            {isInProgress ? <Pause size={15} /> : <Play size={15} />}
          </button>
        )}
        <button
          type="button"
          className={`icon-btn ${showSubtasks ? 'is-highlighted' : ''}`}
          onClick={() => setShowSubtasks((prev) => !prev)}
          title="하위 체크리스트"
          aria-label="하위 체크리스트"
        >
          <ListChecks size={15} />
        </button>
        {!isDone && (
          <button
            type="button"
            className={`icon-btn ${isFocusing ? 'is-highlighted' : ''}`}
            onClick={() => onStartFocus(todo)}
            title="뽀모도로 집중 시작"
            aria-label="뽀모도로 집중 시작"
          >
            <Timer size={15} />
          </button>
        )}
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
          title="편집 / 알람 설정"
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
