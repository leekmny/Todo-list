# Security Policy

Private Todo is designed from the ground up for personal and small-group privacy, both as a self-hosted Cloudflare Workers web app and as an installable desktop application.

## Security Architecture

### 1. Desktop App (Electron)
- **Strict Process Isolation**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, `webviewTag: false`.
- **No Raw IPC Exposure**: Only a minimal, strictly validated API is exposed via `contextBridge`.
- **Encrypted Local Storage at Rest**:
  - Todos are encrypted on disk using **AES-256-GCM** (random 12-byte IV and 16-byte authentication tag on every write, written atomically via temp file + rename).
  - Default mode wraps the random 256-bit vault key using the OS keyring (**Windows DPAPI / macOS Keychain / Linux Secret Service** via Electron `safeStorage`).
  - Optional **App Lock Passcode** mode derives the encryption key directly via **PBKDF2-SHA256 (310,000 iterations, random 16-byte salt)** and never stores the key on disk, with brute-force lockout (5 failures → 5-minute cooldown).
- **Navigation & Permission Lockdown**:
  - Local UI is served through a restricted `app://private-todo` protocol with path-traversal protection.
  - Arbitrary external navigations, popup windows, and hardware permissions (camera, microphone, geolocation, USB) are denied by default.
  - Optional Cloud Sync URLs strictly require `https://` (except `localhost` for development).

### 2. Web / Cloudflare Workers Backend
- **Per-User Data Isolation**: Every todo query and mutation is scoped by authenticated `owner_email`. Removing a user from `ALLOWED_EMAILS` immediately revokes their active session.
- **Passwordless Email Authentication**:
  - Supports 6-digit single-use Email OTPs (HMAC-SHA256 hashed in D1, 10-minute TTL, 60-second resend cooldown, max 5 verification attempts) and Cloudflare Access RS256 JWKS verification.
  - Constant-time comparisons prevent timing attacks; anti-enumeration responses prevent email discovery.
- **Session & CSRF Protection**:
  - `HttpOnly`, `SameSite=Lax`, `Secure` HMAC-SHA256 signed cookies with 90-day sliding renewal.
  - Strict `Origin` and `Sec-Fetch-Site` validation on every mutating (`POST`, `PATCH`, `DELETE`) endpoint.
- **Hardened HTTP Headers & Limits**:
  - Strict Content-Security-Policy (CSP), HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `X-Robots-Tag: noindex, nofollow, noarchive`, and `Cache-Control: no-store`.
  - Request payload size limit (512 KB) to prevent abuse.
- **Zero Telemetry & Public Repo Hygiene**:
  - No analytics, trackers, or hardcoded personal URLs/emails in public releases.
  - Automated `npm run check:public` scans tracked files to prevent committing secrets or personal configs.

## Reporting a Vulnerability

If you discover a security vulnerability, please open a private security advisory on GitHub or report it responsibly without publishing exploit details before a fix is released.
