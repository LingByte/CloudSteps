import { useEffect, useState } from 'react'
import { View, Text, Textarea, Input, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import { listFeedback, createFeedback, type FeedbackTicket } from '../../api/feedback'
import { color } from '../../styles/tokens'
import './index.scss'

export default function Feedback() {
  const [tickets, setTickets] = useState<FeedbackTicket[]>([]); const [content, setContent] = useState(''); const [contact, setContact] = useState(''); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false)
  const load = async () => { try { const res = await listFeedback({ page: 1, pageSize: 20 }); if (res.code === 200) setTickets(res.data?.list || []) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  const submit = async () => { if (!content.trim()) { Taro.showToast({ title: '请输入反馈内容', icon: 'none' }); return } setSaving(true); try { const res = await createFeedback({ content: content.trim(), contact: contact.trim() || undefined }); if (res.code !== 200) { Taro.showToast({ title: res.msg || '提交失败', icon: 'none' }); return } Taro.showToast({ title: '提交成功', icon: 'success' }); setContent(''); setContact(''); void load() } catch { Taro.showToast({ title: '提交失败', icon: 'none' }) } finally { setSaving(false) } }
  return <View className="feedback"><View className="fb__nav"><View className="fb__back" onClick={() => Taro.navigateBack()}><ArrowLeft size={22} color={color.charcoal} /></View><Text className="fb__title">意见反馈</Text><View className="fb__back" /></View><ScrollView className="fb__body" scrollY enableFlex><View className="fb__card"><Text className="fb__section">提交反馈</Text><Textarea className="fb__textarea" value={content} onInput={(e) => setContent(e.detail.value)} placeholder="请描述你遇到的问题或建议" maxlength={2000} /><Input className="fb__input" value={contact} onInput={(e) => setContact(e.detail.value)} placeholder="联系方式（选填）" /><View className="fb__submit" onClick={() => void submit()}><Text>{saving ? '提交中...' : '提交反馈'}</Text></View></View><Text className="fb__history">历史反馈</Text>{loading ? <Text className="fb__state">加载中...</Text> : tickets.length === 0 ? <Text className="fb__state">暂无反馈记录</Text> : <View className="fb__list">{tickets.map((ticket) => <View key={ticket.id} className="fb__ticket"><View className="fb__ticket-top"><Text className="fb__ticket-status">{ticket.status === 'closed' ? '已处理' : '处理中'}</Text><Text className="fb__date">{ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString('zh-CN') : ''}</Text></View><Text className="fb__content">{ticket.content}</Text>{ticket.replies?.map((reply) => <View key={reply.id} className="fb__reply"><Text>{reply.content}</Text></View>)}</View>)}</View>}<View style={{ height: '48rpx' }} /></ScrollView></View>
}
