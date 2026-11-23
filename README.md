# Private Todo

Cloudflare Workers + D1 기반으로 동작하는 **이메일 인증 전용 개인 할 일 관리 웹사이트**입니다.  
소스코드는 공개 GitHub 저장소에 안전하게 올릴 수 있도록 설계되었으며, 이메일 주소·세션 시크릿·메일 API 키·Cloudflare 개인 리소스 ID·로컬 DB 데이터는 모두 Git에서 제외됩니다.

## 주요 기능

- **이메일 인증 보안 (비밀번호 없음)**
  - **방식 1 — Cloudflare Access (One-Time PIN) 이메일 인증**: 커스텀 도메인이나 외부 메일 서비스 없이 `*.workers.dev`에서 Cloudflare가 직접 6자리 이메일 인증 코드를 발송하고, Worker가 `Cf-Access-Jwt-Assertion` 서명(RS256 JWKS) 및 허용 이메일을 검증합니다.
  - **방식 2 — 앱 내장 6자리 이메일 OTP 로그인**: 허용된 이메일(`ALLOWED_EMAIL`)로 6자리 일회용 인증 코드(10분 유효, 60초 재발송 쿨다운, 5회 실패 잠금)를 발송하고 `HttpOnly · SameSite=Strict · Secure` HMAC-SHA256 서명 세션 쿠키를 발급합니다.
  - 이메일 열거 방지(미허용 이메일도 동일 응답), 검색엔진 색인 차단(`robots.txt`, `X-Robots-Tag: noindex, nofollow, noarchive`), `Cache-Control: no-store`, CSRF Origin 검증
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

GitHub 푸시 전 언제든 민감 정보 포함 여부를 검사할 수 있습니다:

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

- `.dev.vars`에 `ALLOWED_EMAIL`과 `DEV_OTP_CONSOLE=true`가 설정되어 있으면, 로컬(`localhost`)에서 인증 코드 요청 시 터미널 콘솔에 6자리 코드가 출력됩니다.

## Cloudflare 배포 방법

### 1. D1 데이터베이스 생성 및 원격 마이그레이션

```bash
npx wrangler d1 create private-todo-db
# 출력된 database_id를 로컬 전용 wrangler.jsonc에 입력
npm run db:migrate:remote
```

### 2. 공통 Secret 등록

```bash
npm run generate-secret
npx wrangler secret put ALLOWED_EMAIL    # 본인 이메일 주소
npx wrangler secret put SESSION_SECRET   # 생성된 랜덤 64자리 시크릿
```

### 3. 이메일 인증 활성화 (2가지 중 선택)

#### 방법 A: Cloudflare Access One-Time PIN (무료, 외부 메일 키 불필요 — 추천)
1. Cloudflare Dashboard → **Workers & Pages** → 배포된 Worker 선택 → **Settings** → **Domains & Routes**에서 **Cloudflare Access** 활성화
2. **Zero Trust** → **Access** → **Applications**에서 해당 Worker 앱의 정책에 본인 이메일만 허용(Include: Emails)하고 로그인 방식으로 **One-time PIN** 선택
3. 아래 3개 시크릿을 Worker에 등록:

```bash
npx wrangler secret put CF_ACCESS_ENABLED       # true
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN   # your-team.cloudflareaccess.com
npx wrangler secret put CF_ACCESS_AUD           # Access 앱의 Audience Tag
```

#### 방법 B: 앱 내장 6자리 이메일 OTP (Resend 무료 키)
```bash
npx wrangler secret put RESEND_API_KEY          # re_...
# (선택) 커스텀 도메인 발신자 사용 시
npx wrangler secret put MAIL_FROM               # Private Todo <auth@yourdomain.com>
```

### 4. 배포

```bash
npm run deploy
```

## 검증 스크립트

```bash
npm run check:public  # 공개 저장소 민감 파일/패턴 검사
npm run typecheck     # 클라이언트 + 워커 TypeScript 검사
npm test              # 이메일 인증 + API 통합 테스트
npm run build         # 프로덕션 빌드
```
