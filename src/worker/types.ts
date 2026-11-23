export interface Env {
  DB: D1Database;
  AI?: Ai;
  AI_CATEGORY_MODEL?: string;
  ASSETS?: Fetcher;
  ALLOWED_EMAIL?: string;
  ALLOWED_EMAILS?: string;
  ALLOW_PUBLIC_SIGNUP?: string;
  SESSION_SECRET?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  DEV_OTP_CONSOLE?: string;
  CF_ACCESS_ENABLED?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

export interface AppVariables {
  authMethod: 'email-otp' | 'cf-access' | 'oauth-google' | 'oauth-github';
  userEmail: string;
}
