/**
 * 小程序端实时语音桥 — 对齐 web/src/hooks/useRealtimeVoice.ts。
 *
 * 协议一致：
 *  - Client → server: 二进制 PCM16LE @16kHz；JSON {type:'abort'|'stop'}
 *  - Server → client: 二进制 PCM16LE @output_sample_rate；JSON ready/stt/assistant/barge_in/error
 *
 * 差异：
 *  - 采集用 Taro.getRecorderManager()(format:'PCM', 16kHz, 单声道)
 *  - 播放：把 PCM 块包 WAV 头写临时文件，用 InnerAudioContext 顺序播放
 *    （小程序无法直接播裸 PCM，按 ~0.5s 分块近似流式）
 */
import Taro from '@tarojs/taro'

export type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

export interface RealtimeVoiceCallbacks {
  onUserText?: (text: string) => void
  onAssistantText?: (text: string) => void
  onAssistantDelta?: (text: string) => void
  onStatusChange?: (status: VoiceStatus) => void
  onError?: (message: string) => void
  onConnected?: () => void
}

const SAMPLE_RATE = 16000
/** 播放分块阈值：约 0.5s 的 PCM16 字节数（按 24kHz 输出估算） */
const PLAY_CHUNK_BYTES = 24000
const MAX_WAV_FILES = 32

function buildWav(pcm: ArrayBuffer, sampleRate: number): ArrayBuffer {
  const dataLen = pcm.byteLength
  const buf = new ArrayBuffer(44 + dataLen)
  const v = new DataView(buf)
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)) }
  writeStr(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); writeStr(8, 'WAVE')
  writeStr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  writeStr(36, 'data'); v.setUint32(40, dataLen, true)
  new Uint8Array(buf, 44).set(new Uint8Array(pcm))
  return buf
}

export class RealtimeVoice {
  private ws: Taro.SocketTask | null = null
  private recorder = Taro.getRecorderManager()
  private player: Taro.InnerAudioContext | null = null
  private fs = Taro.getFileSystemManager()

  private status: VoiceStatus = 'idle'
  private muted = false
  private streaming = false
  private playbackRate = 24000
  private pcmBuf = new Uint8Array(0)
  private playQueue: string[] = []
  private playing = false
  private wavSeq = 0
  private destroyed = false
  private connecting = false
  private generation = 0
  private cb: RealtimeVoiceCallbacks

  constructor(callbacks: RealtimeVoiceCallbacks) {
    this.cb = callbacks
    this.recorder.onFrameRecorded((res) => {
      if (!this.streaming || this.muted || !res.frameBuffer) return
      this.ws?.send({ data: res.frameBuffer, fail: () => {} })
    })
    this.recorder.onError((err) => {
      this.setStatus('error')
      this.cb.onError?.(err?.errMsg || '录音失败')
    })
    this.recorder.onStop(() => { /* noop */ })
  }

  private setStatus(s: VoiceStatus) {
    this.status = s
    this.cb.onStatusChange?.(s)
  }

  getStatus() { return this.status }
  isMuted() { return this.muted }

  private appendPcm(chunk: ArrayBuffer) {
    const bytes = new Uint8Array(chunk)
    const merged = new Uint8Array(this.pcmBuf.length + bytes.length)
    merged.set(this.pcmBuf); merged.set(bytes, this.pcmBuf.length)
    this.pcmBuf = merged
    while (this.pcmBuf.length >= PLAY_CHUNK_BYTES) {
      const frame = this.pcmBuf.slice(0, PLAY_CHUNK_BYTES)
      this.pcmBuf = this.pcmBuf.slice(PLAY_CHUNK_BYTES)
      this.enqueueWav(frame.buffer as ArrayBuffer)
    }
  }

  private flushPcm() {
    if (this.pcmBuf.length > 0) {
      this.enqueueWav(this.pcmBuf.buffer as ArrayBuffer)
      this.pcmBuf = new Uint8Array(0)
    }
  }

  private enqueueWav(pcm: ArrayBuffer) {
    const path = `${Taro.env.USER_DATA_PATH}/rv_${Date.now()}_${this.wavSeq++ % MAX_WAV_FILES}.wav`
    try {
      this.fs.writeFileSync(path, buildWav(pcm, this.playbackRate), 'binary')
      this.playQueue.push(path)
      void this.pumpPlayback()
    } catch { /* ignore */ }
  }

