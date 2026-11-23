import { useRef, type ChangeEvent } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  Inbox,
  Lock,
  LogOut,
  Mail,
  Moon,
  ShieldCheck,
  Star,
  Sun,
  Tag,
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
  categories: CategoryCount[];
  theme: 'dark' | 'light';
  authMethod: 'email-otp' | 'cf-access' | null;
  userEmail: string | null;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onSelectView: (view: SmartView) => void;
  onSelectCategory: (category: string | null) => void;
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
  categories,
  theme,
  authMethod,
  userEmail,
  mobileOpen,
  onCloseMobile,
  onSelectView,
  onSelectCategory,
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
              <div className="brand-badge">비밀 개인 워크스페이스</div>
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
          ) : (
            <button type="button" className="btn btn-lock" onClick={onLockNow}>
              <LogOut size={14} />
              <span>지금 잠금</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
