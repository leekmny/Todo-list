import { useEffect, useState, type FormEvent } from 'react';
import { Bell, Check, Paperclip, Pin, Plus, Timer, Trash2, X } from 'lucide-react';
import type {
  SubtaskItem,
  TodoItem,
  TodoPriority,
  TodoRecurrence,
  TodoStatus,
  UpdateTodoInput,
} from '../../shared/types';
import { AttachmentSection } from './AttachmentSection';

interface TodoEditModalProps {
  todo: TodoItem;
  existingCategories: string[];
  onClose: () => void;
  onSave: (id: string, patch: UpdateTodoInput) => Promise<void>;
  onDelete: (todo: TodoItem) => Promise<void>;
  onUploadAttachment: (todoId: string, file: File) => Promise<void>;
  onDeleteAttachment: (todoId: string, attachmentId: string) => Promise<void>;
}

function formatLocalDateTime(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

export function TodoEditModal({
  todo,
  existingCategories,
  onClose,
  onSave,
  onDelete,
  onUploadAttachment,
  onDeleteAttachment,
}: TodoEditModalProps) {
  const [title, setTitle] = useState(todo.title);
  const [notes, setNotes] = useState(todo.notes);
  const [status, setStatus] = useState<TodoStatus>(todo.status);
  const [priority, setPriority] = useState<TodoPriority>(todo.priority);
  const [category, setCategory] = useState(todo.category);
  const [dueDate, setDueDate] = useState(todo.dueDate ?? '');
  const [reminderAt, setReminderAt] = useState(todo.reminderAt ?? '');
  const [recurrence, setRecurrence] = useState<TodoRecurrence>(todo.recurrence ?? 'none');
  const [pinned, setPinned] = useState(todo.pinned);
  const [subtasks, setSubtasks] = useState<SubtaskItem[]>(todo.subtasks ?? []);
  const [newSubtask, setNewSubtask] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function handleAddSubtask() {
    const trimmed = newSubtask.trim();
    if (!trimmed) return;
    setSubtasks((prev) => [...prev, { id: crypto.randomUUID(), title: trimmed, done: false }]);
    setNewSubtask('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    try {
      await onSave(todo.id, {
        title: trimmed,
        notes: notes.trim(),
        status,
        priority,
        category: category.trim(),
        dueDate: dueDate || null,
        reminderAt: reminderAt || null,
        recurrence,
        pinned,
        subtasks,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (saving) return;
    setSaving(true);
    try {
      await onDelete(todo);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>할 일 편집</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="edit-title">제목</label>
            <input
              id="edit-title"
              type="text"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="edit-notes">메모</label>
            <textarea
              id="edit-notes"
              className="textarea"
              rows={4}
              placeholder="세부 계획이나 메모를 기록하세요"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={5000}
            />
          </div>

          <div className="field">
            <label>하위 체크리스트 ({subtasks.filter((s) => s.done).length}/{subtasks.length})</label>
            {subtasks.length > 0 && (
              <ul className="subtask-list modal-subtask-list">
                {subtasks.map((st) => (
                  <li key={st.id} className={`subtask-row ${st.done ? 'is-done' : ''}`}>
                    <button
                      type="button"
                      className={`subtask-check ${st.done ? 'is-checked' : ''}`}
                      onClick={() =>
                        setSubtasks((prev) =>
                          prev.map((item) =>
                            item.id === st.id ? { ...item, done: !item.done } : item
                          )
                        )
                      }
                    >
                      {st.done && <Check size={10} strokeWidth={3} />}
                    </button>
                    <span className="subtask-title">{st.title}</span>
                    <button
                      type="button"
                      className="subtask-remove"
                      onClick={() => setSubtasks((prev) => prev.filter((item) => item.id !== st.id))}
                    >
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="modal-subtask-input-row">
              <input
                type="text"
                className="input"
                placeholder="하위 항목 입력 후 추가"
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubtask();
                  }
                }}
                maxLength={140}
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleAddSubtask}
                disabled={!newSubtask.trim()}
              >
                <Plus size={14} />
                <span>추가</span>
              </button>
            </div>
          </div>

          <div className="field">
            <label>
              <Paperclip size={12} style={{ verticalAlign: '-1px', marginRight: 4 }} />
              첨부 파일 ({todo.attachments?.length ?? 0}/5)
            </label>
            <AttachmentSection
              todoId={todo.id}
              attachments={todo.attachments ?? []}
              onUpload={onUploadAttachment}
              onDelete={onDeleteAttachment}
            />
          </div>

          <div className="field-grid">
            <div className="field">
              <label htmlFor="edit-status">상태</label>
              <select
                id="edit-status"
                className="input"
                value={status}
                onChange={(e) => setStatus(e.target.value as TodoStatus)}
              >
                <option value="todo">할 일</option>
                <option value="in_progress">진행 중</option>
                <option value="done">완료</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="edit-priority">우선순위</label>
              <select
                id="edit-priority"
                className="input"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TodoPriority)}
              >
                <option value="high">높음</option>
                <option value="medium">보통</option>
                <option value="low">낮음</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="edit-due-date">마감일</label>
              <input
                id="edit-due-date"
                type="date"
                className="input"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="edit-recurrence">반복 주기</label>
              <select
                id="edit-recurrence"
                className="input"
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as TodoRecurrence)}
              >
                <option value="none">반복 없음</option>
                <option value="daily">매일</option>
                <option value="weekly">매주</option>
                <option value="monthly">매월</option>
              </select>
            </div>

            <div className="field field-span-2">
              <label htmlFor="edit-reminder">
                <Bell size={12} style={{ verticalAlign: '-1px', marginRight: 4 }} />
                알람 예약
              </label>
              <input
                id="edit-reminder"
                type="datetime-local"
                className="input"
                value={reminderAt}
                onChange={(e) => setReminderAt(e.target.value)}
              />
              <div className="control-group" style={{ marginTop: 4 }}>
                <button
                  type="button"
                  className="chip"
                  onClick={() => setReminderAt(formatLocalDateTime(new Date(Date.now() + 30 * 60 * 1000)))}
                >
                  30분 뒤
                </button>
                <button
                  type="button"
                  className="chip"
                  onClick={() => setReminderAt(formatLocalDateTime(new Date(Date.now() + 60 * 60 * 1000)))}
                >
                  1시간 뒤
                </button>
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    const d = new Date();
                    d.setHours(21, 0, 0, 0);
                    setReminderAt(formatLocalDateTime(d));
                  }}
                >
                  오늘 21:00
                </button>
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 1);
                    d.setHours(9, 0, 0, 0);
                    setReminderAt(formatLocalDateTime(d));
                  }}
                >
                  내일 09:00
                </button>
                {reminderAt && (
                  <button type="button" className="chip" onClick={() => setReminderAt('')}>
                    알람 해제
                  </button>
                )}
              </div>
            </div>

            <div className="field field-span-2">
              <label htmlFor="edit-category">카테고리</label>
              <input
                id="edit-category"
                type="text"
                className="input"
                list="edit-category-suggestions"
                placeholder="예: 개인, 업무, 아이디어"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                maxLength={40}
              />
              <datalist id="edit-category-suggestions">
                {existingCategories.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="modal-toggle-row">
            <button
              type="button"
              className={`chip ${pinned ? 'is-selected' : ''}`}
              onClick={() => setPinned((prev) => !prev)}
            >
              <Pin size={14} />
              <span>{pinned ? '상단 고정됨' : '상단 고정'}</span>
            </button>
            <div className="modal-timestamp-group">
              {todo.focusMinutes > 0 && (
                <span className="modal-timestamp">
                  <Timer size={12} /> 집중 {todo.focusMinutes}분
                </span>
              )}
              <span className="modal-timestamp">
                생성 {new Date(todo.createdAt).toLocaleDateString('ko-KR')}
              </span>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-danger-ghost"
              onClick={handleDelete}
              disabled={saving}
            >
              <Trash2 size={15} />
              <span>삭제</span>
            </button>

            <div className="modal-footer-right">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                취소
              </button>
              <button type="submit" className="btn btn-primary" disabled={!title.trim() || saving}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
