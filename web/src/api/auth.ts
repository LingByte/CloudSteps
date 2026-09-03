import { post, get, put, ApiResponse } from '../utils/request'

// 验证码字段（嵌入各表单）
export interface CaptchaFields {
  captchaId?: string
  captchaType?: string
  captchaValue?: any
}

// 用户注册表单类型
export interface RegisterUserForm extends CaptchaFields {
  /** 账号（用户名），兼容旧字段 email */
  username?: string
  email?: string
  password: string
  displayName?: string
  firstName?: string
  lastName?: string
  locale?: string
  timezone?: string
  source?: string
  inviteCode?: string
}

// 邮箱验证码注册表单类型
export interface EmailRegisterForm extends CaptchaFields {
  email: string
  password: string
  userName: string
  displayName: string
  code: string
  username?: string
  firstName?: string
  lastName?: string
  locale?: string
  timezone?: string
  source?: string
  inviteCode?: string
}

// 验证码响应类型
export interface CaptchaResponse {
  id: string
  type: string
  data: Record<string, any>
}

// 发送邮箱验证码请求类型
export interface SendEmailCodeRequest {
  email: string
  clientIp?: string
  userAgent?: string
}

// 用户登录表单类型
export interface LoginForm {
  email: string
  password: string
  twoFactorCode?: string
}

// 密码登录表单类型
export interface PasswordLoginForm extends CaptchaFields {
  email: string
  password: string
  timezone?: string
  remember?: boolean
  authToken?: boolean
  twoFactorCode?: string
}

// 邮箱验证码登录表单类型
export interface EmailCodeLoginForm extends CaptchaFields {
  email: string
  code: string
  timezone?: string
  remember?: boolean
  authToken?: boolean
}

// 登录响应数据类型
export interface LoginResponseData {
  token?: string
  user?: {
    id?: number | string
    createdAt?: string
    updatedAt?: string
    displayName?: string
    DisplayName?: string
    email?: string
    emailNotifications?: boolean
    firstName?: string
    hasFilledDetails?: boolean
    lastLogin?: string
    lastName?: string
    timezone?: string
    token?: string
    authToken?: string
    AuthToken?: string
    requiresTwoFactor?: boolean
    [key: string]: any
  }
  createdAt?: string
  updatedAt?: string
  displayName?: string
  DisplayName?: string
  email?: string
  emailNotifications?: boolean
  firstName?: string
  hasFilledDetails?: boolean
  lastLogin?: string
  lastName?: string
  timezone?: string
  requiresTwoFactor?: boolean
  requiresDeviceVerification?: boolean
  deviceId?: string
  message?: string
  suspiciousLogin?: boolean
  [key: string]: any
}

// 注册响应数据类型
export interface RegisterResponseData {
  token?: string
  authToken?: string
  user?: LoginResponseData['user']
  createdAt?: string
  updatedAt?: string
  email?: string
  username?: string
  emailNotifications?: boolean
  firstName?: string
  lastName?: string
  displayName?: string
  timezone?: string
  hasFilledDetails?: boolean
  activation?: boolean
  expired?: string
}

// 用户信息类型
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
  locale?: string
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

export interface ChangePasswordRequest {
  currentPassword?: string
  oldPassword?: string
  newPassword: string
  confirmPassword?: string
}

export interface NotificationSettings {
  emailNotifications?: boolean
  pushNotifications?: boolean
  systemNotifications?: boolean
  autoCleanUnreadEmails?: boolean
}

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

export interface UserActivityResponse {
  activities: UserActivity[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface UpdateUserRequest {
  email?: string
  account?: string
  phone?: string
  firstName?: string
  lastName?: string
  displayName?: string
  locale?: string
  timezone?: string
  gender?: string
  city?: string
  region?: string
  extra?: string
  avatar?: string
}

// 用户注册
export const registerUser = async (data: RegisterUserForm): Promise<ApiResponse<RegisterResponseData>> => {
  const username = (data.username || data.email || '').trim()
  return post<RegisterResponseData>('/auth/register', {
    username,
    password: data.password,
    displayName: data.displayName || username,
    timezone: data.timezone,
    captchaId: data.captchaId,
    captchaType: data.captchaType,
    captchaValue: data.captchaValue,
    source: data.source || 'web',
    inviteCode: data.inviteCode,
  })
}

// 邮箱验证码注册
export const registerUserByEmail = async (data: EmailRegisterForm): Promise<ApiResponse<RegisterResponseData>> => {
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
    source: data.source || 'web',
    inviteCode: data.inviteCode,
  })
}

// 发送邮箱验证码
export const sendEmailCode = async (data: SendEmailCodeRequest): Promise<ApiResponse<null>> => {
  return post<null>('/auth/send/email', data)
}

// 用户登录
export const loginUser = async (data: LoginForm): Promise<ApiResponse<LoginResponseData>> => {
  return post<LoginResponseData>('/auth/login/password', data)
}

// 密码登录
export const loginWithPassword = async (data: PasswordLoginForm): Promise<ApiResponse<LoginResponseData>> => {
  return post<LoginResponseData>('/auth/login/password', {
    ...data,
    username: data.email,
  })
}

