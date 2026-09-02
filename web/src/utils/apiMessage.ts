import i18n from "../i18n";

/** Strip optional `file.go:123: ` prefixes from backend errors. */
function normalizeApiMessage(msg: string): string {
  const trimmed = msg.trim();
  const m = trimmed.match(/^[A-Za-z0-9_./\\-]+:\d+:\s*(.+)$/);
  return m?.[1]?.trim() || trimmed;
}

/** Map common English backend fragments to existing locale keys. */
const EXACT_KEY_MAP: Record<string, string> = {
  "username has exists": "auth.username_exists",
  "username already exists": "auth.username_exists",
  "email has exists": "auth.email_already_bound",
  "email exists, please use another email": "auth.email_already_bound",
  "email already bound": "auth.email_already_bound_other",
  "user not exists": "auth.user_not_found",
  "user not found": "auth.user_not_found",
  unauthorized: "auth.invalid_credentials",
  "login failed": "auth.login_failed",
  "user no authorization to login": "auth.no_login_authorization",
  "user not allow login": "auth.no_login_authorization",
  "user not allow signup": "auth.user_not_found",
  "user not activated": "auth.user_not_found",
  "empty password": "login.enter_password",
  "empty email": "login.enter_email",
  "email required": "login.enter_email",
  "invalid email format": "login.invalid_email",
  "invalid verification code": "validation.code_invalid",
  "invalid or expired code": "validation.code_invalid",
  "invalid captcha": "validation.captcha_invalid",
  "captcha is required": "validation.captcha_required",
  "old password is required": "auth.old_password_required",
  "new password is required": "auth.new_password_required",
  "password too short": "common.password_too_short",
  "confirm password mismatch": "common.confirm_password_mismatch",
  forbidden: "common.forbidden",
  "forbidden access": "common.forbidden",
  "Too many requests; please try again later": "common.rate_limited",
};

const PATTERN_KEY_MAP: Array<{ re: RegExp; key: string }> = [
  { re: /username has exists|username already exists/i, key: "auth.username_exists" },
  { re: /email has exists|email exists/i, key: "auth.email_already_bound" },
  { re: /email already bound/i, key: "auth.email_already_bound_other" },
  { re: /user not exists|user not found/i, key: "auth.user_not_found" },
  { re: /unauthorized/i, key: "auth.invalid_credentials" },
  { re: /login failed/i, key: "auth.login_failed" },
  { re: /not allow login|no authorization to login/i, key: "auth.no_login_authorization" },
  { re: /invalid captcha|captcha is required/i, key: "validation.captcha_invalid" },
  { re: /invalid verification code|invalid or expired/i, key: "validation.code_invalid" },
  { re: /invalid email format/i, key: "login.invalid_email" },
  { re: /password too short|password must be at least/i, key: "common.password_too_short" },
  { re: /password must contain at least one lowercase/i, key: "login.password_need_lowercase" },
  { re: /password must contain at least one uppercase/i, key: "validation.password_need_uppercase" },
  { re: /password must contain at least one number/i, key: "validation.password_need_number" },
  { re: /too many requests|rate limit|registration rate limit|too many failed registration/i, key: "common.rate_limited" },
  { re: /token expired|invalid token|bad token|token required/i, key: "auth.invalid_token" },
];

function translateKey(key: string): string {
  if (i18n.exists(key)) return i18n.t(key);
  return key;
}

/**
 * Format API error `msg` for display using i18n when possible.
 * Falls back to raw message (e.g. backend already localized Chinese).
 */
export function formatApiMessage(msg?: string, fallbackKey = "common.operation_failed"): string {
  if (!msg?.trim()) return translateKey(fallbackKey);

  const normalized = normalizeApiMessage(msg);
  const lower = normalized.toLowerCase();

  if (/[\u4e00-\u9fff]/.test(normalized)) {
    return normalized;
  }

  if (i18n.exists(normalized)) {
    return i18n.t(normalized);
  }

  const exactKey = EXACT_KEY_MAP[normalized] || EXACT_KEY_MAP[lower];
  if (exactKey) return translateKey(exactKey);

  for (const { re, key } of PATTERN_KEY_MAP) {
    if (re.test(normalized)) return translateKey(key);
  }

  return normalized || translateKey(fallbackKey);
}

/** @deprecated Use formatApiMessage — kept for login/register compatibility. */
export function formatAuthErrorMessage(msg?: string, fallback?: string): string {
  if (!msg?.trim()) {
    return fallback ?? i18n.t("common.operation_failed");
  }
  return formatApiMessage(msg);
}
