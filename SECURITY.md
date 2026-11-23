# Security Policy

Private Todo is an open-source, privacy-first todo workspace available both as a standalone desktop application and as a self-hostable Cloudflare Workers + D1 web application.

## Security Architecture

### 1. Desktop Application (Electron)
- **Strict Process Isolation**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, `allowRunningInsecureContent: false`, `webviewTag: false`.
- **Minimal Preload Bridge**: Only strictly typed IPC calls are exposed via `contextBridge`; raw `ipcRenderer` and Node APIs are never exposed to the renderer.
- **Encrypted Local Storage at Rest**:
  - Todos are encrypted on disk using **AES-256-GCM** with a fresh 12-byte random IV and 16-byte authentication tag on every write, written atomically via temp file + rename.
  - Default mode wraps the random 256-bit vault key using the OS keyring (**Windows DPAPI / macOS Keychain / Linux Secret Service** via Electron `safeStorage`).
  - Optional **App Lock Passcode** mode derives the encryption key directly via **PBKDF2-SHA256 (310,000 iterations, random 16-byte salt)** without storing any key on disk, and enforces brute-force lockout (5 failed attempts → 5-minute cooldown).
- **Navigation & Hardware Permission Lockdown**:
  - Local assets are served via a restricted `app://private-todo` protocol with path-traversal protection and strict CSP.
  - Hardware permissions (camera, microphone, geolocation, USB, etc.) and arbitrary popups/navigations are denied by default.
  - Optional Cloud Sync URLs strictly require `https://` (except `localhost` for development), and only permit trusted OAuth hosts (`accounts.google.com`, `github.com`, `*.cloudflareaccess.com`) during login.

### 2. Web / Cloudflare Workers Backend
- **Per-User Data Isolation**: Every todo query, mutation, reorder, and import is strictly scoped to the authenticated user's `owner_email`.
- **OAuth 2.0 + PKCE (Google & GitHub)**:
  - Uses PKCE (`S256` code challenge) and an HMAC-SHA256 signed, short-lived `HttpOnly` `state` cookie to prevent Login CSRF and authorization code interception.
  - Strictly requires verified email addresses (`email_verified === true` on Google, `verified === true` on GitHub `/user/emails`).
- **Passwordless Email OTP & Cloudflare Access**:
  - 6-digit single-use Email OTPs are stored as HMAC-SHA256 hashes in D1 (10-minute TTL, 60-second resend cooldown, max 5 attempts, per-IP brute-force lockout).
  - Constant-time comparisons and anti-enumeration responses protect against timing and account discovery attacks.
  - Optional Cloudflare Access support validates `Cf-Access-Jwt-Assertion` RS256 signatures against Cloudflare JWKS.
- **Flexible Access Control**:
  - Supports both open multi-user deployments (`ALLOW_PUBLIC_SIGNUP=true`) and restricted allowlist deployments (`ALLOWED_EMAILS`). Removing an email from `ALLOWED_EMAILS` immediately invalidates its active sessions.
- **Session & HTTP Hardening**:
  - `HttpOnly`, `SameSite=Lax`, `Secure` HMAC-SHA256 signed cookies with 90-day sliding renewal.
  - Explicit `Origin` and `Sec-Fetch-Site` CSRF validation on every `POST`, `PATCH`, and `DELETE` route.
  - Strict Content-Security-Policy (CSP), HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: no-store` on API routes, and a 512 KB request body limit (`413`).
- **Hardened File Attachments**:
  - Allowlisted safe extensions only (blocks executable/scriptable types like `.html`, `.svg`, `.exe`, `.js`, `.ps1`), filename sanitization, 1.5 MB per-file / 5-per-todo / 30 MB per-user quotas.
  - Downloads always enforce `Content-Security-Policy: default-src 'none'; sandbox`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, and `Content-Disposition: attachment` (except raster images explicitly loaded inline).
  - In the desktop app, each attachment file is encrypted individually with AES-256-GCM and re-encrypted when the vault passcode changes.
- **Scoped AI Auto-Categorization**:
  - Cloudflare Workers AI (`env.AI`) processes up to 200 characters of the title, 400 characters of notes, and 30 existing category names scoped to the signed-in user (`owner_email`). The worker separates these values from system instructions and sanitizes model output.
  - The create API classifies only when the caller sends `autoCategorize: true` and leaves the category empty. The composer lets users turn off classification for the current submission. Suggestion and bulk classification are separate actions. Offline desktop vault mode classifies locally.
- **Zero Telemetry & Public Repository Hygiene**:
  - No third-party analytics, ads, trackers, or hardcoded personal endpoints.
  - `npm run check:public` verifies that secrets and personal configuration files are never tracked in Git.

## Reporting a Vulnerability

If you discover a security vulnerability, please open a GitHub Security Advisory on this repository or report it privately before disclosing exploit details publicly.
