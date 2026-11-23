import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type { OAuthProvidersStatus } from '../../shared/types';
import {
  ApiError,
  requestEmailOtp,
  unlockDesktopVaultApi,
  verifyEmailOtpApi,
} from '../api';

const LAST_EMAIL_STORAGE_KEY = 'private-todo-last-email';

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  email_not_allowed: '이 서버에서 로그인 권한이 없는 이메일 계정입니다.',
  unverified_email: '이메일 인증이 완료되지 않은 계정입니다.',
  invalid_state: '로그인 인증 세션이 만료되었거나 유효하지 않습니다. 다시 시도해 주세요.',
  oauth_cancelled: '소셜 로그인이 취소되었습니다.',
  token_failed: '소셜 로그인 인증 처리 중 오류가 발생했습니다. 다시 시도해 주세요.',
  oauth_not_configured: '해당 소셜 로그인 설정이 아직 완료되지 않았습니다.',
};

interface LockScreenProps {
  desktopMode?: boolean;
  localPasscodeEnabled?: boolean;
  emailOtpReady: boolean;
  cfAccessEnabled: boolean;
  oauthProviders: OAuthProvidersStatus;
  onUnlocked: () => void;
}

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.54-5.17 3.54-8.87z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.09A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29A7.22 7.22 0 0 1 4.9 12c0-.79.14-1.57.38-2.29V6.62H1.29a12 12 0 0 0 0 10.76l3.99-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l3.99 3.09c.95-2.85 3.6-4.96 6.72-4.96z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.76 0c2.19-1.49 3.15-1.18 3.15-1.18.63 1.59.24 2.76.12 3.05.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.07.78 2.15 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

