import { useEffect, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import { listAnnouncements, markAnnouncementRead, type Announcement } from '../../api/announcements'
import { color } from '../../styles/tokens'
import './index.scss'
export default function Announcements() {
  const [list, setList] = useState<Announcement[]>([]); const [loading, setLoading] = useState(true); const [active, setActive] = useState<string | number | null>(null)
  useEffect(() => {
    void (async () => {
      try {
        const res = await listAnnouncements()
        if (res.code === 200) setList(res.data?.list || [])
      } catch { /* ignore */ } finally { setLoading(false) }
    })()
  }, [])
  const open = async (item: Announcement) => { setActive(active === item.id ? null : item.id); if (!item.read) { await markAnnouncementRead(item.id).catch(() => {}); setList((prev) => prev.map((x) => x.id === item.id ? { ...x, read: true } : x)) } }
  return <View className="announcements"><View className="an__nav"><View className="an__back" onClick={() => Taro.navigateBack()}><ArrowLeft size={22} color={color.charcoal} /></View><Text className="an__title">公告</Text><View className="an__back" /></View><ScrollView className="an__body" scrollY enableFlex>{loading ? <View className="an__state"><Text>加载中...</Text></View> : list.length === 0 ? <View className="an__state"><Text>暂无公告</Text></View> : <View className="an__list">{list.map((item) => <View key={item.id} className={`an__item ${!item.read ? 'an__item--unread' : ''}`} onClick={() => void open(item)}><View className="an__item-top"><Text className="an__item-title">{item.title}</Text>{!item.read && <View className="an__dot" />}</View><Text className="an__date">{item.publishedAt || item.createdAt ? new Date(item.publishedAt || item.createdAt || '').toLocaleDateString('zh-CN') : ''}</Text>{active === item.id && <Text className="an__content">{item.content}</Text>}</View>)}</View>}<View style={{ height: '48rpx' }} /></ScrollView></View>
}
