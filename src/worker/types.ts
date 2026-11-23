export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  ALLOWED_EMAIL?: string;
  SESSION_SECRET?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  DEV_OTP_CONSOLE?: string;
  CF_ACCESS_ENABLED?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}

export interface AppVariables {
  authMethod: 'email-otp' | 'cf-access';
  userEmail: string;
}
