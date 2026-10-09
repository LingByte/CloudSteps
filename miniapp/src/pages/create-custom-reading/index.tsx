import { useState } from 'react'
import { Input, ScrollView, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Add, Del, ArrowLeft } from '@nutui/icons-react-taro'
import { createCustomReadingPassage } from '../../api/reading'
import { color } from '../../styles/tokens'
import './index.scss'

type QuestionDraft = { id: string; stem: string; options: Record<string, string>; answer: string; explanation: string }
const LEVELS = ['初阶', '中阶', '高阶']
const KEYS = ['A', 'B', 'C', 'D']
const emptyQuestion = (): QuestionDraft => ({ id: `${Date.now()}-${Math.random()}`, stem: '', options: { A: '', B: '', C: '', D: '' }, answer: 'A', explanation: '' })

export default function CreateCustomReading() {
  const [title, setTitle] = useState('')
  const [level, setLevel] = useState('初阶')
  const [summary, setSummary] = useState('')
  const [content, setContent] = useState('')
  const [questions, setQuestions] = useState<QuestionDraft[]>([emptyQuestion()])
  const [saving, setSaving] = useState(false)
  const updateQuestion = (id: string, patch: Partial<QuestionDraft>) => setQuestions((prev) => prev.map((question) => question.id === id ? { ...question, ...patch } : question))
  const updateOption = (id: string, key: string, value: string) => setQuestions((prev) => prev.map((question) => question.id === id ? { ...question, options: { ...question.options, [key]: value } } : question))
  const addQuestion = () => setQuestions((prev) => [...prev, emptyQuestion()])
  const removeQuestion = (id: string) => setQuestions((prev) => prev.length <= 1 ? prev : prev.filter((question) => question.id !== id))
  const submit = async () => {
    if (!title.trim() || !content.trim() || questions.some((question) => !question.stem.trim() || KEYS.some((key) => !question.options[key].trim()))) { Taro.showToast({ title: '请完善文章和所有题目', icon: 'none' }); return }
    setSaving(true)
    try {
      const payload = questions.map(({ id: _id, options, ...question }, index) => ({ ...question, sortOrder: index, options: KEYS.map((key) => ({ key, text: options[key] })) }))
      const res = await createCustomReadingPassage({ title: title.trim(), level, summary: summary.trim(), content: content.trim(), questions: payload })
      if (res.code !== 200) { Taro.showToast({ title: res.msg || '创建失败', icon: 'none' }); return }
      Taro.showToast({ title: '创建成功', icon: 'success' })
      setTimeout(() => Taro.redirectTo({ url: '/pages/reading-comprehension/index' }), 500)
    } catch (error: any) { Taro.showToast({ title: error?.msg || '创建失败', icon: 'none' }) } finally { setSaving(false) }
  }
  return <View className="custom-reading"><View className="ccr__nav"><View className="ccr__back" onClick={() => Taro.navigateBack()}><ArrowLeft size={20} color={color.charcoal} /></View><Text className="ccr__title">创建自定义阅读</Text><View className="ccr__back" /></View><ScrollView className="ccr__body" scrollY enableFlex><View className="ccr__card"><Text className="ccr__hint">创建文章和选择题，题目会直接用于阅读练习。</Text><Text className="ccr__label">标题 *</Text><Input className="ccr__input" value={title} onInput={(event) => setTitle(event.detail.value)} placeholder="文章标题" /><Text className="ccr__label">难度</Text><View className="ccr__levels">{LEVELS.map((item) => <View key={item} className={`ccr__level ${level === item ? 'ccr__level--active' : ''}`} onClick={() => setLevel(item)}><Text>{item}</Text></View>)}</View><Text className="ccr__label">摘要</Text><Textarea className="ccr__textarea ccr__short" value={summary} onInput={(event) => setSummary(event.detail.value)} placeholder="文章摘要" /><Text className="ccr__label">正文 *</Text><Textarea className="ccr__textarea ccr__content" value={content} onInput={(event) => setContent(event.detail.value)} placeholder="输入英文文章正文" /><View className="ccr__question-head"><Text className="ccr__label">题目设置</Text><View className="ccr__add" onClick={addQuestion}><Add size={16} color={color.primary} /><Text>添加题目</Text></View></View>{questions.map((question, index) => <View key={question.id} className="ccr__question"><View className="ccr__question-title"><Text>题目 {index + 1}</Text>{questions.length > 1 ? <View onClick={() => removeQuestion(question.id)}><Del size={16} color={color.destructive} /></View> : null}</View><Textarea className="ccr__textarea ccr__stem" value={question.stem} onInput={(event) => updateQuestion(question.id, { stem: event.detail.value })} placeholder="填写题干" />{KEYS.map((key) => <View key={key} className="ccr__option"><Text className="ccr__option-key">{key}</Text><Input className="ccr__option-input" value={question.options[key]} onInput={(event) => updateOption(question.id, key, event.detail.value)} placeholder={`选项 ${key}`} /></View>)}<Text className="ccr__label">正确答案</Text><View className="ccr__answer-list">{KEYS.map((key) => <View key={key} className={`ccr__answer ${question.answer === key ? 'ccr__answer--active' : ''}`} onClick={() => updateQuestion(question.id, { answer: key })}><Text>{key}</Text></View>)}</View><Text className="ccr__label">解析</Text><Textarea className="ccr__textarea ccr__explanation" value={question.explanation} onInput={(event) => updateQuestion(question.id, { explanation: event.detail.value })} placeholder="填写解析" /></View>)}<View className={`ccr__submit ${saving ? 'ccr__submit--disabled' : ''}`} onClick={() => void submit()}><Text>{saving ? '创建中...' : '创建阅读'}</Text></View></View><View style={{ height: '48rpx' }} /></ScrollView></View>
}