export function LockScreen({
  desktopMode = false,
  localPasscodeEnabled = false,
  emailOtpReady,
  cfAccessEnabled,
  oauthProviders,
  onUnlocked,
}: LockScreenProps) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(() => window.localStorage.getItem(LAST_EMAIL_STORAGE_KEY) ?? '');
  const [code, setCode] = useState('');
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const codeKey = params.get('authError');
    if (codeKey) {
      params.delete('authError');
      const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
      window.history.replaceState({}, '', nextUrl);
      return OAUTH_ERROR_MESSAGES[codeKey] ?? '로그인 중 오류가 발생했습니다.';
    }
    return null;
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [lockCooldown, setLockCooldown] = useState(0);

  const hasOAuth = oauthProviders.google || oauthProviders.github;
  const hasAnyAuth = emailOtpReady || cfAccessEnabled || hasOAuth;

  useEffect(() => {
    if (resendCooldown <= 0 && lockCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
      setLockCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown, lockCooldown]);

  async function handleUnlockDesktop(event: FormEvent) {
    event.preventDefault();
    if (!passcode || submitting || lockCooldown > 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await unlockDesktopVaultApi(passcode);
      setPasscode('');
      onUnlocked();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.retryAfterSeconds) setLockCooldown(err.retryAfterSeconds);
      } else {
        setError('잠금 해제에 실패했습니다.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestCode(event?: FormEvent) {
    event?.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || submitting || resendCooldown > 0 || lockCooldown > 0) return;

    setSubmitting(true);
    setError(null);
    try {
      window.localStorage.setItem(LAST_EMAIL_STORAGE_KEY, trimmedEmail);
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
      await verifyEmailOtpApi(email.trim(), cleanCode, rememberMe);
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

  function handleOAuthLogin(provider: 'google' | 'github') {
    const rememberParam = rememberMe ? '1' : '0';
    window.location.href = `/api/auth/oauth/${provider}?rememberMe=${rememberParam}`;
  }

  if (desktopMode && localPasscodeEnabled) {
    return (
      <div className="lock-shell">
        <div className="lock-card">
          <div className="lock-emblem" aria-hidden="true">
            <Lock size={24} />
          </div>
          <h1 className="lock-title">Private Todo</h1>
          <p className="lock-subtitle">
            로컬 암호화 보관함이 잠겨 있습니다. 앱 잠금 비밀번호를 입력하세요.
          </p>

          <form className="lock-form" onSubmit={handleUnlockDesktop}>
            <div className="password-input-wrap">
              <input
                type={showPasscode ? 'text' : 'password'}
                className="input password-input"
                placeholder="잠금 비밀번호 입력"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                autoFocus
                disabled={submitting || lockCooldown > 0}
              />
              <button
                type="button"
                className="icon-btn password-toggle"
                onClick={() => setShowPasscode((prev) => !prev)}
                aria-label={showPasscode ? '비밀번호 숨기기' : '비밀번호 보기'}
              >
                {showPasscode ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {error && (
              <p className="lock-error" role="alert">
                {error}
                {lockCooldown > 0 ? ` (${lockCooldown}초 남음)` : ''}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primary lock-submit"
              disabled={!passcode || submitting || lockCooldown > 0}
            >
              {submitting ? '복호화 중...' : lockCooldown > 0 ? `잠김 (${lockCooldown}초)` : '잠금 해제'}
            </button>
          </form>

          <div className="lock-footer">
            <ShieldCheck size={14} />
            <span>AES-256-GCM · PBKDF2-SHA256 로컬 암호화</span>
          </div>
        </div>
      </div>
    );
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
            : 'Google, GitHub 또는 이메일로 로그인하세요. 한 번 로그인하면 이 기기에서 90일간 자동 유지됩니다.'}
        </p>

        {!hasAnyAuth ? (
          <div className="lock-warning" role="alert">
            <ShieldAlert size={18} />
            <div>
              <strong>로그인 인증 설정이 아직 완료되지 않았습니다.</strong>
              <p>
                Google/GitHub OAuth 시크릿, <code>RESEND_API_KEY</code>, 또는{' '}
                <strong>Cloudflare Access</strong>를 설정해 주세요.
              </p>
            </div>
          </div>
        ) : (
          <div className="lock-form">
            {hasOAuth && step === 'email' && (
              <>
                <div className="oauth-buttons">
                  {oauthProviders.google && (
                    <button
                      type="button"
                      className="btn btn-oauth"
                      onClick={() => handleOAuthLogin('google')}
                    >
                      <GoogleIcon />
                      <span>Google로 계속하기</span>
                    </button>
                  )}
                  {oauthProviders.github && (
                    <button
                      type="button"
                      className="btn btn-oauth"
                      onClick={() => handleOAuthLogin('github')}
                    >
                      <GitHubIcon />
                      <span>GitHub로 계속하기</span>
                    </button>
                  )}
                </div>

                {!emailOtpReady && (
                  <label className="remember-check">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <span>이 기기에서 로그인 유지 (90일 자동 연장)</span>
                  </label>
                )}

                {!emailOtpReady && error && (
                  <p className="lock-error" role="alert">
                    {error}
                  </p>
                )}

                {emailOtpReady && (
                  <div className="auth-divider">
                    <span>또는 이메일 코드로 로그인</span>
                  </div>
                )}
              </>
            )}

            {!emailOtpReady && !hasOAuth && cfAccessEnabled ? (
              <>
                <div className="lock-warning" role="status">
                  <ShieldCheck size={18} />
                  <div>
                    <strong>Cloudflare Access 이메일 인증 보호 중</strong>
                    <p>
                      Cloudflare Access 로그인 페이지를 통해 인증을 완료하면 자동으로 열립니다.
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
              </>
            ) : emailOtpReady && step === 'email' ? (
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
                  autoFocus={!hasOAuth}
                  required
                  disabled={submitting || lockCooldown > 0}
                />

                <label className="remember-check">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>이 기기에서 로그인 유지 (90일 자동 연장)</span>
                </label>

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
            ) : emailOtpReady && step === 'code' ? (
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

                <label className="remember-check">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>이 기기에서 로그인 유지 (접속 시 90일 자동 연장)</span>
                </label>

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
                  {submitting
                    ? '확인 중...'
                    : lockCooldown > 0
                      ? `잠김 (${lockCooldown}초)`
                      : '인증하고 들어가기'}
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
            ) : null}
          </div>
        )}

        <div className="lock-footer">
          <ShieldCheck size={14} />
          <span>OAuth 2.0 PKCE · 90일 자동 연장 · Cloudflare D1</span>
        </div>
      </div>
    </div>
  );
}
