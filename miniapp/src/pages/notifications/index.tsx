import { useEffect, useMemo, useState } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Right } from '@nutui/icons-react-taro'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type ApiNotification,
} from '../../api/notifications'
import { CloudButton } from '../../components/button'
import { PageBackHeader } from '../../components/page-back-header/PageBackHeader'
import { color } from '../../styles/tokens'
import './index.scss'

type NotificationItem = {
  id: number
  title: string
  content: string
  time: string
  read: boolean
  actionUrl?: string
  actionLabel?: string
}

function toItem(n: ApiNotification): NotificationItem {
  const date = new Date(n.createdAt)
  return {
    id: n.id,
    title: n.title,
    content: n.content,
    time: Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN'),
    read: !!n.read,
    actionUrl: n.actionUrl,
    actionLabel: n.actionLabel,
  }
}

function stripMarkdown(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_~>#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function Notifications() {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalUnread, setTotalUnread] = useState(0)
  const [detail, setDetail] = useState<NotificationItem | null>(null)
  const unreadCount = useMemo(() => totalUnread, [totalUnread])

  const fetchNotifications = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listNotifications({ page: 1, size: 50 })
      setTotalUnread(res.data?.totalUnread ?? 0)
      setItems((res.data?.list ?? []).map(toItem))
    } catch (e: any) {
      setError(e?.msg || e?.message || '加载通知失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchNotifications()
  }, [])

  const markAllRead = async () => {
    try {
      const res = await markAllNotificationsRead()
      if (res.code !== 200) {
        setError(res.msg || '操作失败')
        return
      }
      setItems((prev) => prev.map((i) => ({ ...i, read: true })))
      setTotalUnread(0)
      setDetail((d) => (d ? { ...d, read: true } : d))
    } catch (e: any) {
      setError(e?.msg || '操作失败')
    }
  }

  const markOneRead = async (id: number) => {
    const target = items.find((i) => i.id === id)
    if (!target || target.read) return
    try {
      await markNotificationRead(id)
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, read: true } : i)))
      setTotalUnread((prev) => Math.max(0, prev - 1))
      setDetail((d) => (d?.id === id ? { ...d, read: true } : d))
    } catch (e: any) {
      setError(e?.msg || '标记已读失败')
    }
  }

  const openDetail = (item: NotificationItem) => {
    setDetail(item)
    if (!item.read) void markOneRead(item.id)
  }

  const openAction = () => {
    const url = detail?.actionUrl
    if (!url) return
    if (url.startsWith('/pages/')) {
      setDetail(null)
      Taro.navigateTo({ url })
      return
    }
    Taro.setClipboardData({ data: url })
  }

  return (
    <View className="notifications">
      <PageBackHeader title="通知" fallbackTo="/pages/coach/index" />
      <ScrollView className="notifications__scroll" scrollY enableFlex>
        <View className="notifications__head">
          <View className="notifications__head-text">
            <Text className="notifications__title">通知</Text>
            <Text className="notifications__subtitle">
              {unreadCount > 0 ? `你有 ${unreadCount} 条未读通知` : '暂无未读通知'}
            </Text>
          </View>
          <CloudButton variant="outline" disabled={loading || items.length === 0 || unreadCount === 0} onClick={markAllRead}>
            全部已读
          </CloudButton>
        </View>

        <View className="notifications__list-card">
          {loading ? (
            <View className="notifications__state"><Text>加载通知中…</Text></View>
          ) : error ? (
            <View className="notifications__state notifications__state--error"><Text>{error}</Text></View>
          ) : items.length === 0 ? (
            <View className="notifications__state"><Text>暂无通知</Text></View>
          ) : (
            items.map((n) => (
              <View key={n.id} className="notifications__item" onClick={() => openDetail(n)}>
                <View className="notifications__item-main">
                  <View className="notifications__item-title-row">
                    {!n.read ? <View className="notifications__dot" /> : null}
                    <Text className="notifications__item-title">{n.title}</Text>
                  </View>
                  <Text className="notifications__item-content">{stripMarkdown(n.content)}</Text>
                </View>
                <Text className="notifications__item-time">{n.time}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {detail ? (
        <View className="notifications__mask" onClick={() => setDetail(null)}>
          <View className="notifications__dialog" onClick={(e) => e.stopPropagation()}>
            <View className="notifications__dialog-head">
              <Text className="notifications__dialog-title">{detail.title}</Text>
              <Text className="notifications__dialog-sub">
                {detail.time} · {detail.read ? '已读' : '未读'}
              </Text>
            </View>
            <ScrollView className="notifications__dialog-body" scrollY>
              <Text className="notifications__dialog-content">{detail.content}</Text>
            </ScrollView>
            {detail.actionUrl ? (
              <View className="notifications__dialog-footer">
                <View className="notifications__action" onClick={openAction}>
                  <Right size={16} color={color.charcoal} />
                  <Text>{detail.actionLabel || '查看详情'}</Text>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  )
}
