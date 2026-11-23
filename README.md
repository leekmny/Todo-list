# Private Todo

Cloudflare Workers + D1 기반으로 동작하는 **이메일 인증 전용 멀티유저 비밀 할 일 웹사이트**입니다.  
초대된 이메일(`ALLOWED_EMAILS`)만 로그인할 수 있으며, **각 계정의 할 일 데이터는 `owner_email` 단위로 완전히 격리**되어 서로의 목록을 절대 볼 수 없습니다.  
소스코드는 공개 GitHub 저장소에 안전하게 올릴 수 있도록 설계되었으며, 이메일 목록·세션 시크릿·메일 API 키·Cloudflare 개인 리소스 ID·로컬 DB 데이터는 모두 Git에서 제외됩니다.

## 주요 기능

- **계정별 독립 비밀 공간 (Multi-user Isolation)**
  - `ALLOWED_EMAILS`에 등록된 초대 사용자만 로그인 가능 (비공개 초대제)
  - 모든 조회·생성·수정·삭제·가져오기 API가 로그인한 `owner_email` 범위로 엄격히 격리됨
  - 허용 목록에서 이메일을 제거하면 기존 세션 쿠키도 즉시 무효화됨
- **이메일 인증 보안 (비밀번호 없음)**
  - **방식 1 — 앱 내장 6자리 이메일 OTP 로그인**: 허용된 이메일로 6자리 일회용 코드(10분 유효, 60초 쿨다운, 5회 실패 잠금) 발송 + `HttpOnly · SameSite=Strict · Secure` HMAC-SHA256 서명 세션 쿠키
  - **방식 2 — Cloudflare Access (One-Time PIN)**: 커스텀 도메인 없이 여러 친구 이메일로 무료 OTP 로그인 지원 + Worker에서 `Cf-Access-Jwt-Assertion` RS256 JWKS 서명 검증
  - 이메일 열거 방지, 검색엔진 차단(`robots.txt`, `X-Robots-Tag: noindex, nofollow, noarchive`), `Cache-Control: no-store`, CSRF Origin 검증
- **할 일 관리**
  - 빠른 추가(`N`), 검색(`/`), 상세 메모, 상태(`할 일` / `진행 중` / `완료`)
  - 우선순위(`높음` / `보통` / `낮음`), 마감일(`오늘` / `내일` / 지남 표시), 상단 고정, 카테고리 필터
  - 스마트 보기(`전체`, `오늘 집중`, `진행 중`, `중요 / 고정`, `완료됨`) 및 완료율 표시
  - JSON 백업 내보내기 / 복원, 삭제 되돌리기(Undo), 다크/라이트 모드

## 공개 GitHub 안전 원칙 (코드만 공개)

| 구분 | 파일 | Git 추적 여부 |
| --- | --- | --- |
| 소스코드 & 예시 템플릿 | `src/`, `migrations/`, `wrangler.example.jsonc`, `.dev.vars.example` | 공개됨 |
| 개인 Cloudflare 설정 | `wrangler.jsonc` (Worker 이름, D1 ID, 커스텀 도메인 등) | **제외 (`.gitignore`)** |
| 로컬 비밀키 | `.dev.vars`, `.env*` | **제외 (`.gitignore`)** |
| 로컬 DB & 백업 | `.wrangler/`, `*.sqlite`, `*backup*.json` | **제외 (`.gitignore`)** |

GitHub 푸시 전 민감 정보 검사:

```bash
npm run check:public
```

## 로컬 개발 실행

```bash
npm install
cp wrangler.example.jsonc wrangler.jsonc
cp .dev.vars.example .dev.vars
npm run dev
```

- `.dev.vars`에 `ALLOWED_EMAILS`와 `DEV_OTP_CONSOLE=true`를 설정하면 `localhost`에서 요청한 6자리 인증 코드가 터미널에 출력됩니다.

## Cloudflare 배포 방법

### 1. D1 데이터베이스 생성 및 마이그레이션

```bash
npx wrangler d1 create private-todo-db
# 출력된 database_id를 로컬 전용 wrangler.jsonc에 입력
npm run db:migrate:remote
```

### 2. 허용 이메일 목록 및 시크릿 등록

```bash
npm run generate-secret
npx wrangler secret put ALLOWED_EMAILS   # 예: me@example.com,friend1@example.com
npx wrangler secret put SESSION_SECRET
```

### 3. 이메일 발송 설정 (2가지 중 선택)

- **방법 A — Resend API (`RESEND_API_KEY`)**:
  - 1인 사용 시 무료 기본 발신(`onboarding@resend.dev`)으로 바로 동작합니다.
  - **친구 이메일로도 발송하려면** Resend에 본인 도메인을 인증하고 `MAIL_FROM` 시크릿(예: `Private Todo <auth@yourdomain.com>`)을 함께 설정해야 합니다.
- **방법 B — Cloudflare Access One-Time PIN (커스텀 도메인 없이 친구 여러 명 무료 지원)**:
  - Cloudflare Dashboard → **Workers & Pages** → Worker → **Cloudflare Access** 활성화 → 정책에 본인 및 친구 이메일 등록
  - `CF_ACCESS_ENABLED=true`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` 시크릿 등록

### 4. 배포

```bash
npm run deploy
```

## 검증 스크립트

```bash
npm run check:public  # 공개 저장소 민감 파일/패턴 검사
npm run typecheck     # 클라이언트 + 워커 TypeScript 검사
npm test              # 멀티유저 격리 + 이메일 인증 API 테스트
npm run build         # 프로덕션 빌드
```
