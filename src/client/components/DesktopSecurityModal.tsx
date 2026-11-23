import { useState, type FormEvent } from 'react';
import { Cloud, Lock, ShieldCheck, X } from 'lucide-react';
import {
  connectDesktopCloudApi,
  disableDesktopPasscodeApi,
  enableDesktopPasscodeApi,
} from '../api';

interface DesktopSecurityModalProps {
  localPasscodeEnabled: boolean;
  encryptionLabel: string;
  onClose: () => void;
  onChanged: (message: string) => void;
}

export function DesktopSecurityModal({
  localPasscodeEnabled,
  encryptionLabel,
  onClose,
  onChanged,
}: DesktopSecurityModalProps) {
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [currentPasscode, setCurrentPasscode] = useState('');
  const [cloudUrl, setCloudUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEnablePasscode(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (newPasscode.length < 6) {
      setError('비밀번호는 6자 이상 입력해 주세요.');
      return;
    }
    if (newPasscode !== confirmPasscode) {
      setError('비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    setBusy(true);
    try {
      await enableDesktopPasscodeApi(newPasscode);
      onChanged('로컬 앱 잠금 비밀번호를 설정하고 보관함을 재암호화했습니다.');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '설정에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisablePasscode(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await disableDesktopPasscodeApi(currentPasscode);
      onChanged('앱 잠금을 해제하고 OS 보안 키체인(DPAPI) 자동 암호화로 전환했습니다.');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '해제에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function handleConnectCloud(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await connectDesktopCloudApi(cloudUrl.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : '클라우드 서버 연결에 실패했습니다.');
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>데스크톱 보안 · 클라우드 연결</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="security-status-box">
          <ShieldCheck size={17} />
          <div>
            <strong>현재 보호 방식</strong>
            <p>{encryptionLabel}</p>
          </div>
        </div>

        {error && (
          <p className="lock-error" role="alert" style={{ marginBottom: 12 }}>
            {error}
          </p>
        )}

        <div className="shortcuts-section">
          <h3>
            <Lock size={13} /> 로컬 앱 잠금 비밀번호 (PBKDF2 + AES-256-GCM)
          </h3>
          {localPasscodeEnabled ? (
            <form className="modal-form" onSubmit={handleDisablePasscode}>
              <input
                type="password"
                className="input"
                placeholder="현재 앱 잠금 비밀번호 입력"
                value={currentPasscode}
                onChange={(e) => setCurrentPasscode(e.target.value)}
                required
              />
              <button
                type="submit"
                className="btn btn-ghost"
                disabled={!currentPasscode || busy}
              >
                비밀번호 잠금 해제 (OS 자동 암호화로 전환)
              </button>
            </form>
          ) : (
            <form className="modal-form" onSubmit={handleEnablePasscode}>
              <input
                type="password"
                className="input"
                placeholder="새 앱 잠금 비밀번호 (6자 이상)"
                value={newPasscode}
                onChange={(e) => setNewPasscode(e.target.value)}
                minLength={6}
                required
              />
              <input
                type="password"
                className="input"
                placeholder="비밀번호 다시 입력"
                value={confirmPasscode}
                onChange={(e) => setConfirmPasscode(e.target.value)}
                minLength={6}
                required
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={newPasscode.length < 6 || busy}
              >
                앱 잠금 비밀번호 켜기
              </button>
            </form>
          )}
        </div>

        <div className="shortcuts-section">
          <h3>
            <Cloud size={13} /> 개인 Cloudflare 서버 동기화 (선택)
          </h3>
          <p className="workspace-subtitle" style={{ marginBottom: 10 }}>
            직접 배포한 Cloudflare Worker HTTPS 주소를 입력하면 PC와 웹에서 할 일을 실시간으로
            동기화할 수 있습니다. (메뉴에서 언제든 로컬 보관함으로 복귀 가능)
          </p>
          <form className="modal-subtask-input-row" onSubmit={handleConnectCloud}>
            <input
              type="url"
              className="input"
              placeholder="https://your-worker.workers.dev"
              value={cloudUrl}
              onChange={(e) => setCloudUrl(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-ghost" disabled={!cloudUrl.trim() || busy}>
              연결
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
