import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN_FILES = [
  /^\.env($|\.(?!example$).*)/i,
  /^\.dev\.vars($|\.(?!example$).*)/i,
  /^wrangler\.(jsonc|json|toml)$/i,
  /^\.wrangler\//i,
  /\.(sqlite|sqlite3|db|db-shm|db-wal)$/i,
  /backup.*\.json$/i,
];

const SECRET_PATTERNS = [
  { name: 'Resend API key', regex: /\bre_[A-Za-z0-9]{20,}\b/ },
  { name: 'Cloudflare API token pattern', regex: /CLOUDFLARE_API_TOKEN\s*=\s*['"]?[A-Za-z0-9_-]{25,}/ },
  { name: 'Private key block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'Personal Gmail address', regex: /[A-Za-z0-9._%+-]+@gmail\.com/i },
];

function getCandidateFiles() {
  try {
    const out = execSync('git ls-files --cached --others --exclude-standard', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    console.log('Git 저장소가 아직 초기화되지 않아 파일 목록 검사를 건너뜁니다.');
    return null;
  }
}

function main() {
  const files = getCandidateFiles();
  if (files === null) return;

  const issues = [];

  for (const file of files) {
    const normalized = file.replace(/\\/g, '/');

    for (const pattern of FORBIDDEN_FILES) {
      if (pattern.test(normalized)) {
        issues.push(`금지된 민감/개인 설정 파일이 Git에 추적 중입니다: ${normalized}`);
      }
    }

    const fullPath = path.resolve(process.cwd(), file);
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) continue;
    if (normalized.startsWith('tests/') || normalized === 'scripts/check-public-safe.mjs') continue;

    const content = fs.readFileSync(fullPath, 'utf8');
    for (const { name, regex } of SECRET_PATTERNS) {
      if (regex.test(content)) {
        issues.push(`${normalized} 파일에서 민감 정보 패턴(${name})이 감지되었습니다.`);
      }
    }

    if (normalized === 'wrangler.example.jsonc') {
      const uuidMatch = content.match(/"database_id"\s*:\s*"([0-9a-f-]{36})"/i);
      if (uuidMatch && uuidMatch[1] !== '00000000-0000-0000-0000-000000000000') {
        issues.push('wrangler.example.jsonc에 실제 D1 database_id가 들어 있습니다.');
      }
    }
  }

  if (issues.length > 0) {
    console.error('\n[공개 저장소 안전 검사 실패]');
    for (const issue of issues) {
      console.error(`  - ${issue}`);
    }
    console.error('\nGitHub에 push하기 전에 위 항목을 제거하세요.');
    process.exit(1);
  }

  console.log(`[OK] 공개 저장소 안전 검사 통과 (${files.length}개 공개 대상 파일 확인)`);
}

main();
