import { post, get, put, ApiResponse } from '@/utils/request'

// 用户注册表单类型
export interface RegisterUserForm {
  email: string
  password: string
  displayName?: string
  firstName?: string
  lastName?: string
  locale?: string
  timezone?: string
  source?: string
  captchaId?: string
  captchaCode?: string
}

// 邮箱验证码注册表单类型
export interface EmailRegisterForm {
  email: string
  password: string
  userName: string
  displayName: string
  code: string
  firstName?: string
  lastName?: string
  locale?: string
  timezone?: string
  source?: string
  captchaId?: string
  captchaCode?: string
}

// 验证码响应类型
export interface CaptchaResponse {
  id: string
  image: string
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
export interface PasswordLoginForm {
  email: string
  password: string
  timezone?: string
  remember?: boolean
  authToken?: boolean
  twoFactorCode?: string
  captchaId?: string
  captchaCode?: string
}

// 邮箱验证码登录表单类型
export interface EmailCodeLoginForm {
  email: string
  code: string
  timezone?: string
  remember?: boolean
  authToken?: boolean
  captchaId?: string
  captchaCode?: string
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
  createdAt?: string
  updatedAt?: string
  email: string
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
  return post<RegisterResponseData>('/auth/register', data)
}

// 邮箱验证码注册
export const registerUserByEmail = async (data: EmailRegisterForm): Promise<ApiResponse<RegisterResponseData>> => {
  return post<RegisterResponseData>('/auth/register/email', data)
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
  return post<LoginResponseData>('/auth/login/password', data)
}

// 邮箱验证码登录
export const loginWithEmailCode = async (data: EmailCodeLoginForm): Promise<ApiResponse<LoginResponseData>> => {
  return post<LoginResponseData>('/auth/login/email', data)
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

// 修改密码
export const changePassword = async (data: ChangePasswordRequest): Promise<ApiResponse<{ logout?: boolean }>> => {
  return post<{ logout?: boolean }>('/auth/change-password', data)
}

// 发送手机验证码（手机号需已在个人资料中填写）
export const sendPhoneVerification = async (): Promise<ApiResponse<null>> => {
  return post<null>('/auth/send-phone-verification')
}

// 验证手机验证码
export const verifyPhone = async (code: string): Promise<ApiResponse<null>> => {
  return post<null>('/auth/verify-phone', { code })
}

// 更新通知设置
export const updateNotificationSettings = async (settings: NotificationSettings): Promise<ApiResponse<null>> => {
  return put<null>('/auth/notification-settings', settings)
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

// 获取图形验证码
export const getCaptcha = async (): Promise<ApiResponse<CaptchaResponse>> => {
  return get<CaptchaResponse>('/auth/captcha')
}

// 验证图形验证码
export const verifyCaptcha = async (id: string, code: string): Promise<ApiResponse<{ valid: boolean }>> => {
  return post<{ valid: boolean }>('/auth/captcha/verify', { id, code })
}

// 忘记密码 - 发送重置密码邮件
export const forgotPassword = async (email: string): Promise<ApiResponse<null>> => {
  return post<null>('/auth/reset-password', { email })
}

// 重置密码确认
export const resetPasswordConfirm = async (token: string, password: string): Promise<ApiResponse<null>> => {
  return post<null>('/auth/reset-password/confirm', { token, password })
}
