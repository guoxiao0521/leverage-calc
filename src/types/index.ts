// 全局共享类型定义

/** 一组正股 ↔ 杠杆股配对 */
export interface Pair {
  id: string
  /** 正股代码，如 NBIS */
  underlying: string
  /** 杠杆股代码，如 NEBX */
  leveraged: string
  /** 目标倍数，带符号；反向产品为负数，如 -2 */
  leverage: number
  /** 备注/产品名，可空 */
  label?: string
  /** 是否来自内置种子表 */
  builtin?: boolean
}

/** 交易时段 */
export type MarketSession = 'pre' | 'regular' | 'post' | 'closed'

export const SESSION_LABEL: Record<MarketSession, string> = {
  pre: '盘前',
  regular: '盘中',
  post: '盘后',
  closed: '休市',
}

/** 单只标的的报价快照，字段与 Rust 侧 SymbolQuote 一一对应 */
export interface SymbolQuote {
  symbol: string
  name: string | null
  /** 常规时段最新价 */
  regularPrice: number | null
  /** 含盘前/盘后的最新价，优先展示这个 */
  latestPrice: number | null
  previousClose: number | null
  currency: string | null
  session: MarketSession
  /** 报价时间，ISO 字符串 */
  asOf: string | null
  /** 单只失败时的错误信息，成功为 null */
  error: string | null
}

/** 一次配对报价拉取的结果 */
export interface PairQuote {
  underlying: SymbolQuote
  leveraged: SymbolQuote
  fetchedAt: string
}

/** 日线序列 */
export interface DailySeries {
  symbol: string
  /** ISO 日期字符串 */
  dates: string[]
  closes: number[]
  error: string | null
}

/** 配对管理里校验代码用的返回 */
export interface SymbolInfo {
  symbol: string
  name: string | null
  currency: string | null
  exchange: string | null
  price: number | null
}

/** 点位表生成配置 */
export interface LevelConfig {
  /** 向下覆盖的幅度（百分数，如 10 表示 -10%） */
  downPercent: number
  /** 向上覆盖的幅度（百分数） */
  upPercent: number
  /** 步长（百分数） */
  stepPercent: number
  /** 手动追加的价位 */
  extra: number[]
}

/** 持仓输入 */
export interface Holding {
  costPrice: number | null
  shares: number | null
}

/** 主表一行 */
export interface LevelRow {
  /** 正股价位 */
  price: number
  /** 正股涨跌幅（百分数） */
  changePercent: number | null
  /** 杠杆股涨跌幅（百分数） */
  leveragedChangePercent: number | null
  /** 当日线性估算价 */
  linearPrice: number | null
  /** 多日持有估算价，days<=1 时为 null */
  decayPrice: number | null
  /** 持仓盈亏金额（按当日线性估算价算） */
  pnlAmount: number | null
  /** 持仓盈亏百分比 */
  pnlPercent: number | null
  /** 是否为当前价所在行 */
  isCurrent: boolean
  /** 是否为手动追加的价位 */
  isExtra: boolean
  /** 是否为持仓回本价所在行 */
  isBreakEven: boolean
  /** 线性外推后理论清零（估算价 <= 0） */
  wipedOut: boolean
}
