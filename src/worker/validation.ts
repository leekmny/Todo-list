import {
  TODO_LIMITS,
  TODO_PRIORITIES,
  TODO_STATUSES,
  type CreateTodoInput,
  type TodoPriority,
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

  return {
    ok: true,
    data: { title, notes, status, priority, category, dueDate, pinned },
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

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: '수정할 항목이 없습니다.' };
  }

  return { ok: true, data: patch };
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
