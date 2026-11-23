import { useEffect, useState, type FormEvent } from 'react';
import { Pin, Trash2, X } from 'lucide-react';
import type { TodoItem, TodoPriority, TodoStatus, UpdateTodoInput } from '../../shared/types';

interface TodoEditModalProps {
  todo: TodoItem;
  existingCategories: string[];
  onClose: () => void;
  onSave: (id: string, patch: UpdateTodoInput) => Promise<void>;
  onDelete: (todo: TodoItem) => Promise<void>;
}

export function TodoEditModal({
  todo,
  existingCategories,
  onClose,
  onSave,
  onDelete,
}: TodoEditModalProps) {
  const [title, setTitle] = useState(todo.title);
  const [notes, setNotes] = useState(todo.notes);
  const [status, setStatus] = useState<TodoStatus>(todo.status);
  const [priority, setPriority] = useState<TodoPriority>(todo.priority);
  const [category, setCategory] = useState(todo.category);
  const [dueDate, setDueDate] = useState(todo.dueDate ?? '');
  const [pinned, setPinned] = useState(todo.pinned);
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
        pinned,
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
              rows={5}
              placeholder="세부 계획이나 메모를 기록하세요"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={5000}
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
            <span className="modal-timestamp">
              생성 {new Date(todo.createdAt).toLocaleDateString('ko-KR')}
            </span>
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
