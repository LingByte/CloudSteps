import { useEffect, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Setting, Add, Minus } from '@nutui/icons-react-taro'
import './practice-font-settings.scss'

export type PracticeDisplaySettings = { wordSizePx: number; fontFamily: 'sans' | 'serif' | 'italic'; bold: boolean }
const KEY = 'lb_practice_display'
const DEFAULTS: PracticeDisplaySettings = { wordSizePx: 26, fontFamily: 'sans', bold: false }

export function readPracticeDisplay(): PracticeDisplaySettings {
  try {
    const raw = Taro.getStorageSync(KEY)
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw
    return { ...DEFAULTS, ...(data || {}), wordSizePx: Math.max(14, Math.min(48, Number(data?.wordSizePx || DEFAULTS.wordSizePx))) }
  } catch { return DEFAULTS }
}

export function PracticeFontSettingsButton() {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<PracticeDisplaySettings>(readPracticeDisplay)
  useEffect(() => { Taro.setStorageSync(KEY, settings) }, [settings])
  const update = (patch: Partial<PracticeDisplaySettings>) => setSettings((prev) => ({ ...prev, ...patch }))
  return <>
    <View className="practice-font-trigger" onClick={() => setOpen(true)}><Setting size={18} color="#718096" /></View>
    {open ? <View className="practice-font-mask" onClick={() => setOpen(false)}><View className="practice-font-panel" onClick={(event) => event.stopPropagation()}>
      <Text className="practice-font-title">显示设置</Text>
      <View className="practice-font-row"><Text>字号</Text><View className="practice-font-step"><View onClick={() => update({ wordSizePx: Math.max(14, settings.wordSizePx - 1) })}><Minus size={16} /></View><Text>{settings.wordSizePx}px</Text><View onClick={() => update({ wordSizePx: Math.min(48, settings.wordSizePx + 1) })}><Add size={16} /></View></View></View>
      <View className="practice-font-row"><Text>字重</Text><View className={`practice-font-switch ${settings.bold ? 'practice-font-switch--active' : ''}`} onClick={() => update({ bold: !settings.bold })}><Text>{settings.bold ? '粗体' : '常规'}</Text></View></View>
      <View className="practice-font-row"><Text>字体</Text><View className="practice-font-families">{(['sans', 'serif', 'italic'] as const).map((family) => <View key={family} className={`practice-font-family ${settings.fontFamily === family ? 'practice-font-family--active' : ''}`} onClick={() => update({ fontFamily: family })}><Text>{family === 'sans' ? '无衬线' : family === 'serif' ? '衬线' : '斜体'}</Text></View>)}</View></View>
      <View className="practice-font-preview" style={{ fontSize: `${settings.wordSizePx}px`, fontWeight: settings.bold ? 700 : 500, fontStyle: settings.fontFamily === 'italic' ? 'italic' : 'normal', fontFamily: settings.fontFamily === 'serif' ? 'serif' : 'sans-serif' }}><Text>Vocabulary 单词示例</Text></View>
      <View className="practice-font-close" onClick={() => setOpen(false)}><Text>完成</Text></View>
    </View></View> : null}
  </>
}
