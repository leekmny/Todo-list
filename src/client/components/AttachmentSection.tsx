import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  Download,
  Eye,
  FileArchive,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { TODO_LIMITS, type TodoAttachment } from '../../shared/types';
import { downloadAttachmentApi, loadAttachmentImageUrl } from '../api';

const ACCEPTED_FILES =
  '.txt,.md,.csv,.json,.pdf,.png,.jpg,.jpeg,.webp,.gif,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.hwp,.hwpx';

interface AttachmentSectionProps {
  todoId: string;
  attachments: TodoAttachment[];
  onUpload: (todoId: string, file: File) => Promise<void>;
  onDelete: (todoId: string, attachmentId: string) => Promise<void>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isImageMime(mimeType: string): boolean {
  const base = mimeType.split(';')[0].trim().toLowerCase();
  return base === 'image/png' || base === 'image/jpeg' || base === 'image/webp' || base === 'image/gif';
}

function renderFileIcon(mimeType: string) {
  if (isImageMime(mimeType)) return <ImageIcon size={14} />;
  if (mimeType.includes('zip')) return <FileArchive size={14} />;
  return <FileText size={14} />;
}

export function AttachmentSection({
  todoId,
  attachments,
  onUpload,
  onDelete,
}: AttachmentSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<{
    fileName: string;
    url: string;
    revoke: boolean;
  } | null>(null);

  const canAddMore = attachments.length < TODO_LIMITS.MAX_ATTACHMENTS_PER_TODO;

  async function processFiles(files: FileList | null) {
    if (!files || files.length === 0 || uploading) return;
    const file = files[0];
    setUploading(true);
    try {
      await onUpload(todoId, file);
    } finally {
      setUploading(false);
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    void processFiles(event.target.files);
    event.target.value = '';
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (!canAddMore) return;
    void processFiles(event.dataTransfer.files);
  }

  async function handlePreviewImage(attachment: TodoAttachment) {
    if (preview?.revoke) {
      URL.revokeObjectURL(preview.url);
    }
    const loaded = await loadAttachmentImageUrl(todoId, attachment);
    setPreview({ fileName: attachment.fileName, url: loaded.url, revoke: loaded.revoke });
  }

  function closePreview() {
    if (preview?.revoke) {
      URL.revokeObjectURL(preview.url);
    }
    setPreview(null);
  }

  return (
    <div className="attachment-drawer">
      {attachments.length > 0 && (
        <ul className="attachment-list">
          {attachments.map((att) => (
            <li key={att.id} className="attachment-row">
              <span className="attachment-icon">{renderFileIcon(att.mimeType)}</span>
              <span className="attachment-name" title={att.fileName}>
                {att.fileName}
              </span>
              <span className="attachment-size">{formatBytes(att.sizeBytes)}</span>
              <div className="attachment-row-actions">
                {isImageMime(att.mimeType) && (
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => void handlePreviewImage(att)}
                    title="이미지 미리보기"
                    aria-label="이미지 미리보기"
                  >
                    <Eye size={13} />
                  </button>
                )}
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => void downloadAttachmentApi(todoId, att)}
                  title="다운로드"
                  aria-label="다운로드"
                >
                  <Download size={13} />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn-danger"
                  onClick={() => void onDelete(todoId, att.id)}
                  title="삭제"
                  aria-label="삭제"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canAddMore ? (
        <div
          className={`attachment-dropzone ${dragActive ? 'is-drag-active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.stopPropagation();
            setDragActive(false);
          }}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_FILES}
            className="sr-only"
            onChange={handleInputChange}
            disabled={uploading}
          />
          <button
            type="button"
            className="attachment-upload-btn"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Paperclip size={13} /> : <Upload size={13} />}
            <span>
              {uploading
                ? '업로드 중...'
                : `파일 첨부 또는 드래그 (최대 1.5MB · ${attachments.length}/${TODO_LIMITS.MAX_ATTACHMENTS_PER_TODO})`}
            </span>
          </button>
        </div>
      ) : (
        <div className="attachment-limit-note">
          최대 첨부 개수({TODO_LIMITS.MAX_ATTACHMENTS_PER_TODO}개)에 도달했습니다.
        </div>
      )}

      {preview && (
        <div className="modal-backdrop" onClick={closePreview} role="dialog" aria-modal="true">
          <div className="image-preview-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="image-preview-title">{preview.fileName}</h2>
              <button type="button" className="icon-btn" onClick={closePreview} aria-label="닫기">
                <X size={18} />
              </button>
            </div>
            <img src={preview.url} alt={preview.fileName} className="image-preview-img" />
          </div>
        </div>
      )}
    </div>
  );
}
