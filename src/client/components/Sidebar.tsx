import { useRef, type ChangeEvent } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  Inbox,
  Keyboard,
  Lock,
  LogOut,
  Mail,
  Moon,
  ShieldCheck,
  Star,
  Sun,
  Tag,
  Timer,
  Upload,
  X,
} from 'lucide-react';

export type SmartView = 'all' | 'today' | 'active' | 'important' | 'done';

interface CategoryCount {
  name: string;
  count: number;
}

interface SidebarProps {
  activeView: SmartView;
  selectedCategory: string | null;
  counts: Record<SmartView, number>;
  totalCount: number;
  doneCount: number;
  totalFocusMinutes: number;
  categories: CategoryCount[];
  theme: 'dark' | 'light';
  authMethod: 'email-otp' | 'cf-access' | 'oauth-google' | 'oauth-github' | 'local-vault' | null;
  userEmail: string | null;
  desktopMode?: boolean;
  localPasscodeEnabled?: boolean;
  isDesktopCloud?: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSelectView: (view: SmartView) => void;
  onSelectCategory: (category: string | null) => void;
  onOpenPomodoro: () => void;
  onOpenShortcuts: () => void;
  onOpenDesktopSecurity?: () => void;
  onSwitchToLocalVault?: () => void;
  onToggleTheme: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onLockNow: () => void;
}

const NAV_ITEMS: { id: SmartView; label: string; icon: typeof Inbox }[] = [
  { id: 'all', label: '전체', icon: Inbox },
  { id: 'today', label: '오늘 집중', icon: Clock },
  { id: 'active', label: '진행 중', icon: Inbox },
  { id: 'important', label: '중요 / 고정', icon: Star },
  { id: 'done', label: '완료됨', icon: CheckCircle2 },
];

export function Sidebar({
  activeView,
  selectedCategory,
  counts,
  totalCount,
  doneCount,
  totalFocusMinutes,
  categories,
  theme,
  authMethod,
  userEmail,
  desktopMode = false,
  localPasscodeEnabled = false,
  isDesktopCloud = false,
  mobileOpen,
  onCloseMobile,
  onSelectView,
  onSelectCategory,
  onOpenPomodoro,
  onOpenShortcuts,
  onOpenDesktopSecurity,
  onSwitchToLocalVault,
  onToggleTheme,
  onExportBackup,
  onImportBackup,
  onLockNow,
}: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progress = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      onImportBackup(file);
    }
    event.target.value = '';
  }

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onCloseMobile} />}
      <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`} aria-label="탐색 메뉴">
        <div className="sidebar-top">
          <div className="brand-row">
            <div className="brand-mark">
              <Lock size={16} />
            </div>
            <div>
              <div className="brand-name">Private Todo</div>
              <div className="brand-badge">나만의 할 일 워크스페이스</div>
            </div>
            <button
              type="button"
              className="icon-btn mobile-only"
              onClick={onCloseMobile}
              aria-label="메뉴 닫기"
            >
              <X size={18} />
            </button>
          </div>

          <div className="progress-card">
            <div className="progress-header">
              <span>완료율</span>
              <strong>{progress}%</strong>
            </div>
            <div className="progress-track" aria-hidden="true">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="progress-meta">
              <span>남음 {totalCount - doneCount}</span>
              <span>완료 {doneCount}</span>
              {totalFocusMinutes > 0 && <span>집중 {totalFocusMinutes}분</span>}
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">보기</div>
          <ul className="nav-list">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = !selectedCategory && activeView === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`nav-item ${isActive ? 'is-active' : ''}`}
                    onClick={() => {
                      onSelectCategory(null);
                      onSelectView(item.id);
                      onCloseMobile();
                    }}
                  >
                    <Icon size={16} />
                    <span className="nav-item-label">{item.label}</span>
                    <span className="nav-count">{counts[item.id]}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="nav-section-label">도구</div>
          <ul className="nav-list">
            <li>
              <button
                type="button"
                className="nav-item"
                onClick={() => {
                  onOpenPomodoro();
                  onCloseMobile();
                }}
              >
                <Timer size={16} />
                <span className="nav-item-label">뽀모도로 타이머</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className="nav-item"
                onClick={() => {
                  onOpenShortcuts();
                  onCloseMobile();
                }}
              >
                <Keyboard size={16} />
                <span className="nav-item-label">단축키 · 빠른 입력</span>
                <span className="nav-count">?</span>
              </button>
            </li>
            {desktopMode && onOpenDesktopSecurity && (
              <li>
                <button
                  type="button"
                  className="nav-item"
                  onClick={() => {
                    onOpenDesktopSecurity();
                    onCloseMobile();
                  }}
                >
                  <ShieldCheck size={16} />
                  <span className="nav-item-label">보안 · 클라우드 연결</span>
                </button>
              </li>
            )}
            {isDesktopCloud && onSwitchToLocalVault && (
              <li>
                <button
                  type="button"
                  className="nav-item"
                  onClick={() => {
                    onSwitchToLocalVault();
                    onCloseMobile();
                  }}
                >
                  <Lock size={16} />
                  <span className="nav-item-label">로컬 보관함으로 전환</span>
                </button>
              </li>
            )}
          </ul>

          {categories.length > 0 && (
            <>
              <div className="nav-section-label">카테고리</div>
              <ul className="nav-list">
                {categories.map((cat) => {
                  const isActive = selectedCategory === cat.name;
                  return (
                    <li key={cat.name}>
                      <button
                        type="button"
                        className={`nav-item ${isActive ? 'is-active' : ''}`}
                        onClick={() => {
                          onSelectCategory(isActive ? null : cat.name);
                          onCloseMobile();
                        }}
                      >
                        <Tag size={15} />
                        <span className="nav-item-label">{cat.name}</span>
                        <span className="nav-count">{cat.count}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          {userEmail && (
            <div className="user-email-pill" title={userEmail}>
              <Mail size={13} />
              <span>{userEmail}</span>
            </div>
          )}

          <div className="footer-tools">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onExportBackup}
              title="JSON 백업 내보내기"
            >
              <Download size={14} />
              <span>백업</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => fileInputRef.current?.click()}
              title="JSON 백업 가져오기"
            >
              <Upload size={14} />
              <span>복원</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={handleFileChange}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm icon-only-btn"
              onClick={onToggleTheme}
              title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
              aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>

          {authMethod === 'cf-access' ? (
            <a href="/cdn-cgi/access/logout" className="btn btn-lock auth-logout-link">
              <ShieldCheck size={14} />
              <span>Access 로그아웃</span>
            </a>
          ) : authMethod === 'local-vault' ? (
            localPasscodeEnabled ? (
              <button type="button" className="btn btn-lock" onClick={onLockNow}>
                <Lock size={14} />
                <span>보관함 잠금</span>
              </button>
            ) : null
          ) : (
            <button type="button" className="btn btn-lock" onClick={onLockNow}>
              <LogOut size={14} />
              <span>로그아웃</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
