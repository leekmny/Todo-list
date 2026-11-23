# Private Todo

오프라인 암호화 **데스크톱 앱(Windows/macOS/Linux)** 과 **Cloudflare Workers + D1 웹 앱**을 함께 제공하는 오픈소스 할 일 관리 워크스페이스입니다.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

---

## 빠른 시작 (데스크톱 앱 다운로드)

별도 서버나 계정 설정 없이 누구나 바로 설치해 사용할 수 있습니다.

1. [GitHub Releases](https://github.com/leekmny/Todo-list/releases)에서 최신 파일을 다운로드합니다.
   - **`Private-Todo-Setup-x.y.z.exe`** — Windows 설치 프로그램 (권장)
   - **`Private-Todo-x.y.z-portable.exe`** — 무설치 포터블 실행 파일
   - **`SHA256SUMS.txt`** — 다운로드 무결성 검증용 해시
2. 실행 즉시 **로컬 암호화 보관함(AES-256-GCM + OS 보안 키체인/DPAPI)** 으로 바로 사용할 수 있습니다.
3. 원하면 **사이드바 → 보안 · 클라우드 연결**에서:
   - **로컬 앱 잠금 비밀번호**(PBKDF2-SHA256 310,000회 + AES-256-GCM)를 설정하거나
   - 직접 배포한 **Cloudflare 웹 서버 주소(`https://...`)** 를 연결해 기기 간 실시간 동기화할 수 있습니다.

> **Windows SmartScreen 안내**: 미서명 오픈소스 배포 파일이므로 최초 실행 시 Windows 경고 창이 표시될 수 있습니다. **`추가 정보` → `실행`**을 선택하면 정상 설치됩니다.

---

## 주요 기능

- **3가지 보기 모드 (`1` / `2` / `3`)**
  - **리스트**: 드래그 앤 드롭 순서 변경, 인라인 하위 체크리스트
  - **칸반 보드**: `할 일` / `진행 중` / `완료` 열 간 드래그 이동 및 빠른 추가
  - **월간 캘린더**: 날짜별 마감 일정 확인 및 선택한 날짜에 바로 추가
- **빠른 자연어 입력**: 한 줄 입력으로 속성을 자동 파싱합니다.
  - 예: `운동하기 매일 #건강 내일 @21:00 !높음 *고정`
  - 지원 문법: `#카테고리`, `!높음`/`!보통`/`!낮음`/`p1`~`p3`, `오늘`/`내일`/`모레`/`다음주`/`YYYY-MM-DD`, `@HH:mm`(알람), `매일`/`매주`/`매월`, `*고정`
- **실시간 진행 중 표시**: 카드 강조 테두리·라이브 펄스 배지·상단 `지금 진행 중` 바·원클릭 시작/해제 버튼 및 사이드바 전용 `진행 중` 보기
- **예약 알람 & 리마인더**: 할 일별 알람 시각 설정(`30분 뒤` / `1시간 뒤` / `오늘 21:00` / `내일 09:00`), 소리 알림 + 인앱 스누즈(`10분 뒤` / `30분 뒤`) + 브라우저 및 데스크톱 OS 알림 지원
- **하위 체크리스트(Subtasks)**: 카드 안에서 바로 하위 항목을 추가하고 체크
- **반복 일정(Recurring Tasks)**: `매일` / `매주` / `매월` 할 일을 완료하면 다음 일정이 자동 생성 (하위 체크리스트 자동 초기화)
- **내장 뽀모도로 집중 타이머**: 25분 집중 / 5분·15분 휴식, 완료 알림음, 할 일별 누적 집중 시간 기록
- **간편한 로그인 유지**: Google · GitHub OAuth 2.0(PKCE) · 이메일 6자리 OTP 지원, 90일 자동 연장 세션 쿠키
- **데이터 주권**: JSON 백업/복원, 삭제 되돌리기(Undo), 다크/라이트 테마, 광고·트래커 없음

### 키보드 단축키
| 키 | 동작 |
| :---: | --- |
| `N` | 새 할 일 입력창 포커스 |
| `/` | 검색창 포커스 |
| `1` / `2` / `3` | 리스트 / 칸반 / 캘린더 전환 |
| `?` | 단축키 · 빠른 입력 도움말 |
| `Esc` | 열린 모달 닫기 |

---

## 보안 설계

상세한 보안 아키텍처와 위협 모델은 [SECURITY.md](./SECURITY.md)에서 확인할 수 있습니다.

- **데스크톱 앱**: Electron 샌드박스(`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`), `app://` 커스텀 프로토콜 + 경로 이탈 차단, **AES-256-GCM** 로컬 암호화(무결성 검증 + 원자적 저장)
- **웹 서버**: OAuth 2.0 + PKCE(`S256`) + HMAC `state` 쿠키(Login CSRF 방지), 검증된 이메일만 허용, 계정별(`owner_email`) 완전 데이터 격리, 엄격한 CSP/HSTS/COOP/CORP/CSRF 헤더, 512KB 요청 크기 제한

---

## Cloudflare 웹 앱 셀프 호스팅 가이드

### 1. 로컬 개발 실행

```bash
npm install
cp wrangler.example.jsonc wrangler.jsonc
cp .dev.vars.example .dev.vars
npm run dev
```

### 2. Cloudflare D1 생성 및 마이그레이션

```bash
npx wrangler d1 create private-todo-db
# 출력된 database_id를 로컬 전용 wrangler.jsonc에 입력 (.gitignore로 자동 제외됨)
npm run db:migrate:remote
```

### 3. 세션 키 및 접근 방식 설정

```bash
npm run generate-secret
npx wrangler secret put SESSION_SECRET
```

- **누구나 가입/로그인 가능하게 운영하려면**:
  ```bash
  npx wrangler secret put ALLOW_PUBLIC_SIGNUP   # true
  ```
- **특정 이메일만 허용해 개인/소그룹용으로 운영하려면**:
  ```bash
  npx wrangler secret put ALLOWED_EMAILS        # 예: me@example.com,friend@example.com
  ```

### 4. 로그인 방식 연동 (원하는 방식 선택 · 중복 사용 가능)

#### A. Google 로그인 (OAuth 2.0 + PKCE)
1. [Google Cloud Console → 사용자 인증 정보](https://console.cloud.google.com/apis/credentials)에서 **OAuth 2.0 클라이언트 ID(웹 애플리케이션)** 생성
2. **승인된 리디렉션 URI**에 아래 주소 등록:
   ```text
   https://<내-워커-도메인>/api/auth/oauth/google/callback
   ```
3. 시크릿 등록:
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```

#### B. GitHub 로그인 (OAuth 2.0 + PKCE)
1. [GitHub Developer Settings → OAuth Apps](https://github.com/settings/developers)에서 **New OAuth App** 생성
2. **Authorization callback URL**에 아래 주소 등록:
   ```text
   https://<내-워커-도메인>/api/auth/oauth/github/callback
   ```
3. 시크릿 등록:
   ```bash
   npx wrangler secret put GITHUB_CLIENT_ID
   npx wrangler secret put GITHUB_CLIENT_SECRET
   ```

#### C. 이메일 6자리 인증 코드 (Resend)
```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put MAIL_FROM   # 선택: 커스텀 도메인 발신자 (예: Private Todo <auth@yourdomain.com>)
```

#### D. Cloudflare Access (Zero Trust, 선택)
```bash
npx wrangler secret put CF_ACCESS_ENABLED       # true
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN   # your-team.cloudflareaccess.com
npx wrangler secret put CF_ACCESS_AUD           # Access Application Audience Tag
```

### 5. 배포

```bash
npm run deploy
```

---

## 데스크톱 설치 파일 직접 빌드

```bash
npm run desktop:dist:win   # release/Private-Todo-Setup-2.0.0.exe 및 portable.exe 생성
```

## 개발 및 검증 스크립트

```bash
npm run check:public  # 민감 파일·시크릿 패턴 유출 검사
npm run typecheck     # 클라이언트 + 워커 + Electron TypeScript 검사
npm test              # 인증 + OAuth + 멀티유저 격리 + 암호화 보관함 테스트
npm run build         # Cloudflare 웹 프로덕션 빌드
```

## 라이선스

[MIT License](./LICENSE)
