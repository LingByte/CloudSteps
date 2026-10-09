/**
 * Login 页面 — 对齐 web/src/pages/Login.tsx。
 *
 * 功能:
 *  - 登录/注册切换
 *  - 密码登录 / 邮箱验证码登录
 *  - 图形验证码(CaptchaWidget)
 *  - 登录成功后跳转首页
 *
 * 小程序适配:
 *  - 用 Taro 组件替代 DOM input/button
 *  - 用 Taro.switchTab 跳转 tabBar 页(替代 react-router navigate)
 *  - timezone 用 Intl.DateTimeFormat(小程序环境支持)
 */
import { useEffect, useRef, useState } from 'react'
import { formatAuthErrorMessage } from '../../utils/authErrors'
import { View, Text, Input, Image, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { CloudButton } from '../../components/button'
import CaptchaWidget from '../../components/captcha'
import {
  loginWithEmailCode,
  loginWithPassword,
  registerUser,
  sendEmailCode,
  type CaptchaFields,
  type LoginResponseData,
  type User,
} from '../../api/auth'
import { useAuthStore } from '../../stores/authStore'
import './index.scss'

type Screen = 'login' | 'register'
type Method = 'password' | 'email'

function isEmail(value: string) {
  const v = value.trim()
  return v.includes('@') && !v.startsWith('@') && !v.endsWith('@')
}

function pickToken(data?: LoginResponseData | null) {
  return (
    data?.token ||
    data?.authToken ||
    data?.user?.token ||
    data?.user?.authToken ||
    data?.user?.AuthToken ||
    ''
  )
}

export default function Login() {
  const doLogin = useAuthStore((s) => s.login)
  const isLoading = useAuthStore((s) => s.isLoading)

  const [screen, setScreen] = useState<Screen>('login')
  const [method, setMethod] = useState<Method>('password')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [codeWait, setCodeWait] = useState(0)
  const [captchaFields, setCaptchaFields] = useState<CaptchaFields | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const lastSubmitTsRef = useRef(0)
  const captchaKeyRef = useRef(0)

  const isSubmitting = isLoading || submitting
  const registering = screen === 'register'
  // Register is username+password only; email-code is a login method.
  const useEmail = !registering && method === 'email'

  const refreshCaptcha = () => {
    captchaKeyRef.current += 1
    setCaptchaFields(null)
  }

  useEffect(() => {
    setErrorText(null)
    setCode('')
  }, [screen, method])

  useEffect(() => {
    if (codeWait <= 0) return
    const t = setTimeout(() => setCodeWait((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [codeWait])

  const finishLogin = async (token: string, rawUser: any) => {
    const userForStore: User | undefined = rawUser
      ? {
          id: rawUser.id,
          email: rawUser.email || rawUser.username || '',
          displayName: rawUser.displayName ?? rawUser.DisplayName,
          avatar: rawUser.avatar,
          role: rawUser.role,
          timezone: rawUser.timezone ?? '',
          createdAt: rawUser.createdAt ?? '',
          updatedAt: rawUser.updatedAt ?? '',
          lastLogin: rawUser.lastLogin ?? '',
          hasFilledDetails: rawUser.hasFilledDetails ?? false,
          emailNotifications: rawUser.emailNotifications ?? false,
        }
      : undefined

    const ok = await doLogin(token, userForStore)
    if (!ok) {
      setErrorText('登录失败:无法获取用户信息')
      refreshCaptcha()
      return
    }
    // 登录成功,跳转首页(tabBar 页用 switchTab)
    Taro.switchTab({ url: '/pages/home/index' })
  }

  const onSendCode = async () => {
    const email = account.trim()
    if (!isEmail(email)) {
      setErrorText('请输入有效邮箱')
      return
    }
    if (codeWait > 0) return
    setErrorText(null)
    try {
      const res = await sendEmailCode({ email })
      if (res.code !== 200) {
        setErrorText(formatAuthErrorMessage(res.msg, '验证码发送失败'))
        return
      }
      setCodeWait(60)
      Taro.showToast({ title: '验证码已发送', icon: 'none' })
    } catch (e: any) {
      setErrorText(formatAuthErrorMessage(e?.msg || e?.message, '验证码发送失败'))
    }
  }

  const onSubmit = async () => {
    const now = Date.now()
    if (isSubmitting || now - lastSubmitTsRef.current < 1000) return
    lastSubmitTsRef.current = now
    setErrorText(null)

    const identity = account.trim()
    if (!identity) {
      setErrorText(useEmail ? '请输入邮箱' : '请输入账号')
      return
    }
    if (useEmail && !isEmail(identity)) {
      setErrorText('请输入有效邮箱')
      return
    }
    if (useEmail && !code.trim()) {
      setErrorText('请输入邮箱验证码')
      return
    }
    if (!useEmail && !password) {
      setErrorText('请输入密码')
      return
    }
    if (registering) {
      if ([...identity].length < 2) {
        setErrorText('账号至少 2 个字符')
        return
      }
      if ([...identity].length > 30) {
        setErrorText('账号过长')
        return
      }
      if (!password) {
        setErrorText('请设置密码')
        return
      }
      if (password.length < 6) {
        setErrorText('密码至少 6 位')
        return
      }
    }
    if (!captchaFields?.captchaId || captchaFields.captchaValue == null || captchaFields.captchaValue === '') {
      setErrorText('请完成验证码')
      return
    }

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const captcha = {
      captchaId: captchaFields.captchaId,
      captchaType: captchaFields.captchaType,
      captchaValue: captchaFields.captchaValue,
    }

    setSubmitting(true)
    try {
      if (screen === 'register') {
        const reg = await registerUser({
          username: identity,
          password,
          displayName: identity,
          timezone,
          source: 'miniapp',
          ...captcha,
        })
        if (reg.code !== 200) {
          setErrorText(formatAuthErrorMessage(reg.msg, '注册失败'))
          refreshCaptcha()
          return
        }
        setScreen('login')
        setMethod('password')
        setPassword('')
        setCode('')
        refreshCaptcha()
        setErrorText('注册成功,请登录')
        return
      }

      const res = useEmail
        ? await loginWithEmailCode({
            email: identity,
            code: code.trim(),
            timezone,
            authToken: true,
            ...captcha,
          })
        : await loginWithPassword({
            email: identity,
            password,
            timezone,
            authToken: true,
            ...captcha,
          })
      if (res.code !== 200) {
        setErrorText(formatAuthErrorMessage(res.msg, '登录失败'))
        refreshCaptcha()
        return
      }
      const token = pickToken(res.data)
      if (!token) {
        setErrorText('登录成功但未返回 token')
        refreshCaptcha()
        return
      }
      await finishLogin(token, res.data?.user)
    } catch (e: any) {
      setErrorText(
        formatAuthErrorMessage(
          e?.msg || e?.message,
          screen === 'register' ? '注册失败' : '登录失败',
        ),
      )
      refreshCaptcha()
    } finally {
      setSubmitting(false)
    }
  }

  const title = screen === 'login' ? '登录' : '注册'
  const subtitle = screen === 'login' ? '登录以继续陪练与单词训练' : '创建账号开始学习'

  return (
    <ScrollView scrollY className="login-scroll">
      <View className="login">
        <View className="login__container">
        {/* Header */}
        <View className="login__header">
          <Image className="login__logo" src="/assets/logo.png" mode="aspectFit" />
          <Text className="login__title">解忧</Text>
          <Text className="login__subtitle">{subtitle}</Text>
        </View>

        {screen === 'login' ? (
        <View className="login__methods">
          {(
            [
              { id: 'password' as const, label: '密码' },
              { id: 'email' as const, label: '邮箱验证码' },
            ]
          ).map((m) => (
            <View
              key={m.id}
              className={`login__method ${method === m.id ? 'login__method--active' : ''}`}
              onClick={() => setMethod(m.id)}
            >
              <Text>{m.label}</Text>
            </View>
          ))}
        </View>
        ) : (
          <View className="login__field">
            <Text className="login__subtitle">设置账号和密码即可注册，邮箱可在登录后绑定。</Text>
          </View>
        )}

        {/* Form */}
        <View className="login__form">
          {/* 账号/邮箱 */}
          <View className="login__field">
            <Text className="login__label">{useEmail ? '邮箱' : '账号'}</Text>
            <Input
              className="login__input"
              value={account}
              onInput={(e) => setAccount(e.detail.value)}
              placeholder={useEmail ? 'name@example.com' : registering ? '用户名（2-30 个字符）' : '用户名 / 邮箱'}
              placeholderClass="login__placeholder"
            />
          </View>

          {/* 邮箱验证码 */}
          {useEmail ? (
            <View className="login__field">
              <Text className="login__label">邮箱验证码</Text>
              <View className="login__code-row">
                <Input
                  className="login__input login__input--code"
                  type="number"
                  value={code}
                  onInput={(e) => setCode(e.detail.value)}
                  placeholder="6 位验证码"
                  placeholderClass="login__placeholder"
                  maxlength={6}
                />
                <View
                  className={`login__send-btn ${codeWait > 0 ? 'login__send-btn--disabled' : ''}`}
                  onClick={() => codeWait <= 0 && onSendCode()}
                >
                  <Text>{codeWait > 0 ? `${codeWait}s` : '发送验证码'}</Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* 密码 */}
          {(registering || !useEmail) ? (
            <View className="login__field">
              <Text className="login__label">{screen === 'register' ? '设置密码' : '密码'}</Text>
              <Input
                className="login__input"
                password
                value={password}
                onInput={(e) => setPassword(e.detail.value)}
                placeholder={screen === 'register' ? '至少 6 位' : '请输入密码'}
                placeholderClass="login__placeholder"
              />
            </View>
          ) : null}

          {/* 图形验证码 */}
          <View className="login__field">
            <Text className="login__label">图形验证码</Text>
            <CaptchaWidget key={captchaKeyRef.current} onChange={setCaptchaFields} />
          </View>

          {/* 错误提示 */}
          {errorText ? (
            <View className="login__error">
              <Text>{errorText}</Text>
            </View>
          ) : null}

          {/* 提交按钮 */}
          <CloudButton
            variant="brand"
            size="lg"
            onClick={onSubmit}
            loading={isSubmitting}
            loadingText={screen === 'register' ? '注册中...' : '登录中...'}
            disabled={isSubmitting}
            className="login__submit"
          >
            {title}
          </CloudButton>

          {/* 切换登录/注册 */}
          <View className="login__switch">
            <Text className="login__switch-text">
              {screen === 'login' ? '还没有账号?' : '已有账号?'}
            </Text>
            <Text
              className="login__switch-link"
              onClick={() => {
                if (screen === 'login') {
                  setScreen('register')
                  setMethod('password')
                } else {
                  setScreen('login')
                }
              }}
            >
              {screen === 'login' ? '点击注册' : '返回登录'}
            </Text>
          </View>
        </View>
      </View>
    </View>
    </ScrollView>
  )
}
