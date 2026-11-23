# Private Todo

**데스크톱 설치 프로그램(Windows/macOS/Linux)** 과 **Cloudflare Workers + D1 웹 앱**을 모두 지원하는 암호화 기반 개인·소그룹 할 일 관리 워크스페이스입니다.

## 다운로드 및 바로 사용하기 (누구나 무료 · 서버 설정 불필요)

1. [GitHub Releases](../../releases)에서 최신 설치 파일(`Private-Todo-Setup-x.y.z.exe` 또는 무설치 `portable.exe`)을 다운로드합니다.
2. 실행 즉시 **오프라인 로컬 암호화 보관함(AES-256-GCM + Windows DPAPI / OS 키체인)** 으로 바로 사용할 수 있습니다.
3. 원하면 사이드바의 **보안 · 클라우드 연결** 메뉴에서:
   - **로컬 앱 잠금 비밀번호**(PBKDF2-SHA256 310,000회 + AES-256-GCM)를 켜거나
   - 직접 배포한 **Cloudflare Worker URL**을 연결해 PC/웹 간 실시간 동기화할 수 있습니다.

## 주요 기능

- **3가지 보기 모드**: 리스트(드래그 앤 드롭 정렬) · **칸반 보드**(열 간 드래그 이동) · **월간 캘린더**(날짜별 일정 추가)
- **빠른 자연어 입력**: `운동하기 매일 #건강 내일 !높음 *고정` 처럼 한 줄로 카테고리·마감일·우선순위·반복·고정 자동 인식
- **하위 체크리스트(Subtasks)**: 카드 안에서 바로 하위 항목 체크 및 추가
- **반복 일정(Recurring Tasks)**: `매일 / 매주 / 매월` 설정 시 완료 체크와 동시에 다음 일정 자동 생성
- **내장 뽀모도로 집중 타이머**: 25분 집중 / 5분·15분 휴식, 완료 알림음, 할 일별 누적 집중 시간 자동 기록
- **편리한 로그인 유지**: 웹/클라우드 모드에서 90일 자동 연장 세션 쿠키(`SameSite=Lax`, `HttpOnly`, `Secure`) 지원
- **단축키**: `N` 새 할 일, `/` 검색, `1/2/3` 리스트·칸반·캘린더 전환, `?` 도움말
- **데이터 주권**: JSON 백업/복원, 삭제 되돌리기(Undo), 다크/라이트 모드, 광고·트래커 없음

## 보안 설계

자세한 보안 아키텍처는 [SECURITY.md](./SECURITY.md)를 참고하세요.

- **데스크톱 앱 보안**: Electron `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `app://` 커스텀 프로토콜 + 경로 이탈 차단, 외부 내비게이션/팝업/하드웨어 권한 차단, **AES-256-GCM 암호화 로컬 저장(무결성 태그 검증)**
- **웹/Cloudflare 서버 보안**: `owner_email` 기반 계정별 완전 격리, 이메일 OTP(HMAC-SHA256 해시 + 5회 실패 잠금) 및 Cloudflare Access RS256 JWKS 검증, 엄격한 CSP/HSTS/COOP/CORP/CSRF 헤더, 512KB 페이로드 제한, 검색엔진 색인 차단(`robots.txt`, `X-Robots-Tag: noindex`)

## 직접 Cloudflare 웹 서버로 배포하기 (선택)

### 1. 로컬 개발
```bash
npm install
cp wrangler.example.jsonc wrangler.jsonc
cp .dev.vars.example .dev.vars
npm run dev
```

### 2. Cloudflare D1 생성 · 마이그레이션 · 시크릿 등록
```bash
npx wrangler d1 create private-todo-db
# 생성된 database_id를 로컬 전용 wrangler.jsonc에 입력 (Git 제외됨)
npm run db:migrate:remote
npm run generate-secret

npx wrangler secret put ALLOWED_EMAILS   # 쉼표 구분 허용 이메일 목록
npx wrangler secret put SESSION_SECRET
npx wrangler secret put RESEND_API_KEY   # 또는 Cloudflare Access 시크릿 설정
npm run deploy
```

> **참고**: 누구나 이메일 인증으로 가입 가능한 공개 서버로 운영하려면 `ALLOW_PUBLIC_SIGNUP=true`와 인증된 도메인의 `MAIL_FROM`을 설정하세요. 기본값은 **초대된 이메일만 허용(fail-closed)** 입니다.

## 데스크톱 설치 프로그램 직접 빌드하기

```bash
npm run desktop:dist:win   # release/Private-Todo-Setup-2.0.0.exe 및 portable.exe 생성
```

## 검증 스크립트

```bash
npm run check:public  # 공개 저장소 민감 파일/패턴 검사
npm run typecheck     # 클라이언트 + 워커 + Electron TypeScript 검사
npm test              # 인증 + 멀티유저 격리 + 암호화 보관함 테스트
npm run build         # Cloudflare 웹 프로덕션 빌드
```
