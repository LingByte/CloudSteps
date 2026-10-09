import { useEffect, useRef, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import { RealtimeVoice, type VoiceStatus } from '../../utils/realtimeVoice'
import { activateSession, completeSession, type StartSessionResponse } from '../../api/scenarioDialogue'
import { buildWebSocketURL } from '../../config/apiConfig'
import { color } from '../../styles/tokens'
import './index.scss'

const STATUS_LABEL: Record<VoiceStatus, string> = {
  idle: '待连接', connecting: '连接中…', connected: '已连接', disconnected: '已断开', error: '连接异常',
}

export default function ScenarioDialogue() {
  const [session, setSession] = useState<StartSessionResponse | null>(null)
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [userText, setUserText] = useState('')
  const [assistantText, setAssistantText] = useState('')
  const [corrections, setCorrections] = useState<string[]>([])
  const [muted, setMuted] = useState(false)
  const [ending, setEnding] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const voiceRef = useRef<RealtimeVoice | null>(null)
  const sessionRef = useRef<StartSessionResponse | null>(null)
  const endingRef = useRef(false)

  const reconnect = () => {
    const data = sessionRef.current
    const voice = voiceRef.current
    if (!data?.wsPath || !voice || endingRef.current) return
    setErrMsg('')
    void voice.connect(buildWebSocketURL(data.wsPath))
  }

  useDidHide(() => {
    voiceRef.current?.disconnect()
  })

  useDidShow(() => {
    if (sessionRef.current && voiceRef.current?.getStatus() === 'idle' && !endingRef.current) reconnect()
  })

  useEffect(() => {
    const raw = Taro.getStorageSync('lb_scenario_session')
    let data: StartSessionResponse | null = null
    try { data = raw ? JSON.parse(raw) : null } catch { data = null }
    if (!data?.sessionId || !data?.wsPath) {
      Taro.showToast({ title: '会话信息缺失', icon: 'none' })
      setTimeout(() => Taro.navigateBack(), 800)
      return
    }
    setSession(data)
    sessionRef.current = data

    if (data.voiceReady && !data.voiceReady.ready) {
      setErrMsg(data.voiceReady.hint || '语音服务未配置')
      setStatus('error')
      return
    }

    const voice = new RealtimeVoice({
      onStatusChange: setStatus,
      onUserText: setUserText,
      onAssistantDelta: (text) => setAssistantText((prev) => prev + text),
      onAssistantText: (text) => {
        setAssistantText(text)
        if (text.includes('Better:')) setCorrections((prev) => [...prev.slice(-4), text])
      },
      onError: (msg) => setErrMsg(msg),
      onConnected: () => { void activateSession(data!.sessionId) },
    })
    voiceRef.current = voice
    void voice.connect(buildWebSocketURL(data.wsPath))

    return () => { voice.disconnect(); voiceRef.current = null }
  }, [])

  const handleInterrupt = () => {
    if (status !== 'connected') return
    voiceRef.current?.interrupt()
    Taro.showToast({ title: '已打断', icon: 'none' })
  }

  const handleMute = () => {
    if (status !== 'connected') return
    setMuted(voiceRef.current?.toggleMute() ?? false)
  }

  const handleEnd = async () => {
    if (!session || ending) return
    endingRef.current = true
    setEnding(true)
    voiceRef.current?.disconnect()
    try {
      const res = await completeSession(session.sessionId)
      if (res.code === 200) {
        Taro.removeStorageSync('lb_scenario_session')
        Taro.redirectTo({ url: `/pages/scenario-review/index?sessionId=${session.sessionId}` })
      } else {
        Taro.showToast({ title: res.msg || '结束会话失败', icon: 'none' })
      }
    } catch {
      Taro.showToast({ title: '结束会话失败', icon: 'none' })
    } finally {
      endingRef.current = false
      setEnding(false)
    }
  }

  return (
    <View className="dlg">
      <View className="dlg__nav">
        <View className="dlg__back" onClick={() => Taro.navigateBack()}><ArrowLeft size={22} color={color.charcoal} /></View>
        <View className="dlg__nav-center">
          <Text className="dlg__title">{session?.scenario?.name || '情景对话'}</Text>
          <Text className={`dlg__status dlg__status--${status}`}>{STATUS_LABEL[status]}{muted && status === 'connected' ? '（已静音）' : ''}</Text>
        </View>
        <View className="dlg__back" />
      </View>

      <ScrollView className="dlg__body" scrollY enableFlex>
        {(errMsg || status === 'disconnected') && (
          <View className="dlg__error">
            <Text className="dlg__error-title">{status === 'disconnected' ? '语音连接已断开' : '语音连接失败'}</Text>
            <Text className="dlg__error-msg">{errMsg || '可以重新连接后继续对话'}</Text>
            <View className="dlg__error-retry" onClick={reconnect}>
              <Text>重试连接</Text>
            </View>
          </View>
        )}

        <View className="dlg__bubble">
          <Text className="dlg__bubble-label">你说</Text>
          <Text className="dlg__bubble-text">{userText || '...'}</Text>
        </View>

        <View className="dlg__bubble dlg__bubble--ai">
          <Text className="dlg__bubble-label">AI 教练</Text>
          <Text className="dlg__bubble-text">{assistantText || (status === 'connected' ? 'AI 正在准备开场…' : '...')}</Text>
        </View>

        {corrections.length > 0 && (
          <View className="dlg__corrections">
            <Text className="dlg__corrections-title">实时纠错</Text>
            {corrections.map((c, i) => <Text key={i} className="dlg__correction">{c}</Text>)}
          </View>
        )}
      </ScrollView>

      <View className="dlg__controls">
        <View className="dlg__ctrl" onClick={handleInterrupt}>
          <View className={`dlg__ctrl-btn ${status !== 'connected' ? 'dlg__ctrl-btn--disabled' : ''}`}><Text className="dlg__ctrl-icon">⏸</Text></View>
          <Text className="dlg__ctrl-label">打断</Text>
        </View>
        <View className="dlg__ctrl" onClick={() => void handleEnd()}>
          <View className="dlg__ctrl-btn dlg__ctrl-btn--end"><Text className="dlg__ctrl-icon">{ending ? '…' : '⏹'}</Text></View>
          <Text className="dlg__ctrl-label">{ending ? '生成复盘中' : '结束'}</Text>
        </View>
        <View className="dlg__ctrl" onClick={handleMute}>
          <View className={`dlg__ctrl-btn ${muted ? 'dlg__ctrl-btn--muted' : ''} ${status !== 'connected' ? 'dlg__ctrl-btn--disabled' : ''}`}><Text className="dlg__ctrl-icon">{muted ? '🔇' : '🎤'}</Text></View>
          <Text className="dlg__ctrl-label">{muted ? '已静音' : '静音'}</Text>
        </View>
      </View>
      <Text className="dlg__hint">{ending ? '正在生成复盘报告' : '结束后将生成复盘报告'}</Text>
    </View>
  )
}
