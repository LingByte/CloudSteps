import { useState } from 'react'
import { Input, ScrollView, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Add, Del, ArrowLeft } from '@nutui/icons-react-taro'
import { createCustomClozePassage, type CustomClozeBlankInput } from '../../api/cloze'
import { color } from '../../styles/tokens'
import './index.scss'

type BlankDraft = CustomClozeBlankInput & { id: string }
const LEVELS = ['初阶', '中阶', '高阶']
const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const
const emptyBlank = (no: number): BlankDraft => ({ id: `${Date.now()}-${no}-${Math.random()}`, blankNo: no, options: OPTION_KEYS.map((key) => ({ key, text: '' })), answer: 'A', explanation: '' })

export default function CreateCustomCloze() {
  const [title, setTitle] = useState('')
  const [level, setLevel] = useState('初阶')
  const [summary, setSummary] = useState('')
  const [content, setContent] = useState('')
  const [blanks, setBlanks] = useState<BlankDraft[]>([emptyBlank(1)])
  const [submitting, setSubmitting] = useState(false)

  const updateBlank = (id: string, patch: Partial<BlankDraft>) => setBlanks((prev) => prev.map((blank) => blank.id === id ? { ...blank, ...patch } : blank))
  const updateOption = (id: string, key: string, text: string) => setBlanks((prev) => prev.map((blank) => blank.id === id ? { ...blank, options: blank.options.map((option) => option.key === key ? { ...option, text } : option) } : blank))
  const addBlank = () => setBlanks((prev) => [...prev, emptyBlank(prev.length + 1)])
  const removeBlank = (id: string) => setBlanks((prev) => prev.length <= 1 ? prev : prev.filter((blank) => blank.id !== id).map((blank, index) => ({ ...blank, blankNo: index + 1 })))

  const submit = async () => {
    if (!title.trim() || !content.trim() || blanks.some((blank) => blank.options.some((option) => !option.text.trim()))) { Taro.showToast({ title: '请完善标题、正文和所有选项', icon: 'none' }); return }
    setSubmitting(true)
    try {
      const payload = blanks.map(({ id: _id, ...blank }) => ({ ...blank, options: blank.options.map((option) => ({ key: option.key, text: option.text.trim() })) }))
      const res = await createCustomClozePassage({ title: title.trim(), level, summary: summary.trim(), content: content.trim(), blanks: payload })
      if (res.code !== 200) { Taro.showToast({ title: res.msg || '创建失败', icon: 'none' }); return }
      Taro.showToast({ title: '创建成功', icon: 'success' })
      setTimeout(() => Taro.redirectTo({ url: '/pages/cloze-practice/index' }), 500)
    } catch (error: any) { Taro.showToast({ title: error?.msg || '创建失败', icon: 'none' }) } finally { setSubmitting(false) }
  }

  return <View className="custom-cloze"><View className="ccc__nav"><View className="ccc__back" onClick={() => Taro.navigateBack()}><ArrowLeft size={20} color={color.charcoal} /></View><Text className="ccc__title">创建自定义完形</Text><View className="ccc__back" /></View><ScrollView className="ccc__body" scrollY enableFlex><View className="ccc__card"><Text className="ccc__hint">正文中使用 {'{{1}}'}、{'{{2}}'} 标记空位，下面逐项设置选项。</Text><Text className="ccc__label">标题 *</Text><Input className="ccc__input" value={title} onInput={(event) => setTitle(event.detail.value)} placeholder="文章标题" /><Text className="ccc__label">难度</Text><View className="ccc__levels">{LEVELS.map((item) => <View key={item} className={`ccc__level ${level === item ? 'ccc__level--active' : ''}`} onClick={() => setLevel(item)}><Text>{item}</Text></View>)}</View><Text className="ccc__label">摘要</Text><Textarea className="ccc__textarea ccc__short" value={summary} onInput={(event) => setSummary(event.detail.value)} placeholder="文章摘要" /><Text className="ccc__label">正文 *</Text><Textarea className="ccc__textarea ccc__content" value={content} onInput={(event) => setContent(event.detail.value)} placeholder="例如：I {{1}} to school yesterday." />
        <View className="ccc__blank-head"><Text className="ccc__label">空位设置</Text><View className="ccc__add" onClick={addBlank}><Add size={16} color={color.primary} /><Text>添加空位</Text></View></View>
        {blanks.map((blank) => <View key={blank.id} className="ccc__blank"><View className="ccc__blank-title"><Text>空位 {blank.blankNo}</Text>{blanks.length > 1 ? <View onClick={() => removeBlank(blank.id)}><Del size={16} color={color.destructive} /></View> : null}</View><View className="ccc__options">{blank.options.map((option) => <View key={option.key} className="ccc__option"><Text className="ccc__option-key">{option.key}</Text><Input className="ccc__option-input" value={option.text} onInput={(event) => updateOption(blank.id, option.key, event.detail.value)} placeholder={`选项 ${option.key}`} /></View>)}</View><Text className="ccc__label">正确答案</Text><View className="ccc__answer-list">{OPTION_KEYS.map((key) => <View key={key} className={`ccc__answer ${blank.answer === key ? 'ccc__answer--active' : ''}`} onClick={() => updateBlank(blank.id, { answer: key })}><Text>{key}</Text></View>)}</View><Text className="ccc__label">解析</Text><Textarea className="ccc__textarea ccc__explanation" value={blank.explanation || ''} onInput={(event) => updateBlank(blank.id, { explanation: event.detail.value })} placeholder="填写答案解析" /></View>)}
        <View className={`ccc__submit ${submitting ? 'ccc__submit--disabled' : ''}`} onClick={() => void submit()}><Text>{submitting ? '创建中...' : '创建完形'}</Text></View>
      </View><View style={{ height: '48rpx' }} /></ScrollView></View>
}
