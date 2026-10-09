import { useMemo } from 'react'
import { Text, View } from '@tarojs/components'
import { ArrowUp } from '@nutui/icons-react-taro'
import './vocab-test-result-view.scss'

export type VocabTestResultPayload = {
  level: string
  estimatedVocab: number
  correctCount: number
  totalCount: number
}

const LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11'] as const
export type VocabLevel = (typeof LEVELS)[number]

export const VOCAB_LEVEL_MAP: Record<VocabLevel, number> = {
  L0: 100,
  L1: 300,
  L2: 500,
  L3: 800,
  L4: 1200,
  L5: 1800,
  L6: 2500,
  L7: 3500,
  L8: 5000,
  L9: 7000,
  L10: 10000,
  L11: 15000,
}

const LEVEL_LABEL: Record<VocabLevel, string> = {
  L0: '英语启蒙',
  L1: '小学初级',
  L2: '小学中级',
  L3: '小学高级',
  L4: '初中初级',
  L5: '初中高级',
  L6: '高中 / 四级',
  L7: '高中高级 / 四级优秀',
  L8: '六级 / 考研',
  L9: '雅思 / 托福起步',
  L10: '雅思高分 / 托福',
  L11: 'GRE / 学术进阶',
}

const STAGE_LABEL = {
  enlighten: '启蒙',
  foundation: '筑基',
  ascent: '拾阶',
  mastery: '臻学',
} as const

const RUNG_LABEL = {
  beginner: '初阶',
  basic: '基础',
  advanced: '进阶',
} as const

const PYRAMID_STAGE: Record<VocabLevel, { stage: keyof typeof STAGE_LABEL; rung: keyof typeof RUNG_LABEL }> = {
  L0: { stage: 'enlighten', rung: 'beginner' },
  L1: { stage: 'enlighten', rung: 'basic' },
  L2: { stage: 'enlighten', rung: 'advanced' },
  L3: { stage: 'foundation', rung: 'beginner' },
  L4: { stage: 'foundation', rung: 'basic' },
  L5: { stage: 'foundation', rung: 'advanced' },
  L6: { stage: 'ascent', rung: 'beginner' },
  L7: { stage: 'ascent', rung: 'basic' },
  L8: { stage: 'ascent', rung: 'advanced' },
  L9: { stage: 'mastery', rung: 'beginner' },
  L10: { stage: 'mastery', rung: 'advanced' },
  L11: { stage: 'mastery', rung: 'advanced' },
}

const PYRAMID_ROWS: Array<{
  stage: keyof typeof STAGE_LABEL
  stageColor: string
  left: number
  top: number
  height: number
  levels: Array<{ level: VocabLevel; rung: keyof typeof RUNG_LABEL; color: string }>
}> = [
  {
    stage: 'mastery', stageColor: '#16805E', left: 77, top: 0, height: 24,
    levels: [
      { level: 'L10', rung: 'advanced', color: '#16805E' },
      { level: 'L9', rung: 'beginner', color: '#2EA789' },
    ],
  },
  {
    stage: 'ascent', stageColor: '#4DAA48', left: 54, top: 25, height: 24,
    levels: [
      { level: 'L8', rung: 'advanced', color: '#4DAA48' },
      { level: 'L7', rung: 'basic', color: '#69C47E' },
      { level: 'L6', rung: 'beginner', color: '#93E1C2' },
    ],
  },
  {
    stage: 'foundation', stageColor: '#FFAD00', left: 31.5, top: 50, height: 24,
    levels: [
      { level: 'L5', rung: 'advanced', color: '#FFAD00' },
      { level: 'L4', rung: 'basic', color: '#FFCA00' },
      { level: 'L3', rung: 'beginner', color: '#FFE3A8' },
    ],
  },
  {
    stage: 'enlighten', stageColor: '#E74718', left: 13.5, top: 75, height: 25,
    levels: [
      { level: 'L2', rung: 'advanced', color: '#E74718' },
      { level: 'L1', rung: 'basic', color: '#F56548' },
      { level: 'L0', rung: 'beginner', color: '#FA8876' },
    ],
  },
]

const LEGACY_CEFR_TO_LEVEL: Record<string, VocabLevel> = { A1: 'L1', A2: 'L3', B1: 'L5', B2: 'L7', C1: 'L9' }

