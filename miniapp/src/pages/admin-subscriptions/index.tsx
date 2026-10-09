import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft, Plus } from '@nutui/icons-react-taro'
import {
  listSubscriptions, upsertSubscription, cancelSubscription, searchCoachingStudents,
  type UserSubscription, type SubscriptionType, type SubscriptionStatus,
} from '../../api/coaching'
import { useAuthStore } from '../../stores/authStore'
import { color } from '../../styles/tokens'
import './index.scss'

const typeLabels: Record<SubscriptionType, string> = { monthly: '包月', yearly: '包年', lifetime: '买断' }
const statusLabels: Record<SubscriptionStatus, string> = { active: '生效中', expired: '已过期', cancelled: '已取消' }

type SearchResult = { id: string | number; username?: string; displayName?: string; email?: string }

function formatDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return d
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

export default function AdminSubscriptions() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'

  const [list, setList] = useState<UserSubscription[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus | ''>('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<UserSubscription | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [selectedUser, setSelectedUser] = useState<SearchResult | null>(null)
  const [formType, setFormType] = useState<SubscriptionType>('monthly')
  const [formDuration, setFormDuration] = useState('1')
  const [submitting, setSubmitting] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listSubscriptions(statusFilter ? { status: statusFilter } : undefined)
      if (res.code === 200) setList(Array.isArray(res.data) ? res.data : [])
      else Taro.showToast({ title: res.msg || '加载失败', icon: 'none' })
    } catch { Taro.showToast({ title: '加载订阅列表失败', icon: 'none' }) } finally { setLoading(false) }
  }, [statusFilter])

  useEffect(() => { if (isAdmin) void loadList() }, [isAdmin, loadList])

  const doSearch = async (q: string) => {
    if (q.trim().length < 2) { setSearchResults([]); return }
    try {
      const res = await searchCoachingStudents(q.trim())
      if (res.code === 200 && Array.isArray(res.data)) setSearchResults(res.data)
    } catch { /* ignore */ }
  }

  const openCreate = () => {
    setEditing(null); setSelectedUser(null); setSearchQuery(''); setSearchResults([])
    setFormType('monthly'); setFormDuration('1'); setDialogOpen(true)
  }

  const openEdit = (sub: UserSubscription) => {
    setEditing(sub)
    setSelectedUser(sub.user ? { id: sub.userId, username: sub.user.username, displayName: sub.user.displayName, email: sub.user.email } : { id: sub.userId })
    setSearchQuery(''); setSearchResults([]); setFormType(sub.type); setFormDuration('1'); setDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!selectedUser) { Taro.showToast({ title: '请先选择用户', icon: 'none' }); return }
    const userId = Number(selectedUser.id)
    if (!userId) { Taro.showToast({ title: '用户 ID 无效', icon: 'none' }); return }
    const duration = Math.max(1, Number(formDuration) || 1)
    setSubmitting(true)
    try {
      const body: Parameters<typeof upsertSubscription>[0] = { userId, type: formType }
      if (formType !== 'lifetime') body.duration = duration
      const res = await upsertSubscription(body)
      if (res.code === 200) {
        Taro.showToast({ title: editing ? '订阅已更新' : '订阅已创建', icon: 'success' })
        setDialogOpen(false); void loadList()
      } else Taro.showToast({ title: res.msg || '操作失败', icon: 'none' })
    } catch (e: any) { Taro.showToast({ title: e?.msg || '操作失败', icon: 'none' }) } finally { setSubmitting(false) }
  }

  const handleCancel = (sub: UserSubscription) => {
    Taro.showModal({ title: '取消订阅', content: `确认取消该订阅？（${typeLabels[sub.type]} - 用户ID: ${sub.userId}）`, confirmColor: '#e03131' })
      .then(async (r) => {
        if (!r.confirm) return
        try {
          const res = await cancelSubscription(sub.id)
          if (res.code === 200) { Taro.showToast({ title: '订阅已取消', icon: 'success' }); void loadList() }
          else Taro.showToast({ title: res.msg || '取消失败', icon: 'none' })
        } catch (e: any) { Taro.showToast({ title: e?.msg || '取消失败', icon: 'none' }) }
      })
      .catch(() => {})
  }

  if (!isAdmin) {
    return <View className="as"><View className="as__denied"><Text className="as__denied-text">仅管理员可访问此页面</Text></View></View>
  }

  return (
    <View className="as">
      <View className="as__nav">
        <View className="as__back" onClick={() => Taro.navigateBack()}><ArrowLeft size={22} color={color.charcoal} /></View>
        <Text className="as__title">订阅管理</Text>
        <View className="as__create" onClick={openCreate}><Plus size={18} color="#fff" /></View>
      </View>

      <View className="as__filters">
        {(['', 'active', 'expired', 'cancelled'] as const).map((s) => (
          <View key={s || 'all'} className={`as__filter ${statusFilter === s ? 'as__filter--active' : ''}`} onClick={() => setStatusFilter(s)}>
            <Text className="as__filter-text">{s === '' ? '全部' : statusLabels[s]}</Text>
          </View>
        ))}
        <Text className="as__count">共 {list.length} 条</Text>
      </View>

      <ScrollView className="as__body" scrollY enableFlex>
        {loading ? (
          <View className="as__state"><Text>加载中...</Text></View>
        ) : list.length === 0 ? (
          <View className="as__state"><Text>暂无订阅记录</Text></View>
        ) : (
          list.map((sub) => (
            <View key={sub.id} className="as__item">
              <View className="as__item-main">
                <Text className="as__item-name">{sub.user?.displayName || sub.user?.username || `#${sub.userId}`}</Text>
                {sub.user?.email && <Text className="as__item-email">{sub.user.email}</Text>}
                <View className="as__item-meta">
                  <Text className="as__tag">{typeLabels[sub.type]}</Text>
                  <Text className={`as__status as__status--${sub.status}`}>{statusLabels[sub.status]}</Text>
                </View>
                <Text className="as__item-date">{formatDate(sub.startedAt)} → {sub.expiredAt ? formatDate(sub.expiredAt) : '永久'}</Text>
              </View>
              <View className="as__item-actions">
                <Text className="as__action" onClick={() => openEdit(sub)}>编辑</Text>
                {sub.status === 'active' && <Text className="as__action as__action--danger" onClick={() => handleCancel(sub)}>取消</Text>}
              </View>
            </View>
          ))
        )}
        <View style={{ height: '48rpx' }} />
      </ScrollView>

      {dialogOpen && (
        <View className="as__mask" onClick={() => setDialogOpen(false)}>
          <View className="as__modal" onClick={(e) => e.stopPropagation()}>
            <Text className="as__modal-title">{editing ? '编辑订阅' : '新增订阅'}</Text>
            <Text className="as__modal-desc">{editing ? '修改订阅类型和有效期' : '为老师开通包月/包年/买断订阅'}</Text>

            <Text className="as__label">选择用户</Text>
            {editing || selectedUser ? (
              <View className="as__selected">
                <Text className="as__selected-name">
                  {selectedUser?.displayName || selectedUser?.username || `#${selectedUser?.id}`}
                  {selectedUser?.email ? ` · ${selectedUser.email}` : ''}
                </Text>
                {!editing && <Text className="as__selected-change" onClick={() => { setSelectedUser(null); setSearchQuery('') }}>更换</Text>}
              </View>
            ) : (
              <>
                <Input
                  className="as__input"
                  placeholder="搜索用户名或邮箱（至少 2 字）"
                  value={searchQuery}
                  onInput={(e) => { setSearchQuery(e.detail.value); void doSearch(e.detail.value) }}
                />
                {searchResults.length > 0 && (
                  <View className="as__results">
                    {searchResults.map((r) => (
                      <View key={r.id} className="as__result" onClick={() => { setSelectedUser(r); setSearchResults([]); setSearchQuery('') }}>
                        <Text className="as__result-name">{r.displayName || r.username || `#${r.id}`}</Text>
                        {r.email && <Text className="as__result-email">{r.email}</Text>}
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            <Text className="as__label">订阅类型</Text>
            <View className="as__types">
              {(Object.keys(typeLabels) as SubscriptionType[]).map((t) => (
                <View key={t} className={`as__type ${formType === t ? 'as__type--active' : ''}`} onClick={() => setFormType(t)}>
                  <Text className="as__type-text">{typeLabels[t]}</Text>
                </View>
              ))}
            </View>

            {formType !== 'lifetime' ? (
              <>
                <Text className="as__label">{formType === 'monthly' ? '月数' : '年数'}</Text>
                <Input className="as__input as__input--num" type="number" value={formDuration} onInput={(e) => setFormDuration(e.detail.value)} />
                <Text className="as__hint">{formType === 'monthly' ? `订阅 ${formDuration} 个月` : `订阅 ${formDuration} 年`}</Text>
              </>
            ) : (
              <Text className="as__hint">买断订阅永不过期，无需设置时长</Text>
            )}

            <View className="as__modal-btns">
              <View className="as__modal-btn as__modal-btn--outline" onClick={() => setDialogOpen(false)}><Text>取消</Text></View>
              <View className={`as__modal-btn as__modal-btn--brand ${submitting || (!editing && !selectedUser) ? 'as__modal-btn--disabled' : ''}`} onClick={() => void handleSubmit()}>
                <Text>{submitting ? '提交中…' : editing ? '保存' : '创建'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
