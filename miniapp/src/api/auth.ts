/**
 * Auth API — 对齐 web/src/api/auth.ts。
 * 只搬小程序登录/注册需要的接口,其他(头像上传/活动记录等)后续按需补。
 */
import Taro from '@tarojs/taro'
import { get, post, put } from '../utils/request'
import type { ApiResponse } from '../types/api'

// ============ 类型 ============

export interface CaptchaFields {
  captchaId?: string
  captchaType?: string
  captchaValue?: any
}

export interface CaptchaResponse {
  id: string
  type: string
  data: Record<string, any>
}

export interface User {
  id?: string | number
  ID?: number
  email: string
  account?: string
  displayName?: string
  firstName?: string
  lastName?: string
  phone?: string
  gender?: string
  city?: string
  region?: string
  extra?: string
  timezone: string
  avatar?: string
  role?: 'user' | 'admin'
  createdAt: string
  updatedAt: string
  lastLogin: string
  loginCount?: number
  lastPasswordChange?: string
  profileComplete?: number
  streakDays?: number
  hasFilledDetails: boolean
  emailNotifications: boolean
  pushNotifications?: boolean
  systemNotifications?: boolean
  autoCleanUnreadEmails?: boolean
  reviewCurvePreset?: 'times3' | 'times5' | 'times7' | 'times10' | 'standard' | 'interval3' | 'interval5' | 'interval10'
  twoFactorEnabled?: boolean
  emailVerified?: boolean
}

export interface LoginResponseData {
  token?: string
  authToken?: string
  user?: {
    id?: number | string
    displayName?: string
    DisplayName?: string
    email?: string
    timezone?: string
    token?: string
    authToken?: string
    AuthToken?: string
    requiresTwoFactor?: boolean
    [key: string]: any
  }
  [key: string]: any
}

export interface RegisterResponseData {
  email: string
  displayName?: string
  timezone?: string
  hasFilledDetails?: boolean
  activation?: boolean
}

export interface PasswordLoginForm extends CaptchaFields {
  email: string
  password: string
  timezone?: string
  remember?: boolean
  authToken?: boolean
  twoFactorCode?: string
}

export interface EmailCodeLoginForm extends CaptchaFields {
  email: string
  code: string
  timezone?: string
  remember?: boolean
  authToken?: boolean
}

export interface RegisterUserForm extends CaptchaFields {
  username?: string
  email?: string
  password: string
  displayName?: string
  timezone?: string
  source?: string
}

export interface EmailRegisterForm extends CaptchaFields {
  email: string
  password: string
  userName: string
  displayName: string
  code: string
  username?: string
  timezone?: string
  source?: string
}

export interface SendEmailCodeRequest {
  email: string
  clientIp?: string
  userAgent?: string
}

// ============ API 函数 ============

/** 密码登录 */
export function loginWithPassword(data: PasswordLoginForm): Promise<ApiResponse<LoginResponseData>> {
  return post<LoginResponseData>('/auth/login/password', {
    ...data,
    username: data.email,
  })
}

/** 邮箱验证码登录 */
export function loginWithEmailCode(data: EmailCodeLoginForm): Promise<ApiResponse<LoginResponseData>> {
  return post<LoginResponseData>('/auth/login/email', {
    email: data.email,
    username: data.email,
    code: data.code,
    timezone: data.timezone,
    remember: data.remember,
    authToken: true,
    captchaId: data.captchaId,
    captchaType: data.captchaType,
    captchaValue: data.captchaValue,
  })
}

/** 用户名注册 */
export function registerUser(data: RegisterUserForm): Promise<ApiResponse<RegisterResponseData>> {
  const username = (data.username || data.email || '').trim()
  return post<RegisterResponseData>('/auth/register', {
    username,
    password: data.password,
    displayName: data.displayName || username,
    timezone: data.timezone,
    captchaId: data.captchaId,
    captchaType: data.captchaType,
    captchaValue: data.captchaValue,
    source: data.source || 'miniapp',
  })
}