export const vocabToLevel = (vocab: number): VocabLevel => {
  let result: VocabLevel = 'L0'
  for (const lv of LEVELS) if (vocab >= VOCAB_LEVEL_MAP[lv]) result = lv
  return result
}

export const clampVocabLevel = (lv: string): VocabLevel => {
  const up = String(lv || '').toUpperCase()
  if (up in LEGACY_CEFR_TO_LEVEL) return LEGACY_CEFR_TO_LEVEL[up]
  return (LEVELS.find((x) => x === up) as VocabLevel) || 'L0'
}

const chineseLevel = (vocab: number) => {
  if (vocab < 200) return '英语启蒙阶段'
  if (vocab < 500) return '小学初级阶段'
  if (vocab < 800) return '小学中级阶段'
  if (vocab < 1200) return '小学高级阶段'
  if (vocab < 1800) return '初中阶段'
  if (vocab < 2500) return '初中高级阶段'
  if (vocab < 3500) return '高中阶段'
  if (vocab < 5000) return '高中高级 / 大学四级水平'
  if (vocab < 7000) return '大学六级水平'
  if (vocab < 10000) return '考研 / 雅思水平'
  return '托福 / GRE 高级水平'
}

const capability = (vocab: number) => {
  if (vocab < 200) return { canDo: '目前大致能认读少量基础单词（如颜色、数字、称呼），尚难独立看懂完整句子或短文。', nextStep: '建议先稳住高频启蒙词，配合听音跟读，再过渡到极短句。' }
  if (vocab < 500) return { canDo: '目前大致能认识常见简单词汇，但独立阅读整句、理解短文仍比较吃力。', nextStep: '建议巩固小学基础词，多做「看词说义 + 听音辨词」，再逐步接触极简句。' }
  if (vocab < 800) return { canDo: '目前对日常基础词较熟，能勉强看懂很短的简单句，但连贯阅读和听懂完整对话仍不稳定。', nextStep: '建议在识词同时加入短句跟读，把「认识单词」推进到「能读懂一句话」。' }
  if (vocab < 1200) return { canDo: '目前能处理多数小学常见词，短句阅读开始成型，但稍长段落或陌生主题仍会卡住。', nextStep: '建议扩大主题词（学校、天气、购物等），并用抗遗忘巩固已学词。' }
  if (vocab < 1800) return { canDo: '目前接近初中起步：能读懂简单叙述句，但对复合句、抽象词和稍长短文仍吃力。', nextStep: '建议加强动词短语与常见搭配，配合短文精读，提升「句子→段落」的理解。' }
  if (vocab < 2500) return { canDo: '目前能较顺利阅读简易短文，日常话题交流词基本够用，但议论文与考试长难句仍需支撑。', nextStep: '建议系统补齐初中核心词，并开始训练段落大意与关键词抓取。' }
  if (vocab < 3500) return { canDo: '目前大致能应对初高中常规阅读中的多数实词，简单说明文可跟读；复杂论证与学术词仍有缺口。', nextStep: '建议按主题扩展（科技、社会、环境），并结合错词抗遗忘。' }
  if (vocab < 5000) return { canDo: '目前接近高中 / 四级起步：一般新闻短文与课堂材料可抓大意，细读精确理解仍需词典辅助。', nextStep: '建议突破同义替换与多义词，积累写作高频词块。' }
  if (vocab < 7000) return { canDo: '目前大致能独立阅读多数一般英语材料，课堂听力与阅读障碍明显减少；专业/学术文本仍有挑战。', nextStep: '建议向六级 / 雅思方向推进：学术词、搭配与长难句精读。' }
  if (vocab < 10000) return { canDo: '目前接近较高阶应试水平：多数议论文与说明文可较顺畅阅读，表达也更精确。', nextStep: '建议聚焦低频词、近义辨析与写作地道表达。' }
  return { canDo: '目前词汇面较广，一般学术与专业阅读障碍较小，可支撑较高阶听说读写任务。', nextStep: '建议按目标场景（学术、职场、考试）做专题精进即可。' }
}

function pyramidLabel(level: VocabLevel) {
  const item = PYRAMID_STAGE[level]
  return `${STAGE_LABEL[item.stage]} · ${RUNG_LABEL[item.rung]}`
}

