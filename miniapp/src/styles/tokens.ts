/**
 * CloudSteps Design Tokens — 三端共享的单一真相来源。
 *
 * 小程序 / H5 端：用 SCSS 变量（vars.scss）+ CSS 变量（app.scss），两者从此文件同步。
 * RN 端：用本文件的 JS 导出 + StyleSheet.create，因为 RN 不支持 CSS 变量。
 *
 * 设计稿宽度 375px → 1px = 2rpx。
 * RN 端 StyleSheet 只接受数字（px），所以 spacing/radius 导出的是 px 值 = rpx/2。
 *
 * 对齐 web/src/styles/theme.css 的 Warm Mint 主题。
 */

/* ============ 颜色 ============ */
export const color = {
  /* 品牌色 */
  primary: '#4ECDC4',
  primaryDeep: '#3DB8B0',
  primarySoft: 'rgba(78, 205, 196, 0.12)',
  secondaryBrand: '#55A3FF',

  /* 表面 */
  background: '#f6f5f4',
  card: '#ffffff',
  surfaceSoft: '#fafaf9',
  muted: '#f0eeec',

  /* 边框 */
  border: '#e5e3df',
  input: '#c8c4be',

  /* 文字 */
  foreground: '#1a1a1a',
  charcoal: '#37352f',
  mutedForeground: '#787671',
  mutedSoft: '#a4a097',

  /* 语义色 */
  success: '#1aae39',
  warning: '#c37d0d',
  destructive: '#e03131',
  wrong: '#ff6b6b',
  wrongSoft10: 'rgba(255, 107, 107, 0.10)',

  /* 色调卡片 */
  tintMint: '#e8f8f5',
  tintSky: '#e8f2fc',
  tintCream: '#f8f5e8',

  /* 透明叠加（用于按压态/图标底色/状态底色） */
  primarySoft4: 'rgba(78, 205, 196, 0.04)',
  primarySoft6: 'rgba(78, 205, 196, 0.06)',
  primarySoft8: 'rgba(78, 205, 196, 0.08)',
  primarySoft10: 'rgba(78, 205, 196, 0.10)',
  primarySoft12: 'rgba(78, 205, 196, 0.12)',
  primarySoft20: 'rgba(78, 205, 196, 0.20)',
  primarySoft30: 'rgba(78, 205, 196, 0.30)',
  skySoft10: 'rgba(85, 163, 255, 0.10)',
  skySoft12: 'rgba(85, 163, 255, 0.12)',
  creamSoft10: 'rgba(195, 125, 13, 0.10)',
  creamSoft12: 'rgba(195, 125, 13, 0.12)',
  creamSoft20: 'rgba(195, 125, 13, 0.20)',
  successSoft10: 'rgba(26, 174, 57, 0.10)',
  successSoft12: 'rgba(26, 174, 57, 0.12)',
  destructiveSoft4: 'rgba(224, 49, 49, 0.04)',
  destructiveSoft5: 'rgba(224, 49, 49, 0.05)',
  destructiveSoft6: 'rgba(224, 49, 49, 0.06)',
  destructiveSoft8: 'rgba(224, 49, 49, 0.08)',
  destructiveSoft20: 'rgba(224, 49, 49, 0.20)',
  destructiveSoft25: 'rgba(224, 49, 49, 0.25)',
  destructiveSoft30: 'rgba(224, 49, 49, 0.30)',

  /* 白色/黑色透明叠加 */
  white15: 'rgba(255, 255, 255, 0.15)',
  white20: 'rgba(255, 255, 255, 0.20)',
  white25: 'rgba(255, 255, 255, 0.25)',
  white40: 'rgba(255, 255, 255, 0.40)',
  white60: 'rgba(255, 255, 255, 0.60)',
  white85: 'rgba(255, 255, 255, 0.85)',
  white90: 'rgba(255, 255, 255, 0.90)',
  white92: 'rgba(255, 255, 255, 0.92)',
  black40: 'rgba(0, 0, 0, 0.40)',
  black45: 'rgba(0, 0, 0, 0.45)',
  black50: 'rgba(0, 0, 0, 0.50)',

  white: '#ffffff',
  transparent: 'transparent',
} as const

/* ============ 字体 ============ */
export const font = {
  sans: '"Plus Jakarta Sans", "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const

/* ============ 间距（px，375 稿 = rpx/2） ============ */
export const space = {
  xs: 4, // 8rpx
  sm: 8, // 16rpx
  md: 12, // 24rpx
  lg: 16, // 32rpx
  xl: 24, // 48rpx
  xxl: 32, // 64rpx
} as const

/* ============ 圆角（px） ============ */
export const radius = {
  sm: 4, // 8rpx
  md: 6, // 12rpx
  lg: 8, // 16rpx
  pill: 999,
} as const

/* ============ 阴影 ============ */
export const shadow = {
  rest: '0 1px 2px rgba(0, 0, 0, 0.04)',
} as const

/* ============ 焦点环 ============ */
export const ring = {
  primary: 'rgba(78, 205, 196, 0.4)',
} as const

/* ============ 组件尺寸（px，375 稿） ============ */
export const size = {
  /* Button 高度 */
  btnSm: 32, // 64rpx
  btnMd: 36, // 72rpx
  btnLg: 44, // 88rpx
  /* Input 高度 */
  inputHeight: 44, // 88rpx
  /* 头像 */
  avatarMd: 44, // 88rpx
  avatarLg: 60, // 120rpx
  /* 图标容器 */
  iconSm: 28, // 56rpx
  iconMd: 32, // 64rpx
  iconLg: 40, // 80rpx
} as const

/* ============ 字号（px，375 稿 = rpx/2） ============ */
export const fontSize = {
  xs: 11, // 22rpx
  sm: 12, // 24rpx
  base: 13, // 26rpx
  md: 14, // 28rpx
  lg: 15, // 30rpx
  xl: 18, // 36rpx
  xxl: 22, // 44rpx
  title: 26, // 52rpx
} as const

/* ============ 边框宽度（px） ============ */
export const borderWidth = {
  hairline: 1, // 2rpx
} as const

/**
 * rpx → px 转换辅助（375 稿）。
 * RN 端 StyleSheet 用数字 px；小程序/H5 端用 rpx 字符串。
 *
 * 用法：
 *   import { rpx } from '@/styles/tokens'
 *   const style = process.env.TARO_ENV === 'rn'
 *     ? { padding: rpx(32) }      // 16 (number, px)
 *     : { padding: '32rpx' }      // '32rpx' (string)
 */
export function rpx(value: number): number {
  return value / 2
}

/**
 * RN 端扩展 CSS 属性类型。
 * Taro 的 CSSProperties 不包含 RN 特有属性（paddingHorizontal, shadowColor 等），
 * 用这个类型在 RN 端样式对象上做断言。
 */
export type RNCSSProperties = React.CSSProperties & {
  paddingHorizontal?: number
  paddingVertical?: number
  shadowColor?: string
  shadowOffset?: { width: number; height: number }
  shadowOpacity?: number
  shadowRadius?: number
  elevation?: number
}
