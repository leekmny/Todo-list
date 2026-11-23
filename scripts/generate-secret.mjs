import crypto from 'node:crypto';

const sessionSecret = crypto.randomBytes(32).toString('hex');

console.log('새 SESSION_SECRET이 생성되었습니다 (절대 Git에 커밋하지 마세요):\n');
console.log(sessionSecret);
console.log('\nCloudflare Secret 등록 명령어:');
console.log('  npx wrangler secret put ALLOWED_EMAILS   # 쉼표로 구분된 허용 이메일 목록');
console.log('  npx wrangler secret put SESSION_SECRET');
console.log('  npx wrangler secret put RESEND_API_KEY   # 앱 내장 이메일 OTP 사용 시');
