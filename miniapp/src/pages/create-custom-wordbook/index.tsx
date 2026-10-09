import { useState } from 'react'
import { Input, ScrollView, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Del } from '@nutui/icons-react-taro'
import { PageBackHeader } from '../../components/page-back-header/PageBackHeader'
import { CloudButton } from '../../components/button'
import {
  createCustomWordBook,
  enrichCustomWordBookWords,
  type CustomParsedWord,
} from '../../api/wordbooks'
import {
  downloadExcelTemplateLocal,
  parseExcelFileLocal,
  parseManualTextLocal,
} from '../../utils/customWordBookLocal'
import { color } from '../../styles/tokens'
import './index.scss'

type ImportTab = 'manual' | 'excel'

export default function CreateCustomWordBook() {
  const [name, setName] = useState('')
  const [tab, setTab] = useState<ImportTab>('manual')
  const [manualOpen, setManualOpen] = useState(false)
  const [manualText, setManualText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [words, setWords] = useState<CustomParsedWord[]>([])
  const [fileLabel, setFileLabel] = useState('')

  const applyWithEnrich = async (list: CustomParsedWord[]) => {
    try {
      const res = await enrichCustomWordBookWords(list)
      if (res.code === 200 && Array.isArray(res.data?.list) && res.data.list.length) {
        setWords(res.data.list)
        Taro.showToast({ title: `已识别 ${res.data.total || res.data.list.length} 个单词`, icon: 'success' })
        return
      }
    } catch {
      /* noop */
    }
    setWords(list)
    Taro.showToast({ title: `已识别 ${list.length} 个单词`, icon: 'success' })
  }

  const runParseManual = async () => {
    if (!manualText.trim()) {
      Taro.showToast({ title: '请输入单词内容', icon: 'none' })
      return
    }
    const list = parseManualTextLocal(manualText)
    if (!list.length) {
      Taro.showToast({ title: '未识别到有效单词', icon: 'none' })
      return
    }
    setParsing(true)
    try {
      await applyWithEnrich(list)
      setManualText('')
      setManualOpen(false)
    } finally {
      setParsing(false)
    }
  }

  const runParseExcel = async (filePath: string, fileName: string) => {
    setParsing(true)
    setFileLabel(fileName)
    try {
      const list = await parseExcelFileLocal(filePath)
      if (!list.length) {
        Taro.showToast({ title: '文件中没有可识别的单词', icon: 'none' })
        return
      }
      await applyWithEnrich(list)
    } catch {
      Taro.showToast({ title: '文件解析失败', icon: 'none' })
    } finally {
      setParsing(false)
    }
  }

  const pickExcel = () => {
    Taro.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res) => {
        const file = res.tempFiles?.[0]
        if (file?.path) void runParseExcel(file.path, file.name || file.path)
      },
      fail: () => {},
    })
  }

  const downloadTemplate = async () => {
    try {
      await downloadExcelTemplateLocal()
      Taro.showToast({ title: '模板已打开', icon: 'success' })
    } catch {
      Taro.showToast({ title: '模板生成失败', icon: 'none' })
    }
  }

  const updateWord = (index: number, patch: Partial<CustomParsedWord>) => {
    setWords((prev) => prev.map((word, i) => (i === index ? { ...word, ...patch } : word)))
  }

  const removeWord = (index: number) => {
    setWords((prev) => prev.filter((_, i) => i !== index))
  }

  const handleCreate = async () => {
    const bookName = name.trim()
    if (!bookName) {
      Taro.showToast({ title: '请输入词库名称', icon: 'none' })
      return
    }
    if (!words.length) {
      Taro.showToast({ title: '请先导入单词', icon: 'none' })
      return
    }
    setCreating(true)
    try {
      const res = await createCustomWordBook({ name: bookName, words })
      if (res.code !== 200) {
        Taro.showToast({ title: res.msg || '创建失败', icon: 'none' })
        return
      }
      Taro.showToast({ title: '词库创建成功', icon: 'success' })
      const id = res.data?.id
      if (id) Taro.redirectTo({ url: `/pages/wordbook-words/index?id=${id}&name=${encodeURIComponent(bookName)}` })
      else Taro.reLaunch({ url: '/pages/home/index' })
    } catch (e: any) {
      Taro.showToast({ title: e?.msg || '创建失败', icon: 'none' })
    } finally {
      setCreating(false)
    }
  }

  return (
    <View className="create-custom-wordbook">
      <PageBackHeader title="创建自定义词库" fallbackTo="/pages/wordbook-shelf/index" />
      <ScrollView className="create-custom-wordbook__content" scrollY enableFlex>
        <View className="create-custom-wordbook__card">
          <View className="create-custom-wordbook__field">
            <Text className="create-custom-wordbook__label">词库名称</Text>
            <Input className="create-custom-wordbook__input" maxlength={64} value={name} onInput={(e) => setName(e.detail.value)} placeholder="例如：我的高频词" />
          </View>

          <View className="create-custom-wordbook__import">
            <View className="create-custom-wordbook__tabs">
              {([['manual', '手动输入'], ['excel', 'Excel 导入']] as Array<[ImportTab, string]>).map(([key, label]) => (
                <View key={key} className={`create-custom-wordbook__tab ${tab === key ? 'create-custom-wordbook__tab--active' : ''}`} onClick={() => setTab(key)}>
                  <Text>{label}</Text>
                  {tab === key ? <View className="create-custom-wordbook__tab-line" /> : null}
                </View>
              ))}
            </View>

            {tab === 'manual' ? (
              <View className="create-custom-wordbook__import-body">
                <CloudButton className="create-custom-wordbook__import-btn" disabled={parsing} onClick={() => setManualOpen(true)}>输入单词</CloudButton>
                <Text className="create-custom-wordbook__import-hint">每行一个单词，支持：word 释义 /音标/</Text>
                <Text className="create-custom-wordbook__import-sub">也支持 tab 分隔：word → 释义 → 音标</Text>
              </View>
            ) : (
              <View className="create-custom-wordbook__import-body">
                <View className="create-custom-wordbook__excel-actions">
                  <CloudButton variant="outline" onClick={() => void downloadTemplate()}>下载模板</CloudButton>
                  <CloudButton disabled={parsing} onClick={pickExcel}>{parsing ? '解析中…' : '选择 Excel'}</CloudButton>
                </View>
                <Text className="create-custom-wordbook__import-hint">支持 .xlsx / .xlsm / .csv / .txt / .xls</Text>
                {fileLabel ? <Text className="create-custom-wordbook__file">{fileLabel}</Text> : null}
              </View>
            )}
          </View>
        </View>

        {words.length ? (
          <View className="create-custom-wordbook__preview">
            <View className="create-custom-wordbook__preview-head">
              <Text className="create-custom-wordbook__preview-title">单词预览</Text>
              <Text className="create-custom-wordbook__preview-count">共 {words.length} 个</Text>
            </View>
            <ScrollView className="create-custom-wordbook__word-list" scrollY>
              {words.map((word, index) => (
                <View key={`${word.word}-${index}`} className="create-custom-wordbook__word">
                  <Text className="create-custom-wordbook__index">{index + 1}</Text>
                  <View className="create-custom-wordbook__word-fields">
                    <Input className="create-custom-wordbook__input" value={word.word} onInput={(e) => updateWord(index, { word: e.detail.value })} />
                    <View className="create-custom-wordbook__word-grid">
                      <Input className="create-custom-wordbook__input" value={word.translation || word.translationShort || ''} onInput={(e) => updateWord(index, { translation: e.detail.value, translationShort: e.detail.value })} placeholder="释义" />
                      <Input className="create-custom-wordbook__input" value={word.phonetic || ''} onInput={(e) => updateWord(index, { phonetic: e.detail.value })} placeholder="音标" />
                    </View>
                  </View>
                  <View className="create-custom-wordbook__remove" onClick={() => removeWord(index)}><Del size={16} color={color.mutedForeground} /></View>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View className="create-custom-wordbook__submit-wrap">
          <CloudButton className="create-custom-wordbook__submit" loading={creating} disabled={creating || parsing || !words.length} onClick={() => void handleCreate()}>
            {creating ? '创建中…' : words.length ? `确认创建（${words.length} 词）` : '确认创建'}
          </CloudButton>
        </View>
      </ScrollView>

      {manualOpen ? (
        <View className="create-custom-wordbook__mask" onClick={() => { if (!parsing) setManualOpen(false) }}>
          <View className="create-custom-wordbook__modal" onClick={(e) => e.stopPropagation()}>
            <Text className="create-custom-wordbook__modal-title">输入单词</Text>
            <Textarea className="create-custom-wordbook__textarea" value={manualText} onInput={(e) => setManualText(e.detail.value)} placeholder={'apple 苹果 /ˈæpl/\nbanana 香蕉\ncourage 勇气；胆量'} />
            <View className="create-custom-wordbook__modal-actions">
              <CloudButton variant="ghost" disabled={parsing} onClick={() => setManualOpen(false)}>取消</CloudButton>
              <CloudButton disabled={parsing} onClick={() => void runParseManual()}>{parsing ? '解析中…' : '解析'}</CloudButton>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}
