import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, KeyRound, Mail, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { ApiError, requestEmailOtp, verifyEmailOtpApi } from '../api';

interface LockScreenProps {
  emailOtpReady: boolean;
  cfAccessEnabled: boolean;
  onUnlocked: () => void;
}

export function LockScreen({ emailOtpReady, cfAccessEnabled, onUnlocked }: LockScreenProps) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [lockCooldown, setLockCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0 && lockCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
      setLockCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown, lockCooldown]);

  async function handleRequestCode(event?: FormEvent) {
    event?.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || submitting || resendCooldown > 0 || lockCooldown > 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await requestEmailOtp(trimmedEmail);
      setNotice(res.message);
      setResendCooldown(res.cooldownSeconds ?? 60);
      setStep('code');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.status === 429 && err.retryAfterSeconds) {
          if (step === 'email') {
            setResendCooldown(err.retryAfterSeconds);
          } else {
            setLockCooldown(err.retryAfterSeconds);
          }
        }
      } else {
        setError('인증 코드 요청 중 오류가 발생했습니다.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyCode(event: FormEvent) {
    event.preventDefault();
    const cleanCode = code.replace(/\D/g, '').slice(0, 6);
    if (cleanCode.length !== 6 || submitting || lockCooldown > 0) return;

    setSubmitting(true);
    setError(null);
    try {
      await verifyEmailOtpApi(email.trim(), cleanCode);
      setCode('');
      onUnlocked();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.retryAfterSeconds) {
          setLockCooldown(err.retryAfterSeconds);
        }
      } else {
        setError('인증 코드 확인 중 오류가 발생했습니다.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="lock-shell">
      <div className="lock-card">
        <div className="lock-emblem" aria-hidden="true">
          {step === 'code' ? <KeyRound size={24} /> : <Mail size={24} />}
        </div>
        <h1 className="lock-title">Private Todo</h1>
        <p className="lock-subtitle">
          {step === 'code'
            ? `${email.trim()}로 발송된 6자리 인증 코드를 입력하세요.`
            : '초대된 사용자 전용 공간입니다. 본인 이메일로 인증하면 나만의 비밀 공간이 열립니다.'}
        </p>

        {!emailOtpReady && !cfAccessEnabled ? (
          <div className="lock-warning" role="alert">
            <ShieldAlert size={18} />
            <div>
              <strong>이메일 인증 설정이 아직 완료되지 않았습니다.</strong>
              <p>
                Cloudflare Dashboard에서 <strong>Cloudflare Access(One-Time PIN)</strong>를
                활성화하거나, <code>RESEND_API_KEY</code> 시크릿을 등록해 6자리 이메일 인증을
                켜세요.
              </p>
            </div>
          </div>
        ) : !emailOtpReady && cfAccessEnabled ? (
          <div className="lock-form">
            <div className="lock-warning" role="status">
              <ShieldCheck size={18} />
              <div>
                <strong>Cloudflare Access 이메일 인증 보호 중</strong>
                <p>
                  Cloudflare Access 로그인 페이지를 통해 이메일 OTP 인증을 완료하면 자동으로
                  열립니다.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary lock-submit"
              onClick={() => window.location.reload()}
            >
              <RefreshCw size={15} />
              <span>인증 상태 다시 확인</span>
            </button>
          </div>
        ) : step === 'email' ? (
          <form className="lock-form" onSubmit={handleRequestCode}>
            <label className="sr-only" htmlFor="vault-email">
              이메일 주소
            </label>
            <input
              id="vault-email"
              type="email"
              className="input"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              required
              disabled={submitting || lockCooldown > 0}
            />

            {error && (
              <p className="lock-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primary lock-submit"
              disabled={!email.trim() || submitting || resendCooldown > 0 || lockCooldown > 0}
            >
              {submitting
                ? '발송 중...'
                : resendCooldown > 0
                  ? `${resendCooldown}초 후 재요청 가능`
                  : '이메일로 인증 코드 받기'}
            </button>
          </form>
        ) : (
          <form className="lock-form" onSubmit={handleVerifyCode}>
            {notice && <p className="lock-notice">{notice}</p>}

            <label className="sr-only" htmlFor="vault-otp">
              6자리 인증 코드
            </label>
            <input
              id="vault-otp"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              className="input otp-input"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              autoComplete="one-time-code"
              autoFocus
              disabled={submitting || lockCooldown > 0}
            />

            {error && (
              <p className="lock-error" role="alert">
                {error}
                {lockCooldown > 0 ? ` (${lockCooldown}초 남음)` : ''}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primary lock-submit"
              disabled={code.length !== 6 || submitting || lockCooldown > 0}
            >
              {submitting ? '확인 중...' : lockCooldown > 0 ? `잠김 (${lockCooldown}초)` : '인증하고 들어가기'}
            </button>

            <div className="otp-actions">
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                  setNotice(null);
                }}
              >
                <ArrowLeft size={13} />
                <span>이메일 변경</span>
              </button>

              <button
                type="button"
                className="text-link"
                onClick={() => void handleRequestCode()}
                disabled={submitting || resendCooldown > 0 || lockCooldown > 0}
              >
                {resendCooldown > 0 ? `재발송 (${resendCooldown}초)` : '코드 재발송'}
              </button>
            </div>
          </form>
        )}

        <div className="lock-footer">
          <ShieldCheck size={14} />
          <span>이메일 OTP 인증 · 검색엔진 차단 · Cloudflare D1 저장</span>
        </div>
      </div>
    </div>
  );
}