export function buildVocabTestSummary(result: VocabTestResultPayload) {
  const legacyLv = clampVocabLevel(result.level)
  const approxByLevel = VOCAB_LEVEL_MAP[legacyLv]
  const vocab = result.estimatedVocab || approxByLevel
  const level = vocabToLevel(vocab)
  return { level, approxByLevel, chineseLevel: chineseLevel(vocab), capability: capability(vocab), vocab }
}

export function VocabTestResultView({ result, compact = false }: { result: VocabTestResultPayload; compact?: boolean }) {
  const accuracy = result.totalCount ? Math.round((result.correctCount / result.totalCount) * 100) : 0
  const summary = useMemo(() => buildVocabTestSummary(result), [result])
  const markerTop = useMemo(() => {
    for (const row of PYRAMID_ROWS) {
      const index = row.levels.findIndex((item) => item.level === summary.level)
      if (index >= 0) return row.top + ((index + 0.5) * row.height) / row.levels.length
    }
    return null
  }, [summary.level])

  return (
    <View className="vtrv">
      <View className="vtrv__card">
        <View className="vtrv__head">
          <View className="vtrv__head-info">
            <Text className="vtrv__muted">词汇水平</Text>
            <Text className="vtrv__level">{summary.chineseLevel}</Text>
            <Text className="vtrv__sub">约相当于{pyramidLabel(summary.level)}（{LEVEL_LABEL[summary.level]}）</Text>
          </View>
          <View className="vtrv__icon"><ArrowUp size={24} color="#4ECDC4" /></View>
        </View>
        <View className="vtrv__stats">
          <View className="vtrv__stat"><Text className="vtrv__stat-label">估算词汇量</Text><Text className="vtrv__stat-value">{summary.vocab}</Text></View>
          <View className="vtrv__stat"><Text className="vtrv__stat-label">正确</Text><Text className="vtrv__stat-value">{result.correctCount}/{result.totalCount}</Text></View>
          <View className="vtrv__stat"><Text className="vtrv__stat-label">正确率</Text><Text className="vtrv__stat-value">{accuracy}%</Text></View>
        </View>
      </View>

      <View className="vtrv__card">
        {!compact ? (
          <>
            <Text className="vtrv__section-title">词汇量金字塔</Text>
            <Text className="vtrv__section-desc">阶梯越高表示词汇面越宽。本次测评落点为 {pyramidLabel(summary.level)}。</Text>
            <View className="vtrv__pyramid-outer">
              <View className="vtrv__pyramid">
                {PYRAMID_ROWS.map((row) => (
                  <View key={row.stage} className="vtrv__pyramid-row" style={{ top: `${row.top}%`, height: `${row.height}%` }}>
                    <Text className="vtrv__stage-label" style={{ left: `${Math.max(0, row.left - 13.5)}%`, color: row.stageColor }}>{STAGE_LABEL[row.stage]}</Text>
                    <View className="vtrv__stage-levels" style={{ left: `${row.left}%` }}>
                      {row.levels.map((item) => <View key={item.level} className="vtrv__stage-level" style={{ backgroundColor: item.color }}><Text>{RUNG_LABEL[item.rung]}</Text></View>)}
                    </View>
                  </View>
                ))}
              </View>
              {markerTop !== null ? <View className="vtrv__marker" style={{ top: `${markerTop}%` }}><View className="vtrv__marker-dot" /><Text>您的位置</Text></View> : null}
            </View>
          </>
        ) : null}

        <View className={`vtrv__summary ${compact ? '' : 'vtrv__summary--spaced'}`}>
          <Text className="vtrv__summary-title">本次自测总结</Text>
          <Text className="vtrv__summary-desc">当前大约相当于 {summary.chineseLevel}（估算约 {summary.vocab} 词）。</Text>
          <Text className="vtrv__summary-text">{summary.capability.canDo}</Text>
          <Text className="vtrv__summary-desc">{summary.capability.nextStep}</Text>
          <Text className="vtrv__summary-tip">结果仅作起点参考，可据此安排正课与抗遗忘；选择「不认识」有助于更快贴近真实水平。</Text>
        </View>
      </View>
    </View>
  )
}

export default VocabTestResultView
