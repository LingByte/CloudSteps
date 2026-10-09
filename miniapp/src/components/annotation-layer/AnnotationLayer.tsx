import { useEffect, useRef, useState } from 'react'
import { Canvas, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Close, Del, Edit, Retweet } from '@nutui/icons-react-taro'
import './annotation-layer.scss'

type Point = { x: number; y: number }
type Stroke = { color: string; width: number; points: Point[] }
type Props = { open: boolean; storageKey: string; onClose: () => void }

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#a855f7', '#111827']

export function AnnotationLayer({ open, storageKey, onClose }: Props) {
  const canvasId = `annotation-${storageKey.replace(/[^a-z0-9]/gi, '') || 'default'}`
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const current = useRef<Stroke | null>(null)

  useEffect(() => {
    if (!open) return
    try { setStrokes(Taro.getStorageSync(storageKey) || []) } catch { setStrokes([]) }
  }, [open, storageKey])

  useEffect(() => {
    if (!open) return
    const ctx = Taro.createCanvasContext(canvasId)
    ctx.clearRect(0, 0, 375, 620)
    strokes.forEach((stroke) => {
      if (stroke.points.length < 2) return
      ctx.beginPath()
      ctx.setStrokeStyle(stroke.color)
      ctx.setLineWidth(stroke.width)
      ctx.setLineCap('round')
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
      stroke.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y))
      ctx.stroke()
    })
    ctx.draw()
  }, [open, strokes, canvasId])

  if (!open) return null
  const point = (event: any): Point => ({ x: Number(event.touches?.[0]?.x || 0), y: Number(event.touches?.[0]?.y || 0) })
  const start = (event: any) => { current.current = { color: tool === 'eraser' ? '#ffffff' : color, width: tool === 'eraser' ? 18 : 4, points: [point(event)] } }
  const move = (event: any) => { if (current.current) current.current.points.push(point(event)) }
  const end = () => { if (!current.current) return; setStrokes((prev) => [...prev, current.current as Stroke]); current.current = null }
  const undo = () => setStrokes((prev) => prev.slice(0, -1))
  const clear = () => setStrokes([])
  const save = () => { Taro.setStorageSync(storageKey, strokes); Taro.showToast({ title: '标注已保存', icon: 'success' }) }

  return <View className="annotation__mask"><View className="annotation"><View className="annotation__header"><Text>标注</Text><View onClick={onClose}><Close size={20} color="#718096" /></View></View><Canvas canvasId={canvasId} className="annotation__canvas" disableScroll onTouchStart={start} onTouchMove={move} onTouchEnd={end} /><View className="annotation__tools"><View className={`annotation__tool ${tool === 'pen' ? 'annotation__tool--active' : ''}`} onClick={() => setTool('pen')}><Edit size={16} /><Text>画笔</Text></View><View className={`annotation__tool ${tool === 'eraser' ? 'annotation__tool--active' : ''}`} onClick={() => setTool('eraser')}><Del size={16} /><Text>橡皮</Text></View><View className="annotation__tool" onClick={undo}><Retweet size={16} /><Text>撤销</Text></View><View className="annotation__tool" onClick={clear}><Text>清空</Text></View></View><View className="annotation__colors">{COLORS.map((item) => <View key={item} className={`annotation__color ${color === item ? 'annotation__color--active' : ''}`} style={{ backgroundColor: item }} onClick={() => { setColor(item); setTool('pen') }} />)}</View><View className="annotation__save" onClick={save}><Text>保存标注</Text></View></View></View>
}
