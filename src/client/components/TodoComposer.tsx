import { useState, type FormEvent, type RefObject } from 'react';
import { Calendar, ChevronDown, ChevronUp, Pin, Plus, Tag } from 'lucide-react';
import type { CreateTodoInput, TodoPriority } from '../../shared/types';

interface TodoComposerProps {
  inputRef: RefObject<HTMLInputElement | null>;
  existingCategories: string[];
  defaultCategory?: string | null;
  onCreate: (input: CreateTodoInput) => Promise<void>;
}

function getLocalDateOffset(daysOffset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function TodoComposer({
  inputRef,
  existingCategories,
  defaultCategory,
  onCreate,
}: TodoComposerProps) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<TodoPriority>('medium');
  const [category, setCategory] = useState(defaultCategory ?? '');
  const [dueDate, setDueDate] = useState('');
  const [pinned, setPinned] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || submitting) return;

    setSubmitting(true);
    try {
      await onCreate({
        title: trimmedTitle,
        notes: notes.trim(),
        priority,
        category: (category || defaultCategory || '').trim(),
        dueDate: dueDate || null,
        pinned,
      });
      setTitle('');
      setNotes('');
      setPriority('medium');
      setDueDate('');
      setPinned(false);
      if (!defaultCategory) {
        setCategory('');
      }
      setExpanded(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <div className="composer-main">
        <Plus size={18} className="composer-icon" />
        <input
          ref={inputRef}
          type="text"
          className="composer-input"
          placeholder="새로운 할 일을 입력하세요... (단축키 N)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          disabled={submitting}
        />
        <button
          type="button"
          className="icon-btn"
          onClick={() => setExpanded((prev) => !prev)}
          title={expanded ? '세부 옵션 접기' : '세부 옵션 열기'}
          aria-label={expanded ? '세부 옵션 접기' : '세부 옵션 열기'}
        >
          {expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
        </button>
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={!title.trim() || submitting}
        >
          {submitting ? '추가 중...' : '추가'}
        </button>
      </div>

      {expanded && (
        <div className="composer-details">
          <textarea
            className="textarea"
            rows={2}
            placeholder="메모나 세부 내용을 적어두세요 (선택)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={5000}
          />

          <div className="composer-controls">
            <div className="control-group" role="group" aria-label="우선순위">
              {(['low', 'medium', 'high'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`chip priority-chip priority-${level} ${priority === level ? 'is-selected' : ''}`}
                  onClick={() => setPriority(level)}
                >
                  {level === 'high' ? '높음' : level === 'medium' ? '보통' : '낮음'}
                </button>
              ))}
            </div>

            <div className="control-group">
              <div className="inline-field">
                <Calendar size={14} />
                <input
                  type="date"
                  className="inline-input"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  aria-label="마감일"
                />
              </div>
              <button
                type="button"
                className="chip"
                onClick={() => setDueDate(getLocalDateOffset(0))}
              >
                오늘
              </button>
              <button
                type="button"
                className="chip"
                onClick={() => setDueDate(getLocalDateOffset(1))}
              >
                내일
              </button>
            </div>

            <div className="control-group">
              <div className="inline-field">
                <Tag size={14} />
                <input
                  type="text"
                  className="inline-input category-input"
                  list="todo-category-suggestions"
                  placeholder="카테고리"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  maxLength={40}
                />
                <datalist id="todo-category-suggestions">
                  {existingCategories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>

              <button
                type="button"
                className={`chip ${pinned ? 'is-selected' : ''}`}
                onClick={() => setPinned((prev) => !prev)}
              >
                <Pin size={13} />
                <span>상단 고정</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
