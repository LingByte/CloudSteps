/**
 * CaptchaWidget — 三端兼容（微信小程序 / H5 / RN）。
 *
 * 小程序 / H5：用 scss（captcha.scss）+ CSS 变量。
 * RN：用 style + JS Token。
 *
 * 适配小程序:用 Taro Image 组件显示验证码图片,Input 输入答案。
 * 只支持 image 和 math 两种类型(跳过 click/jigsaw/rotate/slider)。
 */
import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, Input, Image } from '@tarojs/components'
import { getCaptcha, type CaptchaResponse, type CaptchaFields } from '../../api/auth'
import { color, fontSize, size, radius, space, borderWidth, font } from '../../styles/tokens'
import './captcha.scss'

interface CaptchaWidgetProps {
  onChange: (fields: CaptchaFields | null) => void
}

const IS_RN = process.env.TARO_ENV === 'rn'

const SKIPPED_CAPTCHA_TYPES = new Set(['click', 'jigsaw', 'rotate', 'slider'])

/* ============ RN 端样式 ============ */
const rnStyles = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
  } as React.CSSProperties,
  input: {
    flex: 1,
    height: size.inputHeight,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: color.card,
    borderWidth: borderWidth.hairline,
    borderColor: color.input,
    color: color.charcoal,
    fontSize: fontSize.lg,
  } as React.CSSProperties,
  imageBtn: {
    width: 100,
    height: size.inputHeight,
    borderRadius: radius.md,
    borderWidth: borderWidth.hairline,
    borderColor: color.input,
    backgroundColor: color.card,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties,
  image: { width: '100%', height: '100%' } as React.CSSProperties,
  question: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: color.surfaceSoft,
    fontFamily: font.mono,
    fontSize: fontSize.md,
    color: color.charcoal,
  } as React.CSSProperties,
  refresh: {
    fontSize: fontSize.sm,
    color: color.mutedForeground,
  } as React.CSSProperties,
  error: {
    fontSize: fontSize.base,
    color: color.destructive,
  } as React.CSSProperties,
  retry: {
    fontSize: fontSize.sm,
    color: color.primary,
    marginLeft: space.sm,
  } as React.CSSProperties,
  loading: {
    fontSize: fontSize.sm,
    color: color.mutedForeground,
  } as React.CSSProperties,
}

export default function CaptchaWidget({ onChange }: CaptchaWidgetProps) {
  const [captcha, setCaptcha] = useState<CaptchaResponse | null>(null)
  const [value, setValue] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    setValue(null)
    onChange(null)
    try {
      const res = await getCaptcha()
      if (res.code === 200 && res.data) {
        if (SKIPPED_CAPTCHA_TYPES.has(res.data.type)) {
          // 跳过不支持的类型,重新获取
          refresh()
          return
        }
        setCaptcha(res.data)
      } else {
        setError(res.msg || '获取验证码失败')
      }
    } catch {
      setError('获取验证码失败')
    }
  }, [onChange])

  useEffect(() => {
    refresh()
  }, [refresh])

  const reportValue = useCallback(
    (v: any) => {
      setValue(v)
      if (captcha && v != null && v !== '') {
        onChange({
          captchaId: captcha.id,
          captchaType: captcha.type,
          captchaValue: v,
        })
      } else {
        onChange(null)
      }
    },
    [captcha, onChange],
  )

  if (error) {
    return (
      <View className="captcha" style={IS_RN ? {} : undefined}>
        <Text className="captcha__error" style={IS_RN ? rnStyles.error : undefined}>{error}</Text>
        <Text className="captcha__retry" style={IS_RN ? rnStyles.retry : undefined} onClick={refresh}>重试</Text>
      </View>
    )
  }

  if (!captcha) {
    return (
      <View className="captcha" style={IS_RN ? {} : undefined}>
        <Text className="captcha__loading" style={IS_RN ? rnStyles.loading : undefined}>加载中...</Text>
      </View>
    )
  }

  if (captcha.type === 'image') {
    const img = (captcha.data?.image as string) || ''
    return (
      <View className="captcha" style={IS_RN ? {} : undefined}>
        <View className="captcha__row" style={IS_RN ? rnStyles.row : undefined}>
          <Input
            className="captcha__input"
            style={IS_RN ? rnStyles.input : undefined}
            type="text"
            value={value || ''}
            onInput={(e) => reportValue(e.detail.value)}
            placeholder="输入图中字符"
            placeholderTextColor={IS_RN ? color.mutedSoft : undefined}
            placeholderClass="captcha__placeholder"
          />
          <View className="captcha__image-btn" style={IS_RN ? rnStyles.imageBtn : undefined} onClick={refresh}>
            {img ? (
              <Image className="captcha__image" style={IS_RN ? rnStyles.image : undefined} src={img} mode="aspectFill" />
            ) : (
              <Text className="captcha__loading" style={IS_RN ? rnStyles.loading : undefined}>加载中...</Text>
            )}
          </View>
        </View>
      </View>
    )
  }

  if (captcha.type === 'math') {
    const q = (captcha.data?.question as string) || ''
    return (
      <View className="captcha" style={IS_RN ? {} : undefined}>
        <View className="captcha__row" style={IS_RN ? rnStyles.row : undefined}>
          <Text className="captcha__question" style={IS_RN ? rnStyles.question : undefined}>{q}</Text>
          <Input
            className="captcha__input captcha__input--math"
            style={IS_RN ? { ...rnStyles.input, flex: 1 } : undefined}
            type="text"
            value={value ?? ''}
            onInput={(e) => reportValue(String(e.detail.value ?? '').trim())}
            placeholder="答案"
            placeholderTextColor={IS_RN ? color.mutedSoft : undefined}
            placeholderClass="captcha__placeholder"
          />
          <Text className="captcha__refresh" style={IS_RN ? rnStyles.refresh : undefined} onClick={refresh}>换一题</Text>
        </View>
      </View>
    )
  }

  return (
    <View className="captcha" style={IS_RN ? {} : undefined}>
      <Text className="captcha__loading" style={IS_RN ? rnStyles.loading : undefined}>不支持的验证码类型</Text>
    </View>
  )
}
