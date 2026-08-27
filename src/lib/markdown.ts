// 把主表导出成 Markdown 表格，方便直接贴进聊天/笔记

import type { DecayParams } from './leverage'
import type { LevelRow, Pair, SymbolQuote } from '../types'
import { DASH, formatPrice } from './format'

function pct(value: number | null): string {
  if (value === null || !Number.isFinite(value))
    return DASH
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(1)}%`
}

function price(value: number | null, wipedOut: boolean): string {
  if (wipedOut)
    return '≈0'
  if (value === null || !Number.isFinite(value))
    return DASH
  return `≈${value.toFixed(2)}`
}

function money(value: number | null): string {
  if (value === null || !Number.isFinite(value))
    return DASH
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}$${Math.abs(value).toFixed(2)}`
}

export interface MarkdownContext {
  pair: Pair
  basePrice: number
  baseLeveraged: number
  decay: DecayParams
  rows: LevelRow[]
  underlyingQuote?: SymbolQuote | null
  sessionLabel?: string
  showDecay: boolean
  showPnl: boolean
  costPrice?: number | null
  shares?: number | null
}

/** 生成完整的 Markdown 片段：一句话基准说明 + 表格 + 免责提醒 */
export function buildMarkdown(ctx: MarkdownContext): string {
  const { pair, basePrice, baseLeveraged, decay, rows, showDecay, showPnl } = ctx
  const k = pair.leverage
  const kText = `${k > 0 ? '' : '反向 '}${Math.abs(k)}倍杠杆`
  const sessionPrefix = ctx.sessionLabel ? `${ctx.sessionLabel} ` : ''

  const lines: string[] = []
  lines.push(
    `${pair.underlying} 常见点位按 ${kText}线性估算`
    + `（基准：${sessionPrefix}${pair.underlying} ${formatPrice(basePrice)} / ${pair.leveraged} ${formatPrice(baseLeveraged)}）：`,
  )
  lines.push('')

  const headers = ['NBIS 价格'.replace('NBIS', pair.underlying), '涨跌幅', `${pair.leveraged} 涨跌幅(${k}x)`, `${pair.leveraged} 估算价`]
  if (showDecay)
    headers.push(`${pair.leveraged} 估算价(${decay.days}日后)`)
  if (showPnl)
    headers.push('盈亏', '盈亏%')

  lines.push(`| ${headers.join(' | ')} |`)
  lines.push(`|${headers.map(() => '---').join('|')}|`)

  for (const row of rows) {
    const cells = [
      formatPrice(row.price),
      pct(row.changePercent),
      pct(row.leveragedChangePercent),
      price(row.linearPrice, row.wipedOut),
    ]
    if (showDecay)
      cells.push(price(row.decayPrice, false))
    if (showPnl)
      cells.push(money(row.pnlAmount), pct(row.pnlPercent))
    lines.push(`| ${cells.join(' | ')} |`)
  }

  lines.push('')
  lines.push('⚠️ 提醒：')
  lines.push('- 这是简化的线性估算，只反映「同一天内」从基准价涨跌到目标价时的大致对应关系。')
  lines.push('- 实际杠杆 ETP 按**每日重置**，跨多个交易日的结果是路径依赖的，不能直接用线性关系推。')
  lines.push('- 「多日一定比线性低」只在**震荡行情**下成立（波动损耗占主导）；遇到**大幅单边行情**，复利凸性反而会让实际值**高于**线性估算。')
  if (showDecay)
    lines.push(`- 「${decay.days}日后」一列按日波动率 ${(decay.dailyVol * 100).toFixed(2)}%、年费率 ${(decay.feeAnnual * 100).toFixed(2)}% 估算，假设波动率恒定、忽略跟踪误差与折溢价，属粗略模型。`)
  lines.push('- 仅供参考，不构成投资建议。')

  return lines.join('\n')
}
