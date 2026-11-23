import {
  TODO_LIMITS,
  TODO_PRIORITIES,
  TODO_RECURRENCES,
  TODO_STATUSES,
  type CreateTodoInput,
  type SubtaskItem,
  type TodoPriority,
  type TodoRecurrence,
  type TodoStatus,
  type UpdateTodoInput,
} from '../shared/types';

export interface ValidationResult<T> {
  ok: true;
  data: T;
}

export interface ValidationError {
  ok: false;
  error: string;
}

export type Validated<T> = ValidationResult<T> | ValidationError;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

function isStatus(value: unknown): value is TodoStatus {
  return typeof value === 'string' && (TODO_STATUSES as readonly string[]).includes(value);
}

function isPriority(value: unknown): value is TodoPriority {
  return typeof value === 'string' && (TODO_PRIORITIES as readonly string[]).includes(value);
}

function isRecurrence(value: unknown): value is TodoRecurrence {
  return typeof value === 'string' && (TODO_RECURRENCES as readonly string[]).includes(value);
}

function validateSubtasks(raw: unknown): Validated<SubtaskItem[]> {
  if (!Array.isArray(raw)) {
    return { ok: false, error: '하위 할 일은 배열 형식이어야 합니다.' };
  }
  if (raw.length > TODO_LIMITS.MAX_SUBTASKS) {
    return { ok: false, error: `하위 할 일은 최대 ${TODO_LIMITS.MAX_SUBTASKS}개까지 가능합니다.` };
  }
  const items: SubtaskItem[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const entry = raw[i];
    if (!entry || typeof entry !== 'object') {
      return { ok: false, error: '하위 할 일 형식이 올바르지 않습니다.' };
    }
    const obj = entry as Record<string, unknown>;
    if (typeof obj.title !== 'string') {
      return { ok: false, error: '하위 할 일 제목을 입력해 주세요.' };
    }
    const title = obj.title.trim();
    if (!title || title.length > TODO_LIMITS.MAX_SUBTASK_TITLE_LENGTH) {
      return {
        ok: false,
        error: `하위 할 일 제목은 1~${TODO_LIMITS.MAX_SUBTASK_TITLE_LENGTH}자여야 합니다.`,
      };
    }
    const id =
      typeof obj.id === 'string' && obj.id.trim().length > 0 && obj.id.length <= 64
        ? obj.id.trim()
        : crypto.randomUUID();
    const done = Boolean(obj.done);
    items.push({ id, title, done });
  }
  return { ok: true, data: items };
}

