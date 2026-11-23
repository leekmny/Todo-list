import { useMemo, useState, type FormEvent, type RefObject } from 'react';
import { Calendar, ChevronDown, ChevronUp, Pin, Plus, Repeat, Sparkles, Tag } from 'lucide-react';
import { parseQuickTodoInput } from '../../shared/quickParse';
import type { CreateTodoInput, TodoPriority, TodoRecurrence } from '../../shared/types';

interface TodoComposerProps {
  inputRef: RefObject<HTMLInputElement | null>;
  existingCategories: string[];
  defaultCategory?: string | null;
  onCreate: (input: CreateTodoInput) => Promise<void>;
}

const RECURRENCE_LABELS: Record<TodoRecurrence, string> = {
  none: '반복 없음',
  daily: '매일',
  weekly: '매주',
  monthly: '매월',
};

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
  const [priorityTouched, setPriorityTouched] = useState(false);
  const [category, setCategory] = useState(defaultCategory ?? '');
  const [dueDate, setDueDate] = useState('');
  const [recurrence, setRecurrence] = useState<TodoRecurrence>('none');
  const [pinned, setPinned] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const parsedPreview = useMemo(() => {
    if (!title.trim()) return null;
    const parsed = parseQuickTodoInput(title);
    const hasTokens = Boolean(
      parsed.category || parsed.priority || parsed.dueDate || parsed.recurrence || parsed.pinned
    );
    return hasTokens ? parsed : null;
  }, [title]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const rawTitle = title.trim();
    if (!rawTitle || submitting) return;

    const parsed = parseQuickTodoInput(rawTitle);
    const finalTitle = parsed.title || rawTitle;
    const finalPriority = priorityTouched ? priority : parsed.priority ?? priority;
    const finalCategory = (category.trim() || parsed.category || defaultCategory || '').trim();
    const finalDueDate = dueDate || parsed.dueDate || null;
    const finalRecurrence = recurrence !== 'none' ? recurrence : parsed.recurrence ?? 'none';
    const finalPinned = pinned || Boolean(parsed.pinned);

    setSubmitting(true);
    try {
      await onCreate({
        title: finalTitle,
        notes: notes.trim(),
        priority: finalPriority,
        category: finalCategory,
        dueDate: finalDueDate,
        recurrence: finalRecurrence,
        pinned: finalPinned,
      });
      setTitle('');
      setNotes('');
      setPriority('medium');
      setPriorityTouched(false);
      setDueDate('');
      setRecurrence('none');
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
          placeholder="할 일 입력... (예: 운동하기 매일 #건강 내일 !높음)"
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

      {parsedPreview && (
        <div className="nlp-preview" aria-label="자동 인식된 속성">
          <Sparkles size={12} />
          <span>자동 인식:</span>
          {parsedPreview.category && <span className="nlp-chip">#{parsedPreview.category}</span>}
          {parsedPreview.priority && (
            <span className="nlp-chip">
              우선순위 {parsedPreview.priority === 'high' ? '높음' : parsedPreview.priority === 'medium' ? '보통' : '낮음'}
            </span>
          )}
          {parsedPreview.dueDate && <span className="nlp-chip">마감 {parsedPreview.dueDate}</span>}
          {parsedPreview.recurrence && (
            <span className="nlp-chip">{RECURRENCE_LABELS[parsedPreview.recurrence]} 반복</span>
          )}
          {parsedPreview.pinned && <span className="nlp-chip">상단 고정</span>}
        </div>
      )}

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
                  onClick={() => {
                    setPriority(level);
                    setPriorityTouched(true);
                  }}
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
                <Repeat size={13} />
                <select
                  className="inline-input inline-select"
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value as TodoRecurrence)}
                  aria-label="반복 주기"
                >
                  <option value="none">반복 없음</option>
                  <option value="daily">매일</option>
                  <option value="weekly">매주</option>
                  <option value="monthly">매월</option>
                </select>
              </div>

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
