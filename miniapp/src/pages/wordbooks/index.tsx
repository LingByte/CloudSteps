import { useCallback, useEffect, useState } from 'react'
import { Image, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft, ArrowRight, List, Plus, Right, Search } from '@nutui/icons-react-taro'
import { listWordBooks, type WordBookGroup, type WordBookItem } from '../../api/wordbooks'
import { resolveMediaUrl } from '../../utils/mediaUrl'
import { AppHeader } from '../../components/app-header/AppHeader'
import './index.scss'

const PAGE_SIZE = 12
const CUSTOM_GROUP: WordBookGroup = { key: 'custom', label: '自定义' }
const DEFAULT_GROUPS: WordBookGroup[] = [
  { key: '', label: '全部' }, CUSTOM_GROUP, { key: 'primary', label: '小学' },
  { key: 'middle', label: '初中' }, { key: 'high', label: '高中' }, { key: 'university', label: '大学' },
  { key: 'cet4', label: '四级' }, { key: 'cet6', label: '六级' }, { key: 'kaoyan', label: '考研' },
  { key: 'abroad', label: '留学' }, { key: 'tem', label: '专四专八' }, { key: 'textbook', label: '教材' },
]

const COVER_GRADIENTS = [
  'linear-gradient(135deg, #4ECDC4, #44A5A0)',
  'linear-gradient(135deg, #5B8DEF, #4A7BC8)',
  'linear-gradient(135deg, #F6B042, #E89832)',
  'linear-gradient(135deg, #E8718E, #D45C78)',
  'linear-gradient(135deg, #8B7FD8, #7B6BC8)',
  'linear-gradient(135deg, #66BB6A, #4CAF50)',
  'linear-gradient(135deg, #FF8A65, #FF7043)',
  'linear-gradient(135deg, #26C6DA, #00ACC1)',
]

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function pickGradient(tag: string): string {
  return COVER_GRADIENTS[hashStr(tag) % COVER_GRADIENTS.length]
}

function withCustomGroup(list: WordBookGroup[]): WordBookGroup[] {
  const rest = list.filter((g) => g.key !== 'custom')
  const all = rest.find((g) => g.key === '') ?? { key: '', label: '全部' }
  return [all, CUSTOM_GROUP, ...rest.filter((g) => g.key !== '')]
}

export default function Wordbooks() {
  const [books, setBooks] = useState<WordBookItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [group, setGroup] = useState('')
  const [groups, setGroups] = useState<WordBookGroup[]>(DEFAULT_GROUPS)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const isCustomGroup = group === 'custom'

  const fetchBooks = useCallback(async (p: number, kw: string, g: string) => {
    setLoading(true)
    setErr(null)
    try {
      const res = await listWordBooks({ page: p, pageSize: PAGE_SIZE, keyword: kw || undefined, group: g || undefined })
      if (res.code !== 200) {
        setErr(res.msg || '加载失败')
        setBooks([])
        setTotal(0)
        return
      }
      setBooks(Array.isArray(res.data?.list) ? res.data.list : [])
      setTotal(res.data?.total || 0)
      if (res.data?.groups?.length) setGroups(withCustomGroup(res.data.groups))
    } catch (e: any) {
      setErr(e?.msg || '加载失败')
      setBooks([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchBooks(page, keyword, group)
  }, [page, keyword, group, fetchBooks])

  useEffect(() => {
    listWordBooks({ page: 1, pageSize: 1 })
      .then((res) => {
        if (res.code === 200 && res.data?.groups?.length) setGroups(withCustomGroup(res.data.groups))
      })
      .catch(() => {})
  }, [])

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1

  const renderBook = (b: WordBookItem) => {
    const coverImage = resolveMediaUrl(b.coverUrl)
    return (
      <View key={b.id} className="wordbooks__book" onClick={() => Taro.navigateTo({ url: `/pages/wordbook-words/index?id=${b.id}` })}>
        <View className="wordbooks__cover" style={coverImage ? undefined : { background: pickGradient(b.name) }}>
          {coverImage ? <Image className="wordbooks__cover-img" src={coverImage} mode="aspectFill" /> : <Text className="wordbooks__cover-name">{b.name}</Text>}
          {b.level ? <Text className="wordbooks__level">{b.level}</Text> : null}
        </View>
        <View className="wordbooks__info">
          <Text className="wordbooks__name">{b.name}</Text>
          <View className="wordbooks__meta">
            <View className="wordbooks__count"><List size={12} color="#787671" /><Text>{b.wordCount || 0} 词</Text></View>
            <Right size={14} color="#a4a097" />
          </View>
        </View>
      </View>
    )
  }

  return (
    <View className="wordbooks-wrap">
      <AppHeader />
      <ScrollView className="wordbooks" scrollY enableFlex>
        <View className="wordbooks__top">
          <View className="wordbooks__title-row">
            <Text className="wordbooks__title">词库书架</Text>
            <View className="wordbooks__search-box">
              <Search size={16} color="#787671" />
              <Input
                className="wordbooks__search-input"
                value={searchInput}
                placeholder="搜索词库名称…"
                placeholderClass="wordbooks__search-placeholder"
                confirmType="search"
                onInput={(e) => {
                  setSearchInput(e.detail.value)
                  if (!e.detail.value.trim() && keyword) {
                    setPage(1)
                    setKeyword('')
                  }
                }}
                onConfirm={() => {
                  setPage(1)
                  setKeyword(searchInput.trim())
                }}
              />
            </View>
          </View>

          <ScrollView className="wordbooks__groups" scrollX showScrollbar={false}>
            <View className="wordbooks__groups-inner">
              {groups.map((g) => (
                <View key={g.key || 'all'} className={`wordbooks__group ${group === g.key ? 'wordbooks__group--active' : ''}`} onClick={() => { setGroup(g.key); setPage(1) }}>
                  <Text className="wordbooks__group-text">{g.label}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        {err ? <View className="wordbooks__error"><Text>{err}</Text></View> : null}

        {isCustomGroup ? (
          <View className="wordbooks__custom-area">
            <View className="wordbooks__custom-entry" onClick={() => Taro.navigateTo({ url: '/pages/create-custom-wordbook/index' })}>
              <Plus size={18} color="#4ECDC4" />
              <Text className="wordbooks__custom-text">自定义词库</Text>
            </View>
            {loading ? <View className="wordbooks__state"><Text>加载中…</Text></View> : books.length > 0 ? <View className="wordbooks__grid">{books.map(renderBook)}</View> : null}
          </View>
        ) : loading ? (
          <View className="wordbooks__state"><Text>加载中…</Text></View>
        ) : books.length === 0 ? (
          <View className="wordbooks__state"><Text>{keyword ? '没有匹配的词库' : '暂无词库'}</Text></View>
        ) : (
          <View className="wordbooks__grid">{books.map(renderBook)}</View>
        )}

        {totalPages > 1 && !loading ? (
          <View className="wordbooks__pager">
            <View className={`wordbooks__pager-btn ${page <= 1 ? 'wordbooks__pager-btn--disabled' : ''}`} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ArrowLeft size={16} color="#37352f" /><Text>上一页</Text>
            </View>
            <Text className="wordbooks__pager-info">{page} / {totalPages}</Text>
            <View className={`wordbooks__pager-btn ${page >= totalPages ? 'wordbooks__pager-btn--disabled' : ''}`} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              <Text>下一页</Text><ArrowRight size={16} color="#37352f" />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}