export function validateCreateTodo(body: unknown): Validated<CreateTodoInput> {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: '요청 본문이 올바르지 않습니다.' };
  }

  const raw = body as Record<string, unknown>;

  if (typeof raw.title !== 'string') {
    return { ok: false, error: '할 일 제목을 입력해 주세요.' };
  }
  const title = raw.title.trim();
  if (!title) {
    return { ok: false, error: '할 일 제목은 비워둘 수 없습니다.' };
  }
  if (title.length > TODO_LIMITS.MAX_TITLE_LENGTH) {
    return { ok: false, error: `제목은 ${TODO_LIMITS.MAX_TITLE_LENGTH}자 이하로 입력해 주세요.` };
  }

  let notes = '';
  if (raw.notes !== undefined) {
    if (typeof raw.notes !== 'string') {
      return { ok: false, error: '메모 형식이 올바르지 않습니다.' };
    }
    notes = raw.notes.trim();
    if (notes.length > TODO_LIMITS.MAX_NOTES_LENGTH) {
      return { ok: false, error: `메모는 ${TODO_LIMITS.MAX_NOTES_LENGTH}자 이하로 입력해 주세요.` };
    }
  }

  let status: TodoStatus = 'todo';
  if (raw.status !== undefined) {
    if (!isStatus(raw.status)) {
      return { ok: false, error: '상태 값이 올바르지 않습니다.' };
    }
    status = raw.status;
  }

  let priority: TodoPriority = 'medium';
  if (raw.priority !== undefined) {
    if (!isPriority(raw.priority)) {
      return { ok: false, error: '우선순위 값이 올바르지 않습니다.' };
    }
    priority = raw.priority;
  }

  let category = '';
  if (raw.category !== undefined) {
    if (typeof raw.category !== 'string') {
      return { ok: false, error: '카테고리 형식이 올바르지 않습니다.' };
    }
    category = raw.category.trim();
    if (category.length > TODO_LIMITS.MAX_CATEGORY_LENGTH) {
      return {
        ok: false,
        error: `카테고리는 ${TODO_LIMITS.MAX_CATEGORY_LENGTH}자 이하로 입력해 주세요.`,
      };
    }
  }

  let dueDate: string | null = null;
  if (raw.dueDate !== undefined && raw.dueDate !== null && raw.dueDate !== '') {
    if (typeof raw.dueDate !== 'string' || !isValidCalendarDate(raw.dueDate.trim())) {
      return { ok: false, error: '마감일은 YYYY-MM-DD 형식이어야 합니다.' };
    }
    dueDate = raw.dueDate.trim();
  }

  let pinned = false;
  if (raw.pinned !== undefined) {
    if (typeof raw.pinned !== 'boolean') {
      return { ok: false, error: '고정 여부는 불리언 값이어야 합니다.' };
    }
    pinned = raw.pinned;
  }

  let subtasks: SubtaskItem[] = [];
  if (raw.subtasks !== undefined) {
    const parsedSubtasks = validateSubtasks(raw.subtasks);
    if (!parsedSubtasks.ok) return parsedSubtasks;
    subtasks = parsedSubtasks.data;
  }

  let recurrence: TodoRecurrence = 'none';
  if (raw.recurrence !== undefined) {
    if (!isRecurrence(raw.recurrence)) {
      return { ok: false, error: '반복 주기 값이 올바르지 않습니다.' };
    }
    recurrence = raw.recurrence;
  }

  let focusMinutes = 0;
  if (raw.focusMinutes !== undefined) {
    if (
      typeof raw.focusMinutes !== 'number' ||
      !Number.isInteger(raw.focusMinutes) ||
      raw.focusMinutes < 0 ||
      raw.focusMinutes > TODO_LIMITS.MAX_FOCUS_MINUTES
    ) {
      return { ok: false, error: '집중 시간 값이 올바르지 않습니다.' };
    }
    focusMinutes = raw.focusMinutes;
  }

  return {
    ok: true,
    data: { title, notes, status, priority, category, dueDate, pinned, subtasks, recurrence, focusMinutes },
  };
}

