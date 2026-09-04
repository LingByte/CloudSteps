import axios, { type AxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/auth-store'
import { formatAdminApiMessage } from '@/lib/api-message'
import { parseApiJson } from '@/lib/json-snowflake'

export type ApiResponse<T = unknown> = {
  code: number
  msg: string
  data: T
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30_000,
  transformResponse: [
    (data) => {
      if (typeof data !== 'string' || data.length === 0) return data
      try {
        return parseApiJson(data)
      } catch {
        return data
      }
    },
  ],
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().auth.accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const payload = error.response?.data as
      | { msg?: string; data?: { reason?: string } }
      | undefined
    const reason = payload?.data?.reason
    const msg = payload?.msg
    if (typeof reason === 'string' && reason.length > 0) {
      error.message = reason
    } else if (typeof msg === 'string' && msg.length > 0) {
      error.message = formatAdminApiMessage(msg)
    }
    return Promise.reject(error)
  }
)

function unwrap<T>(payload: ApiResponse<T>): ApiResponse<T> {
  if (payload.code !== 200) {
    const data = payload.data as { reason?: string } | undefined
    const reason = data?.reason
    const msg =
      typeof reason === 'string' && reason.length > 0
        ? reason
        : formatAdminApiMessage(payload.msg)
    const err = new Error(msg) as Error & {
      code: number
      msg: string
    }
    err.code = payload.code
    err.msg = msg
    throw err
  }
  return payload
}

export async function get<T>(url: string, config?: AxiosRequestConfig) {
  const { data } = await api.get<ApiResponse<T>>(url, config)
  return unwrap(data)
}

export async function post<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig
) {
  const { data } = await api.post<ApiResponse<T>>(url, body, config)
  return unwrap(data)
}

export async function put<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig
) {
  const { data } = await api.put<ApiResponse<T>>(url, body, config)
  return unwrap(data)
}

export async function del<T>(url: string, config?: AxiosRequestConfig) {
  const { data } = await api.delete<ApiResponse<T>>(url, config)
  return unwrap(data)
}

export async function getBlob(url: string, config?: AxiosRequestConfig) {
  const { data } = await api.get<Blob>(url, {
    ...config,
    responseType: 'blob',
    timeout: config?.timeout ?? 60_000,
  })
  if (!data.type.includes('application/json')) return data
  const text = await data.text()
  try {
    const payload = parseApiJson<ApiResponse>(text)
    if (typeof payload.code === 'number' && payload.code !== 200) {
      throw new Error(payload.msg || '请求失败')
    }
  } catch (err) {
    if (err instanceof SyntaxError) {
      return new Blob([text], { type: data.type })
    }
    throw err
  }
  return new Blob([text], { type: data.type })
}