  private async pumpPlayback() {
    if (this.playing || this.destroyed) return
    const next = this.playQueue.shift()
    if (!next) return
    this.playing = true
    if (this.player) { try { this.player.destroy() } catch { /* ignore */ } }
    const ctx = Taro.createInnerAudioContext()
    this.player = ctx
    ctx.src = next
    ctx.onEnded(() => {
      this.playing = false
      try { this.fs.unlinkSync(next) } catch { /* ignore */ }
      void this.pumpPlayback()
    })
    ctx.onError(() => {
      this.playing = false
      try { this.fs.unlinkSync(next) } catch { /* ignore */ }
      void this.pumpPlayback()
    })
    ctx.play()
  }

  private stopPlayback() {
    for (const path of this.playQueue) {
      try { this.fs.unlinkSync(path) } catch { /* ignore */ }
    }
    this.playQueue = []
    this.pcmBuf = new Uint8Array(0)
    if (this.player) {
      try { this.player.stop(); this.player.destroy() } catch { /* ignore */ }
      this.player = null
    }
    this.playing = false
  }

  private handleText(raw: string) {
    let msg: Record<string, any>
    try { msg = JSON.parse(raw) } catch { return }
    switch (msg.type) {
      case 'ready': {
        const rate = Number(msg.output_sample_rate || 0)
        if (rate > 0) this.playbackRate = rate
        this.streaming = true
        this.setStatus('connected')
        this.cb.onConnected?.()
        break
      }
      case 'stt': {
        const text = String(msg.text || '')
        if (text) this.cb.onUserText?.(text)
        break
      }
      case 'assistant': {
        const text = String(msg.text || '')
        if (msg.final) {
          this.flushPcm()
          if (text) this.cb.onAssistantText?.(text)
        } else if (text) {
          this.cb.onAssistantDelta?.(text)
        }
        break
      }
      case 'barge_in': this.stopPlayback(); break
      case 'error': {
        this.cb.onError?.(String(msg.message || '语音服务错误'))
        if (msg.fatal) this.setStatus('error')
        break
      }
    }
  }

  async connect(wsUrl: string) {
    if (!wsUrl || this.connecting) return
    const generation = ++this.generation
    this.destroyed = false
    this.connecting = true
    this.cleanup(false)
    this.setStatus('connecting')
    try {
      // 录音权限
      await new Promise<void>((resolve) => {
        Taro.authorize({
          scope: 'scope.record',
          success: () => resolve(),
          fail: () => resolve(),
        })
      })
      if (generation !== this.generation || this.destroyed) return

      const task = Taro.connectSocket({
        url: wsUrl,
        fail: (err) => {
          if (generation !== this.generation || this.destroyed) return
          this.setStatus('error')
          this.cb.onError?.(err?.errMsg || 'WebSocket 连接失败')
        },
      })
      this.ws = await task
      if (generation !== this.generation || this.destroyed) {
        try { this.ws.close({}) } catch { /* ignore */ }
        this.ws = null
        return
      }

      this.ws.onMessage((res) => {
        if (generation !== this.generation || this.destroyed) return
        if (typeof res.data === 'string') this.handleText(res.data)
        else if (res.data instanceof ArrayBuffer) this.appendPcm(res.data)
      })
      this.ws.onClose(() => {
        if (generation !== this.generation || this.destroyed) return
        this.setStatus('disconnected')
        this.cleanup(false)
      })
      this.ws.onError(() => {
        if (generation !== this.generation || this.destroyed) return
        this.setStatus('error')
        this.cb.onError?.('WebSocket 连接失败')
      })

      this.recorder.start({
        format: 'PCM',
        sampleRate: SAMPLE_RATE,
        numberOfChannels: 1,
        frameSize: 1,
        duration: 600000,
      } as any)
    } catch (e: any) {
      if (generation !== this.generation || this.destroyed) return
      this.setStatus('error')
      this.cb.onError?.(e?.errMsg || e?.message || '连接失败')
      this.cleanup(false)
    } finally {
      if (generation === this.generation) this.connecting = false
    }
  }

  private sendJSON(obj: object) {
    try { this.ws?.send({ data: JSON.stringify(obj) } as any) } catch { /* ignore */ }
  }

  interrupt() {
    this.sendJSON({ type: 'abort' })
    this.stopPlayback()
  }

  toggleMute() {
    this.muted = !this.muted
    return this.muted
  }

  private cleanup(notifyStop: boolean) {
    this.streaming = false
    if (notifyStop) this.sendJSON({ type: 'stop' })
    try { this.recorder.stop() } catch { /* ignore */ }
    this.stopPlayback()
    if (this.ws) {
      try { this.ws.close({}) } catch { /* ignore */ }
      this.ws = null
    }
  }

  disconnect() {
    this.destroyed = true
    this.generation += 1
    this.cleanup(true)
    this.setStatus('idle')
  }
}