export function validateUpdateTodo(body: unknown): Validated<UpdateTodoInput> {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: '요청 본문이 올바르지 않습니다.' };
  }

  const raw = body as Record<string, unknown>;
  const patch: UpdateTodoInput = {};

  if (raw.title !== undefined) {
    if (typeof raw.title !== 'string') {
      return { ok: false, error: '제목 형식이 올바르지 않습니다.' };
    }
    const title = raw.title.trim();
    if (!title) {
      return { ok: false, error: '할 일 제목은 비워둘 수 없습니다.' };
    }
    if (title.length > TODO_LIMITS.MAX_TITLE_LENGTH) {
      return { ok: false, error: `제목은 ${TODO_LIMITS.MAX_TITLE_LENGTH}자 이하로 입력해 주세요.` };
    }
    patch.title = title;
  }

  if (raw.notes !== undefined) {
    if (typeof raw.notes !== 'string') {
      return { ok: false, error: '메모 형식이 올바르지 않습니다.' };
    }
    const notes = raw.notes.trim();
    if (notes.length > TODO_LIMITS.MAX_NOTES_LENGTH) {
      return { ok: false, error: `메모는 ${TODO_LIMITS.MAX_NOTES_LENGTH}자 이하로 입력해 주세요.` };
    }
    patch.notes = notes;
  }

  if (raw.status !== undefined) {
    if (!isStatus(raw.status)) {
      return { ok: false, error: '상태 값이 올바르지 않습니다.' };
    }
    patch.status = raw.status;
  }

  if (raw.priority !== undefined) {
    if (!isPriority(raw.priority)) {
      return { ok: false, error: '우선순위 값이 올바르지 않습니다.' };
    }
    patch.priority = raw.priority;
  }

  if (raw.category !== undefined) {
    if (typeof raw.category !== 'string') {
      return { ok: false, error: '카테고리 형식이 올바르지 않습니다.' };
    }
    const category = raw.category.trim();
    if (category.length > TODO_LIMITS.MAX_CATEGORY_LENGTH) {
      return {
        ok: false,
        error: `카테고리는 ${TODO_LIMITS.MAX_CATEGORY_LENGTH}자 이하로 입력해 주세요.`,
      };
    }
    patch.category = category;
  }

  if (raw.dueDate !== undefined) {
    if (raw.dueDate === null || raw.dueDate === '') {
      patch.dueDate = null;
    } else if (typeof raw.dueDate === 'string' && isValidCalendarDate(raw.dueDate.trim())) {
      patch.dueDate = raw.dueDate.trim();
    } else {
      return { ok: false, error: '마감일은 YYYY-MM-DD 형식이어야 합니다.' };
    }
  }

  if (raw.pinned !== undefined) {
    if (typeof raw.pinned !== 'boolean') {
      return { ok: false, error: '고정 여부는 불리언 값이어야 합니다.' };
    }
    patch.pinned = raw.pinned;
  }

  if (raw.subtasks !== undefined) {
    const parsedSubtasks = validateSubtasks(raw.subtasks);
    if (!parsedSubtasks.ok) return parsedSubtasks;
    patch.subtasks = parsedSubtasks.data;
  }

  if (raw.recurrence !== undefined) {
    if (!isRecurrence(raw.recurrence)) {
      return { ok: false, error: '반복 주기 값이 올바르지 않습니다.' };
    }
    patch.recurrence = raw.recurrence;
  }

  if (raw.sortOrder !== undefined) {
    if (typeof raw.sortOrder !== 'number' || !Number.isInteger(raw.sortOrder)) {
      return { ok: false, error: '정렬 순서 값이 올바르지 않습니다.' };
    }
    patch.sortOrder = raw.sortOrder;
  }

  if (raw.focusMinutes !== undefined) {
    if (
      typeof raw.focusMinutes !== 'number' ||
      !Number.isInteger(raw.focusMinutes) ||
      raw.focusMinutes < 0 ||
      raw.focusMinutes > TODO_LIMITS.MAX_FOCUS_MINUTES
    ) {
      return { ok: false, error: '집중 시간 값이 올바르지 않습니다.' };
    }
    patch.focusMinutes = raw.focusMinutes;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: '수정할 항목이 없습니다.' };
  }

  return { ok: true, data: patch };
}

export function validateReorderPayload(body: unknown): Validated<string[]> {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: '정렬 요청 형식이 올바르지 않습니다.' };
  }
  const raw = body as Record<string, unknown>;
  if (!Array.isArray(raw.orderedIds) || raw.orderedIds.length === 0 || raw.orderedIds.length > 500) {
    return { ok: false, error: '정렬할 항목 ID 목록이 올바르지 않습니다.' };
  }
  const ids: string[] = [];
  for (const id of raw.orderedIds) {
    if (typeof id !== 'string' || !id.trim() || id.length > 64) {
      return { ok: false, error: '유효하지 않은 항목 ID가 포함되어 있습니다.' };
    }
    ids.push(id.trim());
  }
  return { ok: true, data: ids };
}

export function validateImportPayload(body: unknown): Validated<CreateTodoInput[]> {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: '가져오기 데이터 형식이 올바르지 않습니다.' };
  }

  const raw = body as Record<string, unknown>;
  if (!Array.isArray(raw.items)) {
    return { ok: false, error: 'items 배열이 필요합니다.' };
  }

  if (raw.items.length === 0) {
    return { ok: false, error: '가져올 할 일이 비어 있습니다.' };
  }

  if (raw.items.length > TODO_LIMITS.MAX_IMPORT_ITEMS) {
    return {
      ok: false,
      error: `한 번에 최대 ${TODO_LIMITS.MAX_IMPORT_ITEMS}개까지 가져올 수 있습니다.`,
    };
  }

  const validatedItems: CreateTodoInput[] = [];
  for (let i = 0; i < raw.items.length; i += 1) {
    const result = validateCreateTodo(raw.items[i]);
    if (!result.ok) {
      return { ok: false, error: `${i + 1}번째 항목 오류: ${result.error}` };
    }
    validatedItems.push(result.data);
  }

  return { ok: true, data: validatedItems };
}
