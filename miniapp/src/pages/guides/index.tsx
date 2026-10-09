import { useState } from 'react'
import { View, Text, ScrollView, Swiper, SwiperItem, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import { getApiBaseURL } from '../../config/apiConfig'
import { color } from '../../styles/tokens'
import './index.scss'

type GuideImage = { id: string; src: string; label: string }
type GuideSection = { id: string; title: string; images: GuideImage[] }

// 指南图片由服务端静态目录提供: <apiOrigin>/media/guides/<folder>/step-XX.jpg
// 需将 web/public/guides 拷贝到后端 uploads 目录下的 guides/ 子目录。
const mediaBase = `${getApiBaseURL().replace(/\/api\/?$/, '')}/media/guides`

function stepImages(folder: string, count: number): GuideImage[] {
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, '0')
    return { id: `${folder}-step-${n}`, src: `${mediaBase}/${folder}/step-${n}.jpg`, label: `第 ${i + 1} 步` }
  })
}

const SECTIONS: GuideSection[] = [
  { id: 'word-training', title: '单词训练', images: stepImages('word-training', 19) },
  { id: 'student-management', title: '学员管理', images: stepImages('student-management', 6) },
]

export default function Guides() {
  const [sectionId, setSectionId] = useState(SECTIONS[0].id)
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState<Record<string, boolean>>({})
  const section = SECTIONS.find((s) => s.id === sectionId) ?? SECTIONS[0]
  const images = section.images
  const total = images.length
  const current = images[index]

  const switchSection = (id: string) => { setSectionId(id); setIndex(0) }

  return (
    <View className="guides">
      <View className="gd__nav">
        <View className="gd__back" onClick={() => Taro.navigateBack()}><ArrowLeft size={22} color={color.charcoal} /></View>
        <Text className="gd__title">使用指南</Text>
        <Text className="gd__counter">{total > 0 ? `${index + 1} / ${total}` : ''}</Text>
      </View>

      <View className="gd__tabs">
        {SECTIONS.map((s) => (
          <View key={s.id} className={`gd__tab ${s.id === sectionId ? 'gd__tab--active' : ''}`} onClick={() => switchSection(s.id)}>
            <Text className="gd__tab-text">{s.title}</Text>
          </View>
        ))}
      </View>

      <Swiper
        key={sectionId}
        className="gd__swiper"
        current={index}
        onChange={(e) => setIndex(e.detail.current)}
      >
        {images.map((img) => (
          <SwiperItem key={img.id}>
            <View className="gd__slide">
              {failed[img.id] ? (
                <View className="gd__placeholder"><Text className="gd__placeholder-text">图片加载失败</Text></View>
              ) : (
                <Image
                  className="gd__image"
                  src={img.src}
                  mode="aspectFit"
                  onError={() => setFailed((prev) => ({ ...prev, [img.id]: true }))}
                  onClick={() => Taro.previewImage({ urls: images.map((x) => x.src), current: img.src })}
                />
              )}
            </View>
          </SwiperItem>
        ))}
      </Swiper>

      <View className="gd__footer">
        <View className="gd__caption-row">
          <Text className="gd__caption">{current ? `${section.title} · ${current.label}` : ''}</Text>
        </View>
        <View className="gd__progress">
          <View className="gd__progress-bar" style={{ width: total > 0 ? `${((index + 1) / total) * 100}%` : '0%' }} />
        </View>
        <ScrollView className="gd__thumbs" scrollX enableFlex>
          {images.map((img, i) => (
            <View key={img.id} className={`gd__thumb ${i === index ? 'gd__thumb--active' : ''}`} onClick={() => setIndex(i)}>
              <Text className="gd__thumb-num">{i + 1}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  )
}
