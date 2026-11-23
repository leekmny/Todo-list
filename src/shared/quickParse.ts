import type { TodoPriority, TodoRecurrence } from './types';

export interface ParsedQuickTodo {
  title: string;
  priority?: TodoPriority;
  category?: string;
  dueDate?: string;
  reminderAt?: string;
  recurrence?: TodoRecurrence;
  pinned?: boolean;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(base: Date, days: number): string {
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return formatDate(next);
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Parses lightweight Todoist-style Korean/universal tokens from a quick-add line.
 * Examples:
 * - "보고서 제출 #업무 내일 !높음"
 * - "운동하기 매일 #건강 p2"
 * - "세금 신고 2026-12-15 *고정"
 */
export function parseQuickTodoInput(rawInput: string, now = new Date()): ParsedQuickTodo {
  const tokens = rawInput.trim().split(/\s+/).filter(Boolean);
  const titleParts: string[] = [];

  let priority: TodoPriority | undefined;
  let category: string | undefined;
  let dueDate: string | undefined;
  let reminderTime: string | undefined;
  let recurrence: TodoRecurrence | undefined;
  let pinned: boolean | undefined;

  for (const token of tokens) {
    const lower = token.toLowerCase();

    // Reminder time: @09:30 or @21:00
    if (!reminderTime && /^@([01]?\d|2[0-3]):([0-5]\d)$/.test(token)) {
      const match = token.match(/^@(\d{1,2}):(\d{2})$/)!;
      reminderTime = `${match[1].padStart(2, '0')}:${match[2]}`;
      continue;
    }

    // Category: #태그
    if (!category && token.startsWith('#') && token.length > 1) {
      category = token.slice(1).slice(0, 40);
      continue;
    }

    // Priority: !높음 / !보통 / !낮음 / p1 / p2 / p3
    if (!priority) {
      if (token === '!높음' || token === '!중요' || lower === 'p1' || lower === '!high') {
        priority = 'high';
        continue;
      }
      if (token === '!보통' || lower === 'p2' || lower === '!medium') {
        priority = 'medium';
        continue;
      }
      if (token === '!낮음' || lower === 'p3' || lower === '!low') {
        priority = 'low';
        continue;
      }
    }

    // Pin: *고정 / !고정 / @고정
    if (!pinned && (token === '*고정' || token === '!고정' || token === '@고정')) {
      pinned = true;
      continue;
    }

    // Recurrence: 매일 / 매주 / 매월
    if (!recurrence) {
      if (token === '매일' || lower === 'daily') {
        recurrence = 'daily';
        continue;
      }
      if (token === '매주' || lower === 'weekly') {
        recurrence = 'weekly';
        continue;
      }
      if (token === '매월' || token === '매달' || lower === 'monthly') {
        recurrence = 'monthly';
        continue;
      }
    }

    // Relative or explicit dates
    if (!dueDate) {
      if (token === '오늘' || lower === 'today') {
        dueDate = addDays(now, 0);
        continue;
      }
      if (token === '내일' || lower === 'tomorrow') {
        dueDate = addDays(now, 1);
        continue;
      }
      if (token === '모레') {
        dueDate = addDays(now, 2);
        continue;
      }
      if (token === '다음주') {
        dueDate = addDays(now, 7);
        continue;
      }
      if (isValidIsoDate(token)) {
        dueDate = token;
        continue;
      }
    }

    titleParts.push(token);
  }

  if (recurrence && !dueDate) {
    dueDate = addDays(now, 0);
  }

  const reminderAt = reminderTime ? `${dueDate ?? addDays(now, 0)}T${reminderTime}` : undefined;

  return {
    title: titleParts.join(' ').trim() || rawInput.trim(),
    priority,
    category,
    dueDate,
    reminderAt,
    recurrence,
    pinned,
  };
}
