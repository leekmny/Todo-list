import { TODO_LIMITS } from '../shared/types';

const ALLOWED_EXTENSION_MIMES: Record<string, string> = {
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.zip': 'application/zip',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.hwp': 'application/x-hwp',
  '.hwpx': 'application/hwp+zip',
};

const INLINE_SAFE_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export const ACCEPTED_ATTACHMENT_EXTENSIONS = Object.keys(ALLOWED_EXTENSION_MIMES).join(',');

export function sanitizeFileName(rawName: string): string {
  const base = rawName.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f"<>|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  const safe = cleaned || 'file';
  if (safe.length <= 120) return safe;
  const dotIdx = safe.lastIndexOf('.');
  if (dotIdx > 0 && safe.length - dotIdx <= 12) {
    const ext = safe.slice(dotIdx);
    return `${safe.slice(0, 120 - ext.length)}${ext}`;
  }
  return safe.slice(0, 120);
}

export function validateAttachmentUpload(
  rawFileName: string,
  sizeBytes: number
): { ok: true; fileName: string; mimeType: string } | { ok: false; error: string } {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, error: '비어 있는 파일은 업로드할 수 없습니다.' };
  }
  if (sizeBytes > TODO_LIMITS.MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: '파일 크기는 개당 최대 1.5MB까지 업로드할 수 있습니다.' };
  }

  const fileName = sanitizeFileName(rawFileName);
  const dotIdx = fileName.lastIndexOf('.');
  const ext = dotIdx >= 0 ? fileName.slice(dotIdx).toLowerCase() : '';
  const canonicalMime = ALLOWED_EXTENSION_MIMES[ext];

  if (!canonicalMime) {
    return {
      ok: false,
      error:
        '보안을 위해 문서(PDF/TXT/MD/CSV/JSON/DOCX/XLSX/PPTX/HWP), 이미지(PNG/JPG/WEBP/GIF), ZIP 파일만 첨부할 수 있습니다.',
    };
  }

  return { ok: true, fileName, mimeType: canonicalMime };
}

export function isInlinePreviewableImage(mimeType: string): boolean {
  return INLINE_SAFE_IMAGE_MIMES.has(mimeType.split(';')[0].trim().toLowerCase());
}

export function buildContentDisposition(fileName: string, inline: boolean): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(fileName);
  const type = inline ? 'inline' : 'attachment';
  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
