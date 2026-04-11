import { getApiBaseURL } from '@/config/apiConfig'

/** 将相对资源路径补全为可请求的绝对 URL（音频、图片等） */
export function resolveMediaUrl(url?: string | null): string | null {
  if (!url?.trim()) return null
  const u = url.trim()
  if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('blob:')) return u
  const api = getApiBaseURL()
  const origin = api.replace(/\/api\/?$/, '')
  return u.startsWith('/') ? `${origin}${u}` : `${origin}/${u}`
}
