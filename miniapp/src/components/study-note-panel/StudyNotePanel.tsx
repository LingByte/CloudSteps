import { useEffect, useState } from 'react'
import { Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Close } from '@nutui/icons-react-taro'
import './study-note-panel.scss'

export function readStudyNote(storageKey: string): string {
  try { return String(Taro.getStorageSync(storageKey) || '') } catch { return '' }
}

type PanelProps = { open: boolean; storageKey: string; title?: string; onClose: () => void }

export function StudyNotePanel({ open, storageKey, title = '学习笔记', onClose }: PanelProps) {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (open) { setText(readStudyNote(storageKey)); setSaved(false) }
  }, [open, storageKey])

  if (!open) return null
  const save = () => {
    Taro.setStorageSync(storageKey, text)
    setSaved(true)
    Taro.showToast({ title: '笔记已保存', icon: 'success' })
  }
  return <View className="study-note__mask" onClick={onClose}><View className="study-note" onClick={(event) => event.stopPropagation()}><View className="study-note__header"><Text className="study-note__title">{title}</Text><View onClick={onClose}><Close size={20} color="#718096" /></View></View><Textarea className="study-note__textarea" value={text} onInput={(event) => { setText(event.detail.value); setSaved(false) }} placeholder="记录这个单词的联想、例句或学习重点..." maxlength={5000} /><View className="study-note__footer"><Text className="study-note__status">{saved ? '已保存' : `${text.length}/5000`}</Text><View className="study-note__save" onClick={save}><Text>保存笔记</Text></View></View></View></View>
}

type LauncherProps = { onClick: () => void; label?: string }
export function StudyNoteLauncher({ onClick, label = '笔记' }: LauncherProps) {
  return <View className="study-note__launcher" onClick={onClick}><Text>{label}</Text></View>
}
