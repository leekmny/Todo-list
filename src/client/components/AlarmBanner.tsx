import { BellRing, Check, Clock, Play, X } from 'lucide-react';
import type { TodoItem } from '../../shared/types';

interface AlarmBannerProps {
  todos: TodoItem[];
  onComplete: (todo: TodoItem) => void;
  onStartProgress: (todo: TodoItem) => void;
  onSnooze: (todo: TodoItem, minutes: number) => void;
  onDismiss: (todo: TodoItem) => void;
}

function formatReminderLabel(reminderAt: string | null): string {
  if (!reminderAt) return '';
  return reminderAt.replace('T', ' ').slice(5);
}

export function AlarmBanner({
  todos,
  onComplete,
  onStartProgress,
  onSnooze,
  onDismiss,
}: AlarmBannerProps) {
  if (todos.length === 0) return null;

  return (
    <div className="alarm-stack" role="alert" aria-live="assertive">
      {todos.map((todo) => (
        <div key={todo.id} className="alarm-card">
          <div className="alarm-card-top">
            <div className="alarm-title-row">
              <span className="alarm-icon">
                <BellRing size={16} />
              </span>
              <div>
                <div className="alarm-label">예약된 알람 · {formatReminderLabel(todo.reminderAt)}</div>
                <div className="alarm-todo-title">{todo.title}</div>
              </div>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => onDismiss(todo)}
              aria-label="알람 닫기"
            >
              <X size={15} />
            </button>
          </div>

          <div className="alarm-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onComplete(todo)}
            >
              <Check size={13} />
              <span>완료</span>
            </button>
            {todo.status !== 'in_progress' && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onStartProgress(todo)}
              >
                <Play size={12} />
                <span>진행 중</span>
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onSnooze(todo, 10)}
            >
              <Clock size={12} />
              <span>10분 뒤</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onSnooze(todo, 30)}
            >
              <span>30분 뒤</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
