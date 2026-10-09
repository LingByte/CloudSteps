import Taro from '@tarojs/taro'
import type { CustomParsedWord } from '../api/wordbooks'

const MAX_WORDS = 2000
const HEADER_HINTS = new Set(['word', '单词', 'english', 'lemma', 'vocabulary', 'vocab', '词', '英文'])

function normalizeWord(raw: string): string {
  return raw.trim().replace(/^["'`“”‘’\[\]()（）]+|["'`“”‘’\[\]()（）]+$/g, '').trim()
}

function isLikelyWord(s: string): boolean {
  if (!s || s.length > 64) return false
  const parts = s.split(/\s+/).filter(Boolean)
  if (parts.length === 0 || parts.length > 6) return false
  return parts.every((p) => /^[a-z][a-z0-9'’\-./]*$/i.test(p))
}

function containsHan(s: string): boolean {
  return /[\u4e00-\u9fff]/.test(s)
}

function mergeDedup(items: CustomParsedWord[]): CustomParsedWord[] {
  const seen = new Set<string>()
  const out: CustomParsedWord[] = []
  for (const it of items) {
    const word = normalizeWord(it.word || '')
    if (!isLikelyWord(word)) continue
    const key = word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const translation = (it.translation || '').trim()
    const phonetic = (it.phonetic || '').trim()
    out.push({ word, translation, translationShort: (it.translationShort || translation).trim(), phonetic })
    if (out.length >= MAX_WORDS) break
  }
  return out
}

function splitWordLine(line: string): CustomParsedWord {
  if (line.includes('\t')) {
    const parts = line.split('\t')
    return { word: parts[0] || '', translation: parts[1] || '', phonetic: parts[2] || '' }
  }
  const fields = line.trim().split(/\s+/)
  if (fields.length <= 1) return { word: fields[0] || '' }
  for (let i = 0; i < fields.length; i++) {
    if (containsHan(fields[i])) {
      return { word: fields.slice(0, i).join(' '), translation: fields.slice(i).join(' ') }
    }
  }
  return { word: fields[0] }
}

export function parseManualTextLocal(text: string): CustomParsedWord[] {
  const items: CustomParsedWord[] = []
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = line.trim()
    if (trimmed) items.push(splitWordLine(trimmed))
  }
  return mergeDedup(items)
}

function rowsToWords(rows: string[][]): CustomParsedWord[] {
  const items: CustomParsedWord[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || []
    const cell0 = String(row[0] ?? '').trim()
    if (!cell0) continue
    if (i === 0 && HEADER_HINTS.has(cell0.toLowerCase())) continue
    items.push({ word: cell0, translation: String(row[1] ?? '').trim(), phonetic: String(row[2] ?? '').trim() })
  }
  return mergeDedup(items)
}

async function loadXlsx() {
  return import('xlsx')
}

function readFileArrayBuffer(filePath: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    Taro.getFileSystemManager().readFile({
      filePath,
      success: (res) => resolve(res.data as ArrayBuffer),
      fail: reject,
    })
  })
}

export async function parseExcelFileLocal(filePath: string): Promise<CustomParsedWord[]> {
  const XLSX = await loadXlsx()
  const buf = await readFileArrayBuffer(filePath)
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return []
  const sheet = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false }) as string[][]
  return rowsToWords(rows)
}

export async function downloadExcelTemplateLocal(): Promise<void> {
  const XLSX = await loadXlsx()
  const aoa = [
    ['word', 'translation', 'phonetic'],
    ['apple', '苹果', '/ˈæpl/'],
    ['banana', '香蕉', ''],
    ['courage', '勇气；胆量', ''],
  ]
  const sheet = XLSX.utils.aoa_to_sheet(aoa)
  sheet['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 16 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, '自定义词库')
  const output = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const data = output instanceof ArrayBuffer ? output : new Uint8Array(output).buffer
  const filePath = `${Taro.env.USER_DATA_PATH}/custom-wordbook-template.xlsx`
  await new Promise<void>((resolve, reject) => {
    Taro.getFileSystemManager().writeFile({
      filePath,
      data,
      success: () => resolve(),
      fail: reject,
    })
  })
  await Taro.openDocument({ filePath, fileType: 'xlsx', showMenu: true })
}
