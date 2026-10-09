import { useEffect, useMemo, useState } from 'react'
import { Input, ScrollView, Text, View } from '@tarojs/components'
import './mobile-select-sheet.scss'

export type MobileSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

export type MobileSelectSheetProps = {
  label?: string
  title?: string
  value?: string
  options: MobileSelectOption[]
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  showSearch?: boolean
  className?: string
  size?: 'small' | 'default'
}

export function MobileSelectSheet({
  label,
  title,
  value,
  options,
  onChange,
  placeholder = '请选择',
  disabled,
  showSearch,
  className,
  size = 'default',
}: MobileSelectSheetProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!open) return
    setDraft(value || '')
    setQ('')
  }, [open, value])

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase()
    if (!keyword) return options
    return options.filter((o) => o.label.toLowerCase().includes(keyword) || o.value.toLowerCase().includes(keyword))
  }, [options, q])

  const selectedLabel = options.find((o) => o.value === value)?.label
  const compact = size === 'small'

  return (
    <View className={`mobile-select ${className || ''}`}>
      {label ? <Text className="mobile-select__label">{label}</Text> : null}
      <View
        className={`mobile-select__trigger ${compact ? 'mobile-select__trigger--small' : ''} ${disabled ? 'mobile-select__trigger--disabled' : ''}`}
        onClick={() => {
          if (!disabled) setOpen(true)
        }}
      >
        <Text className={`mobile-select__value ${selectedLabel ? '' : 'mobile-select__value--placeholder'}`}>
          {selectedLabel || placeholder}
        </Text>
        <Text className="mobile-select__arrow">▼</Text>
      </View>

      {open ? (
        <View className="mobile-select-sheet">
          <View className="mobile-select-sheet__mask" onClick={() => setOpen(false)} />
          <View className="mobile-select-sheet__panel">
            <View className="mobile-select-sheet__header">
              <Text className="mobile-select-sheet__action" onClick={() => setOpen(false)}>取消</Text>
              <Text className="mobile-select-sheet__title">{title || '请选择'}</Text>
              <Text
                className="mobile-select-sheet__action mobile-select-sheet__action--confirm"
                onClick={() => {
                  if (draft) onChange?.(draft)
                  setOpen(false)
                }}
              >确定</Text>
            </View>
            {showSearch ? (
              <View className="mobile-select-sheet__search">
                <Input className="mobile-select-sheet__search-input" value={q} placeholder="搜索" onInput={(e) => setQ(e.detail.value)} />
              </View>
            ) : null}
            <ScrollView className="mobile-select-sheet__list" scrollY>
              {filtered.length === 0 ? (
                <View className="mobile-select-sheet__empty"><Text>没有匹配选项</Text></View>
              ) : filtered.map((o) => {
                const active = draft === o.value
                return (
                  <View
                    key={o.value}
                    className={`mobile-select-sheet__option ${active ? 'mobile-select-sheet__option--active' : ''} ${o.disabled ? 'mobile-select-sheet__option--disabled' : ''}`}
                    onClick={() => {
                      if (!o.disabled) setDraft(o.value)
                    }}
                  >
                    <Text>{o.label}</Text>
                  </View>
                )
              })}
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  )
}

export default MobileSelectSheet
