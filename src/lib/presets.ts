// 内置配对种子表
//
// ⚠️ 这是「起点」而不是「权威」：单股杠杆 ETP 上新/清盘频繁，代码和倍数都可能变。
// 首次启动时写入本地 store，之后完全以用户数据为准，不再覆盖。
// 每条都可以在「配对管理」里改代码、改倍数、删除，并用「验证」按钮
// 拉真实名称 + 近 60 日实测倍数来核对。

import type { Pair } from '../types'

interface PresetSeed {
  underlying: string
  leveraged: string
  leverage: number
  label?: string
}

const SEEDS: PresetSeed[] = [
  // —— 单股杠杆 ETP ——
  { underlying: 'NBIS', leveraged: 'NEBX', leverage: 2, label: 'Nebius 2x' },
  { underlying: 'NVDA', leveraged: 'NVDL', leverage: 2, label: 'NVIDIA 2x' },
  { underlying: 'NVDA', leveraged: 'NVD', leverage: -2, label: 'NVIDIA -2x' },
  { underlying: 'TSLA', leveraged: 'TSLL', leverage: 2, label: 'Tesla 2x' },
  { underlying: 'TSLA', leveraged: 'TSLQ', leverage: -2, label: 'Tesla -2x' },
  { underlying: 'MSTR', leveraged: 'MSTU', leverage: 2, label: 'MicroStrategy 2x' },
  { underlying: 'MSTR', leveraged: 'MSTZ', leverage: -2, label: 'MicroStrategy -2x' },
  { underlying: 'COIN', leveraged: 'CONL', leverage: 2, label: 'Coinbase 2x' },
  { underlying: 'PLTR', leveraged: 'PTIR', leverage: 2, label: 'Palantir 2x' },
  { underlying: 'AMD', leveraged: 'AMDL', leverage: 2, label: 'AMD 2x' },
  { underlying: 'AAPL', leveraged: 'AAPU', leverage: 2, label: 'Apple 2x' },
  { underlying: 'AAPL', leveraged: 'AAPD', leverage: -1, label: 'Apple -1x' },
  { underlying: 'MSFT', leveraged: 'MSFU', leverage: 2, label: 'Microsoft 2x' },
  { underlying: 'AMZN', leveraged: 'AMZU', leverage: 2, label: 'Amazon 2x' },
  { underlying: 'GOOGL', leveraged: 'GGLL', leverage: 2, label: 'Alphabet 2x' },
  { underlying: 'META', leveraged: 'METU', leverage: 2, label: 'Meta 2x' },
  { underlying: 'AVGO', leveraged: 'AVL', leverage: 2, label: 'Broadcom 2x' },
  { underlying: 'SMCI', leveraged: 'SMCL', leverage: 2, label: 'Supermicro 2x' },

  // —— 指数/行业杠杆 ETF ——
  { underlying: 'QQQ', leveraged: 'TQQQ', leverage: 3, label: '纳指100 3x' },
  { underlying: 'QQQ', leveraged: 'SQQQ', leverage: -3, label: '纳指100 -3x' },
  { underlying: 'SPY', leveraged: 'SPXL', leverage: 3, label: '标普500 3x' },
  { underlying: 'SPY', leveraged: 'SPXS', leverage: -3, label: '标普500 -3x' },
  { underlying: 'SOXX', leveraged: 'SOXL', leverage: 3, label: '半导体 3x' },
  { underlying: 'SOXX', leveraged: 'SOXS', leverage: -3, label: '半导体 -3x' },
  { underlying: 'IWM', leveraged: 'TNA', leverage: 3, label: '罗素2000 3x' },
  { underlying: 'IWM', leveraged: 'TZA', leverage: -3, label: '罗素2000 -3x' },
]

/** 由代码组合生成稳定 id，方便升级时按 id 去重 */
export function pairId(underlying: string, leveraged: string): string {
  return `${underlying.trim().toUpperCase()}:${leveraged.trim().toUpperCase()}`
}

export function buildPresetPairs(): Pair[] {
  return SEEDS.map(seed => ({
    id: pairId(seed.underlying, seed.leveraged),
    underlying: seed.underlying,
    leveraged: seed.leveraged,
    leverage: seed.leverage,
    label: seed.label,
    builtin: true,
  }))
}
