import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, Input, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft, Search } from '@nutui/icons-react-taro'
import { listWordBooks, type WordBookItem, type WordBookGroup } from '../../api/wordbooks'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import { color } from '../../styles/tokens'
import './index.scss'

const PAGE_SIZE = 12
const COVER_COLORS = ['#4ECDC4', '#5B8DEF', '#F6B042', '#E8718E', '#8B7FD8', '#66BB6A', '#FF8A65', '#26C6DA']
const CUSTOM_GROUP: WordBookGroup = { key: 'custom', label: '自定义' }
const DEFAULT_GROUPS: WordBookGroup[] = [
  { key: '', label: '全部' }, CUSTOM_GROUP, { key: 'primary', label: '小学' },
  { key: 'middle', label: '初中' }, { key: 'high', label: '高中' }, { key: 'university', label: '大学' },
  { key: 'cet4', label: '四级' }, { key: 'cet6', label: '六级' }, { key: 'kaoyan', label: '考研' },
  { key: 'abroad', label: '留学' }, { key: 'tem', label: '专四专八' }, { key: 'textbook', label: '教材' },
]

function hashStr(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) }
function pickColor(name: string) { return COVER_COLORS[hashStr(name) % COVER_COLORS.length] }
function withCustomGroup(list: WordBookGroup[]): WordBookGroup[] {
  const rest = list.filter((g) => g.key !== 'custom')
  const all = rest.find((g) => g.key === '') ?? { key: '', label: '全部' }
  return [all, CUSTOM_GROUP, ...rest.filter((g) => g.key !== '')]
}

export default function WordBookShelf() {
  const [books, setBooks] = useState<WordBookItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [group, setGroup] = useState('')
  const [groups, setGroups] = useState<WordBookGroup[]>(DEFAULT_GROUPS)
  const [loading, setLoading] = useState(true)
  const isCustomGroup = group === 'custom'

  const fetchBooks = useCallback(async (p: number, kw: string, g: string) => {
    setLoading(true)
    try {
      const res = await listWordBooks({ page: p, pageSize: PAGE_SIZE, keyword: kw || undefined, group: g || undefined })
      if (res.code !== 200) { setBooks([]); setTotal(0); return }
      setBooks(Array.isArray(res.data?.list) ? res.data.list : [])
      setTotal(res.data?.total || 0)
      if (res.data?.groups?.length) setGroups(withCustomGroup(res.data.groups))
    } catch { setBooks([]); setTotal(0) } finally { setLoading(false) }
  }, [])

  useEffect(() => { void fetchBooks(page, keyword, group) }, [page, keyword, group, fetchBooks])

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1
  const openBook = (id: number) => Taro.navigateTo({ url: `/pages/wordbook-words/index?id=${id}` })

  const renderBook = (b: WordBookItem) => {
    const cover = resolveMediaUrl(b.coverUrl)
    return (
      <View key={b.id} className="shelf__book" onClick={() => openBook(b.id)}>
        <View className="shelf__cover" style={cover ? undefined : { background: pickColor(b.name) }}>
          {cover ? <Image className="shelf__cover-img" src={cover} mode="aspectFill" /> : <Text className="shelf__cover-name">{b.name}</Text>}
          {b.level && <Text className="shelf__level">{b.level}</Text>}
        </View>
        <View className="shelf__info">
          <Text className="shelf__name">{b.name}</Text>
          <Text className="shelf__count">{b.wordCount || 0} 词</Text>
        </View>
      </View>
    )
  }

  return (
    <View className="shelf">
      <View className="shelf__nav">
        <View className="shelf__back" onClick={() => Taro.navigateBack()}><ArrowLeft size={22} color={color.charcoal} /></View>
        <Text className="shelf__title">词库书架</Text>
        <View className="shelf__back" />
      </View>
      <View className="shelf__search">
        <View className="shelf__search-box">
          <Search size={16} color="#a4a097" />
          <Input
            className="shelf__search-input"
            placeholder="搜索词库"
            value={searchInput}
            confirmType="search"
            onInput={(e) => { setSearchInput(e.detail.value); if (!e.detail.value.trim() && keyword) { setPage(1); setKeyword('') } }}
            onConfirm={() => { setPage(1); setKeyword(searchInput.trim()) }}
          />
        </View>
      </View>
      <ScrollView className="shelf__groups" scrollX enableFlex>
        <View className="shelf__groups-inner">
          {groups.map((g) => (
            <View key={g.key || 'all'} className={`shelf__group ${group === g.key ? 'shelf__group--active' : ''}`} onClick={() => { setGroup(g.key); setPage(1) }}>
              <Text className="shelf__group-text">{g.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <ScrollView className="shelf__body" scrollY enableFlex>
        {isCustomGroup && (
          <View className="shelf__custom-entry" onClick={() => Taro.navigateTo({ url: '/pages/create-custom-wordbook/index' })}>
            <Text className="shelf__custom-text">+ 新建自定义词库</Text>
          </View>
        )}
        {loading ? (
          <View className="shelf__state"><Text>加载中...</Text></View>
        ) : books.length === 0 ? (
          <View className="shelf__state"><Text>{keyword ? '没有匹配的词库' : '暂无词库'}</Text></View>
        ) : (
          <>
            <View className="shelf__grid">{books.map(renderBook)}</View>
            {totalPages > 1 && (
              <View className="shelf__pager">
                <View className={`shelf__pager-btn ${page <= 1 ? 'shelf__pager-btn--disabled' : ''}`} onClick={() => setPage((p) => Math.max(1, p - 1))}><Text>上一页</Text></View>
                <Text className="shelf__pager-info">{page} / {totalPages}</Text>
                <View className={`shelf__pager-btn ${page >= totalPages ? 'shelf__pager-btn--disabled' : ''}`} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}><Text>下一页</Text></View>
              </View>
            )}
          </>
        )}
        <View style={{ height: '48rpx' }} />
      </ScrollView>
    </View>
  )
}
