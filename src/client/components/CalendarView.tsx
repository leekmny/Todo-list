import { useMemo, useState, type FormEvent } from 'react';
import { Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { CreateTodoInput, TodoItem } from '../../shared/types';

interface CalendarViewProps {
  todos: TodoItem[];
  todayStr: string;
  defaultCategory?: string | null;
  onCreate: (input: CreateTodoInput) => Promise<void>;
  onToggleDone: (todo: TodoItem) => void;
  onEdit: (todo: TodoItem) => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function formatDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function CalendarView({
  todos,
  todayStr,
  defaultCategory,
  onCreate,
  onToggleDone,
  onEdit,
}: CalendarViewProps) {
  const [year, month] = todayStr.split('-').map(Number);
  const [currentMonth, setCurrentMonth] = useState({ year, monthIndex: month - 1 });
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [quickTitle, setQuickTitle] = useState('');

  const todosByDate = useMemo(() => {
    const map = new Map<string, TodoItem[]>();
    for (const item of todos) {
      if (!item.dueDate) continue;
      const list = map.get(item.dueDate) ?? [];
      list.push(item);
      map.set(item.dueDate, list);
    }
    return map;
  }, [todos]);

  const unscheduled = useMemo(
    () => todos.filter((item) => !item.dueDate && item.status !== 'done'),
    [todos]
  );

  const cells = useMemo(() => {
    const firstDayOfWeek = new Date(currentMonth.year, currentMonth.monthIndex, 1).getDay();
    const daysInMonth = new Date(currentMonth.year, currentMonth.monthIndex + 1, 0).getDate();
    const result: Array<{ dateKey: string | null; day: number | null }> = [];

    for (let i = 0; i < firstDayOfWeek; i += 1) {
      result.push({ dateKey: null, day: null });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      result.push({
        dateKey: formatDateKey(currentMonth.year, currentMonth.monthIndex, day),
        day,
      });
    }
    while (result.length % 7 !== 0) {
      result.push({ dateKey: null, day: null });
    }
    return result;
  }, [currentMonth]);

  const selectedTodos = todosByDate.get(selectedDate) ?? [];

  function shiftMonth(delta: number) {
    setCurrentMonth((prev) => {
      const next = new Date(prev.year, prev.monthIndex + delta, 1);
      return { year: next.getFullYear(), monthIndex: next.getMonth() };
    });
  }

  async function handleQuickAdd(event: FormEvent) {
    event.preventDefault();
    const trimmed = quickTitle.trim();
    if (!trimmed) return;
    await onCreate({
      title: trimmed,
      dueDate: selectedDate,
      category: defaultCategory ?? '',
    });
    setQuickTitle('');
  }

  return (
    <div className="calendar-layout">
      <div className="calendar-card">
        <div className="calendar-toolbar">
          <h2 className="calendar-month-title">
            {currentMonth.year}년 {currentMonth.monthIndex + 1}월
          </h2>
          <div className="calendar-nav">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setCurrentMonth({ year, monthIndex: month - 1 });
                setSelectedDate(todayStr);
              }}
            >
              오늘
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => shiftMonth(-1)}
              aria-label="이전 달"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => shiftMonth(1)}
              aria-label="다음 달"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="calendar-weekdays">
          {WEEKDAYS.map((day) => (
            <div key={day} className="calendar-weekday">
              {day}
            </div>
          ))}
        </div>

        <div className="calendar-grid">
          {cells.map((cell, index) => {
            if (!cell.dateKey || cell.day === null) {
              return <div key={`empty-${index}`} className="calendar-cell is-empty" />;
            }
            const dayItems = todosByDate.get(cell.dateKey) ?? [];
            const isToday = cell.dateKey === todayStr;
            const isSelected = cell.dateKey === selectedDate;

            return (
              <button
                key={cell.dateKey}
                type="button"
                className={`calendar-cell ${isToday ? 'is-today' : ''} ${
                  isSelected ? 'is-selected' : ''
                }`}
                onClick={() => setSelectedDate(cell.dateKey!)}
              >
                <span className="calendar-day-num">{cell.day}</span>
                <div className="calendar-day-items">
                  {dayItems.slice(0, 2).map((item) => (
                    <span
                      key={item.id}
                      className={`calendar-pill priority-${item.priority} ${
                        item.status === 'done' ? 'is-done' : ''
                      }`}
                    >
                      {item.title}
                    </span>
                  ))}
                  {dayItems.length > 2 && (
                    <span className="calendar-more">+{dayItems.length - 2}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <aside className="calendar-agenda">
        <div className="agenda-header">
          <h3>{selectedDate} 일정</h3>
          <span className="nav-count">{selectedTodos.length}</span>
        </div>

        <form className="agenda-quick-add" onSubmit={(e) => void handleQuickAdd(e)}>
          <input
            type="text"
            className="input"
            placeholder="이 날짜에 할 일 추가..."
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            maxLength={200}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!quickTitle.trim()}>
            <Plus size={14} />
          </button>
        </form>

        {selectedTodos.length === 0 ? (
          <p className="agenda-empty">선택한 날짜에 마감 예정인 할 일이 없습니다.</p>
        ) : (
          <ul className="agenda-list">
            {selectedTodos.map((item) => (
              <li key={item.id} className={`agenda-item ${item.status === 'done' ? 'is-done' : ''}`}>
                <button
                  type="button"
                  className={`todo-checkbox ${item.status === 'done' ? 'is-checked' : ''}`}
                  onClick={() => onToggleDone(item)}
                >
                  {item.status === 'done' && <Check size={12} strokeWidth={3} />}
                </button>
                <button type="button" className="agenda-item-btn" onClick={() => onEdit(item)}>
                  <span>{item.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {unscheduled.length > 0 && (
          <div className="agenda-unscheduled">
            <div className="agenda-subheader">마감일 미지정 ({unscheduled.length})</div>
            <ul className="agenda-list">
              {unscheduled.slice(0, 6).map((item) => (
                <li key={item.id} className="agenda-item">
                  <button type="button" className="agenda-item-btn" onClick={() => onEdit(item)}>
                    <span>{item.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