// 邮箱验证码登录
export const loginWithEmailCode = async (data: EmailCodeLoginForm): Promise<ApiResponse<LoginResponseData>> => {
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

// 发送设备验证码
export const sendDeviceVerificationCode = async (data: { email: string; deviceId: string }): Promise<ApiResponse<null>> => {
  return post('/auth/devices/send-verification', data)
}

// 验证设备
export const verifyDevice = async (data: { email: string; deviceId: string; verifyCode: string }): Promise<ApiResponse<null>> => {
  return post('/auth/devices/verify', data)
}

// 获取用户信息
export const getUserInfo = async (): Promise<ApiResponse<User>> => {
  return get<User>('/auth/info')
}

// 更新当前用户信息
export const updateCurrentUser = async (data: UpdateUserRequest): Promise<ApiResponse<User>> => {
  return put<User>('/auth/update', data)
}

/** 上传头像到对象存储，返回头像 URL */
export const uploadAvatar = async (file: File): Promise<ApiResponse<{ avatar: string }>> => {
  const formData = new FormData()
  formData.append('avatar', file)
  return post<{ avatar: string }>('/auth/avatar/upload', formData)
}

// 修改密码
export const changePassword = async (data: ChangePasswordRequest): Promise<ApiResponse<{ logout?: boolean }>> => {
  return post<{ logout?: boolean }>('/auth/change-password', data)
}

// 更新通知设置
export const updateNotificationSettings = async (settings: NotificationSettings): Promise<ApiResponse<null>> => {
  return put<null>('/auth/notification-settings', settings)
}

export type ReviewCurvePreset = 'times3' | 'times5' | 'times7' | 'times10'

export const updateUserPreferences = async (data: {
  emailNotifications?: boolean
  autoCleanUnreadEmails?: boolean
  reviewCurvePreset?: ReviewCurvePreset
}): Promise<ApiResponse<null>> => {
  return put<null>('/auth/update/preferences', data)
}

// 获取账号安全/活动记录
export const getUserActivity = async (params?: {
  page?: number
  limit?: number
  action?: string
}): Promise<ApiResponse<UserActivityResponse>> => {
  return get<UserActivityResponse>('/auth/activity', { params })
}

// 刷新token
export const refreshToken = async (): Promise<ApiResponse<{ token: string }>> => {
  return post<{ token: string }>('/auth/refresh')
}

// 发送邮箱验证邮件
export const sendEmailVerification = async (): Promise<ApiResponse<null>> => {
  return post<null>('/auth/send-email-verification')
}

// 验证邮箱（通过URL中的token）
export const verifyEmail = async (token: string): Promise<ApiResponse<User>> => {
  return get<User>(`/auth/verify-email?token=${token}`)
}

// 登出 - 对应 GET /auth/logout
export const logoutUser = async (next?: string): Promise<ApiResponse<null>> => {
  const params = next ? { next } : undefined
  return get<null>('/auth/logout', { params })
}

// 获取验证码（随机类型）
export const getCaptcha = async (): Promise<ApiResponse<CaptchaResponse>> => {
  return get<CaptchaResponse>('/auth/captcha')
}

// 验证验证码
export const verifyCaptcha = async (payload: CaptchaFields): Promise<ApiResponse<{ valid: boolean }>> => {
  return post<{ valid: boolean }>('/auth/captcha/verify', payload)
}

// 忘记密码 - 发送重置密码邮件
export const forgotPassword = async (email: string): Promise<ApiResponse<null>> => {
  return post<null>('/auth/reset-password', { email })
}

// 重置密码确认
export const resetPasswordConfirm = async (token: string, password: string): Promise<ApiResponse<null>> => {
  return post<null>('/auth/reset-password/confirm', { token, password })
}

// 发送绑定邮箱验证码
export const sendBindEmailCode = async (email: string): Promise<ApiResponse<null>> => {
  return post<null>('/auth/send/bind-email', { email: email.trim() })
}

// 绑定/换绑邮箱
export const bindEmail = async (email: string, code: string): Promise<ApiResponse<{ email: string }>> => {
  return post<{ email: string }>('/auth/bind-email', { email: email.trim(), code: code.trim() })
}

// 注销当前账号（软删除，清空额度，教师会级联注销名下学员）
export const deactivateAccount = async (): Promise<ApiResponse<null>> => {
  return post<null>('/auth/deactivate')
}

export type WechatLoginStatus = 'pending' | 'confirmed' | 'expired'

export interface WechatLoginSessionData {
  sessionId: string
  loginCode?: string
  expiresIn: number
  qrUrl?: string
}

export interface WechatLoginStatusData {
  status: WechatLoginStatus
  token?: string
  user?: User
}

export const startWechatLoginSession = async (
  inviteCode?: string,
): Promise<ApiResponse<WechatLoginSessionData>> => {
  return post<WechatLoginSessionData>('/auth/wechat/login/session', {
    inviteCode: inviteCode?.trim() || '',
  })
}

export const verifyWechatLoginCode = async (payload: {
  sessionId: string
  code: string
}): Promise<ApiResponse<{ status: WechatLoginStatus }>> => {
  return post<{ status: WechatLoginStatus }>('/auth/wechat/login/verify', payload)
}

export const pollWechatLoginStatus = async (
  sessionId: string,
): Promise<ApiResponse<WechatLoginStatusData>> => {
  return get<WechatLoginStatusData>(`/auth/wechat/login/status?sessionId=${encodeURIComponent(sessionId)}`)
}
