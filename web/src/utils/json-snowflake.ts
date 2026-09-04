const SNOWFLAKE_FIELD_RE =
  /"(id|localId|userId|user_id|studentId|bookId|wordId|wordBookId|appointmentId|sessionId|recordId|teacherId)":\s*(\d{16,})/g

/** Quote bare 16+ digit numbers inside known ID arrays (skip already-quoted strings). */
const SNOWFLAKE_ARRAY_RE =
  /"(sessionIds|session_ids)":\s*\[([^\]]*)]/g

function quoteLargeIntsInArrayBody(body: string): string {
  // Only touch unquoted numbers: [123...] or ,123... — never "123..."
  return body.replace(/(^|[^\d"])(\d{16,})(?=[^\d"]|$)/g, '$1"$2"')
}

/** Parse API JSON while preserving snowflake IDs as strings (JS Number loses precision). */
export function parseApiJson<T = unknown>(text: string): T {
  const patched = text
    .replace(SNOWFLAKE_FIELD_RE, '"$1":"$2"')
    .replace(SNOWFLAKE_ARRAY_RE, (_m, key: string, body: string) => {
      return `"${key}":[${quoteLargeIntsInArrayBody(body)}]`
    })
  return JSON.parse(patched) as T
}

/** Normalize a snowflake / large numeric ID for URLs and API payloads. Never use Number(). */
export function normalizeSnowflakeId(raw: string | number | null | undefined): string {
  if (raw == null) return ""
  const text = String(raw).trim()
  if (!text || text === "0") return ""
  return text
}

export function isValidSnowflakeId(raw: string | number | null | undefined): boolean {
  const id = normalizeSnowflakeId(raw)
  return /^\d+$/.test(id)
}

export function sameSnowflakeId(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): boolean {
  const left = normalizeSnowflakeId(a)
  const right = normalizeSnowflakeId(b)
  return left !== "" && left === right
}
