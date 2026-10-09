import { useState } from 'react'
import { View, Text, Input, Textarea, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import { createCustomScenario } from '../../api/scenarioDialogue'
import { color } from '../../styles/tokens'
import './index.scss'

export default function CreateCustomScenario() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [aiRole, setAiRole] = useState('')
  const [prompt, setPrompt] = useState('')
  const [difficulty, setDifficulty] = useState('medium')
  const [submitting, setSubmitting] = useState(false)
  const submit = async () => {
    if (!name.trim() || !aiRole.trim() || !prompt.trim()) { Taro.showToast({ title: '请填写必填项', icon: 'none' }); return }
    setSubmitting(true)
    try {
      const res = await createCustomScenario({ name: name.trim(), description: description.trim(), aiRole: aiRole.trim(), prompt: prompt.trim(), difficulty })
      if (res.code !== 200) { Taro.showToast({ title: res.msg || '创建失败', icon: 'none' }); return }
      Taro.showToast({ title: '创建成功', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 500)
    } catch { Taro.showToast({ title: '创建失败', icon: 'none' }) } finally { setSubmitting(false) }
  }
  const field = (label: string, value: string, onInput: (v: string) => void, placeholder: string, multiline = false) => <View className="ccs__field"><Text className="ccs__label">{label}</Text>{multiline ? <Textarea className="ccs__textarea" value={value} onInput={(e) => onInput(e.detail.value)} placeholder={placeholder} maxlength={2000} /> : <Input className="ccs__input" value={value} onInput={(e) => onInput(e.detail.value)} placeholder={placeholder} maxlength={128} />}</View>
  return <View className="create-custom-scenario"><View className="ccs__nav"><View className="ccs__back" onClick={() => Taro.navigateBack()}><ArrowLeft size={22} color={color.charcoal} /></View><Text className="ccs__title">创建自定义情景</Text><View className="ccs__back" /></View><ScrollView className="ccs__body" scrollY enableFlex><View className="ccs__card">{field('名称 *', name, setName, '例如：机场值机')}{field('描述', description, setDescription, '简单描述练习场景', true)}<View className="ccs__field"><Text className="ccs__label">难度</Text><View className="ccs__choices">{[['easy', '入门'], ['medium', '进阶'], ['hard', '挑战']].map(([v, l]) => <View key={v} className={`ccs__choice ${difficulty === v ? 'ccs__choice--active' : ''}`} onClick={() => setDifficulty(v)}><Text>{l}</Text></View>)}</View></View>{field('AI 角色 *', aiRole, setAiRole, '例如：友善的机场工作人员')}{field('对话提示词 *', prompt, setPrompt, '描述 AI 的角色、对话目标和行为规则', true)}<View className="ccs__notice"><Text>创建后即可在情景口语列表中使用。</Text></View><View className={`ccs__submit ${submitting ? 'ccs__submit--disabled' : ''}`} onClick={() => void submit()}><Text>{submitting ? '创建中...' : '创建情景'}</Text></View></View><View style={{ height: '48rpx' }} /></ScrollView></View>
}