/** 邮箱验证码注册 */
export function registerUserByEmail(data: EmailRegisterForm): Promise<ApiResponse<RegisterResponseData>> {
  const email = data.email.trim()
  return post<RegisterResponseData>('/auth/register/email', {
    username: email,
    email,
    userName: data.userName || email,
    displayName: data.displayName || email.split('@')[0],
    password: data.password,
    code: data.code,
    timezone: data.timezone,
    captchaId: data.captchaId,
    captchaType: data.captchaType,
    captchaValue: data.captchaValue,
    source: data.source || 'miniapp',
  })
}

/** 发送邮箱验证码 */
export function sendEmailCode(data: SendEmailCodeRequest): Promise<ApiResponse<null>> {
  return post<null>('/auth/send/email', data)
}

/** 获取用户信息 */
export function getUserInfo(): Promise<ApiResponse<User>> {
  return get<User>('/auth/info')
}

/** 登出 */
export function logoutUser(): Promise<ApiResponse<null>> {
  return get<null>('/auth/logout')
}

/** 获取验证码(随机类型) */
export function getCaptcha(): Promise<ApiResponse<CaptchaResponse>> {
  return get<CaptchaResponse>('/auth/captcha')
}

/** 验证验证码 */
export function verifyCaptcha(payload: CaptchaFields): Promise<ApiResponse<{ valid: boolean }>> {
  return post<{ valid: boolean }>('/auth/captcha/verify', payload)
}

/** 忘记密码 - 发送重置邮件 */
export function forgotPassword(email: string): Promise<ApiResponse<null>> {
  return post<null>('/auth/reset-password', { email })
}

/** 更新用户信息 */
export function updateCurrentUser(data: Partial<User>): Promise<ApiResponse<User>> {
  return put<User>('/auth/update', data)
}

/** 修改密码 */
export function changePassword(data: {
  currentPassword?: string
  oldPassword?: string
  newPassword: string
  confirmPassword?: string
}): Promise<ApiResponse<{ logout?: boolean }>> {
  return post<{ logout?: boolean }>('/auth/change-password', data)
}

/** 绑定/换绑邮箱 */
export function bindEmail(email: string, code: string): Promise<ApiResponse<{ email: string }>> {
  return post<{ email: string }>('/auth/bind-email', { email: email.trim(), code: code.trim() })
}

/** 发送绑定邮箱验证码 */
export function sendBindEmailCode(email: string): Promise<ApiResponse<null>> {
  return post<null>('/auth/send/bind-email', { email: email.trim() })
}

/** 更新通知设置 */
export function updateNotificationSettings(settings: {
  emailNotifications?: boolean
  pushNotifications?: boolean
  systemNotifications?: boolean
  autoCleanUnreadEmails?: boolean
}): Promise<ApiResponse<null>> {
  return put<null>('/auth/notification-settings', settings)
}

/** 用户活动记录 */
export interface UserActivity {
  id: number
  action: string
  target: string
  details: string
  ipAddress: string
  userAgent: string
  device: string
  browser: string
  os: string
  location: string
  createdAt: string
}

/** 获取账号安全/活动记录 */
export function getUserActivity(params?: {
  page?: number
  limit?: number
  action?: string
}): Promise<ApiResponse<{ activities: UserActivity[]; pagination: any }>> {
  return get<{ activities: UserActivity[]; pagination: any }>('/auth/activity', params as any)
}

/** 上传头像(小程序用 Taro.uploadFile,这里返回封装函数) */
export function uploadAvatar(filePath: string): Promise<ApiResponse<{ avatar: string }>> {
  return new Promise((resolve, reject) => {
    const { getApiBaseURL } = require('../config/apiConfig')
    const { getToken } = require('../utils/request')
    const token = getToken()
    Taro.uploadFile({
      url: `${getApiBaseURL()}/auth/avatar/upload`,
      filePath,
      name: 'avatar',
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (res) => {
        try {
          const data = JSON.parse(res.data)
          resolve(data)
        } catch {
          reject({ code: -1, msg: '头像上传失败', data: null })
        }
      },
      fail: (err) => {
        reject({ code: -1, msg: err.errMsg || '头像上传失败', data: null })
      },
    })
  })
}
