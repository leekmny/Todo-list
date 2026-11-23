import crypto from 'node:crypto';

const sessionSecret = crypto.randomBytes(32).toString('hex');

console.log('새 SESSION_SECRET이 생성되었습니다 (절대 Git에 커밋하지 마세요):\n');
console.log(sessionSecret);
console.log('\nCloudflare Secret 등록 예시:');
console.log('  npx wrangler secret put SESSION_SECRET');
console.log('  npx wrangler secret put ALLOW_PUBLIC_SIGNUP   # 공개 서비스 운영 시 true (또는 ALLOWED_EMAILS 사용)');
console.log('  npx wrangler secret put GOOGLE_CLIENT_ID      # Google 로그인 사용 시');
console.log('  npx wrangler secret put GOOGLE_CLIENT_SECRET');
console.log('  npx wrangler secret put GITHUB_CLIENT_ID      # GitHub 로그인 사용 시');
console.log('  npx wrangler secret put GITHUB_CLIENT_SECRET');
console.log('  npx wrangler secret put RESEND_API_KEY        # 이메일 OTP 사용 시');
