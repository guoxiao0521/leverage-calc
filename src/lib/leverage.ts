// 杠杆 ETP 价格换算核心公式，全部为纯函数，便于单测

/** 每日重置型杠杆产品的持有参数 */
export interface DecayParams {
  /** 持有的交易日数 */
  days: number
  /** 日波动率（小数，如 0.042 表示 4.2%） */
  dailyVol: number
  /** 年化费率（小数，如 0.0095 表示 0.95%） */
  feeAnnual: number
}

/** 一年的交易日数，用于把年费率摊到每日 */
export const TRADING_DAYS_PER_YEAR = 252

export const DEFAULT_DECAY: DecayParams = {
  days: 1,
  dailyVol: 0,
  feeAnnual: 0.0095,
}

function isFinitePositive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * 每日重置带来的累计衰减因子。
 *
 *   D(k) = exp( -(k²-k)/2 · σ² · T  -  f · T/252 )
 *
 * 波动项 (k²-k)/2 对 k=2 为 1、对 k=-2 为 3，
 * 这正是反向杠杆产品衰减更快的原因；k=1 时该项为 0（无杠杆则无波动损耗）。
 */
export function decayFactor(k: number, params: DecayParams): number {
  const { days, dailyVol, feeAnnual } = params
  // 单日持有不存在「重置」这回事：当天就是严格的 k 倍线性关系，没有衰减可言。
  // 这也让 UI 的 showDecay（days > 1）和公式口径对齐。
  if (!Number.isFinite(days) || days <= 1)
    return 1

  const vol = Number.isFinite(dailyVol) ? dailyVol : 0
  const fee = Number.isFinite(feeAnnual) ? feeAnnual : 0

  const volDrag = ((k * k - k) / 2) * vol * vol * days
  const feeDrag = (fee * days) / TRADING_DAYS_PER_YEAR
  return Math.exp(-volDrag - feeDrag)
}

/**
 * 正股 → 杠杆股（当日线性估算）。
 * 只反映同一交易日内从基准价涨跌到目标价的对应关系。
 *
 *   L = L0 · (1 + k · (P/P0 - 1))
 */
export function projectLinear(
  price: number,
  basePrice: number,
  baseLeveraged: number,
  k: number,
): number | null {
  if (!isFinitePositive(basePrice) || !Number.isFinite(baseLeveraged) || !Number.isFinite(price))
    return null
  if (!Number.isFinite(k) || k === 0)
    return null

  const r = price / basePrice - 1
  return baseLeveraged * (1 + k * r)
}

/**
 * 正股 → 杠杆股（多日持有，复利 + 波动衰减 + 费率）。
 *
 *   L = L0 · (P/P0)^k · D(k)
 */
export function projectDecay(
  price: number,
  basePrice: number,
  baseLeveraged: number,
  k: number,
  params: DecayParams,
): number | null {
  if (!isFinitePositive(basePrice) || !Number.isFinite(baseLeveraged) || !isFinitePositive(price))
    return null
  if (!Number.isFinite(k) || k === 0)
    return null

  return baseLeveraged * (price / basePrice) ** k * decayFactor(k, params)
}

/**
 * 反推：杠杆股目标价 → 所需正股价（当日线性）。
 *
 *   P = P0 · (1 + (L/L0 - 1)/k)
 */
export function invertLinear(
  leveragedPrice: number,
  basePrice: number,
  baseLeveraged: number,
  k: number,
): number | null {
  if (!isFinitePositive(basePrice) || !isFinitePositive(baseLeveraged))
    return null
  if (!Number.isFinite(leveragedPrice) || !Number.isFinite(k) || k === 0)
    return null

  const rL = leveragedPrice / baseLeveraged - 1
  return basePrice * (1 + rL / k)
}

/**
 * 反推：杠杆股目标价 → 所需正股价（多日持有）。
 *
 *   P = P0 · ( L / (L0 · D(k)) )^(1/k)
 */
export function invertDecay(
  leveragedPrice: number,
  basePrice: number,
  baseLeveraged: number,
  k: number,
  params: DecayParams,
): number | null {
  if (!isFinitePositive(basePrice) || !isFinitePositive(baseLeveraged))
    return null
  if (!isFinitePositive(leveragedPrice) || !Number.isFinite(k) || k === 0)
    return null

  const ratio = leveragedPrice / (baseLeveraged * decayFactor(k, params))
  if (!isFinitePositive(ratio))
    return null

  return basePrice * ratio ** (1 / k)
}

/** 相对基准价的涨跌幅（百分数，如 +9.0 表示 +9.0%） */
export function changePercent(price: number, basePrice: number): number | null {
  if (!isFinitePositive(basePrice) || !Number.isFinite(price))
    return null
  return (price / basePrice - 1) * 100
}

export interface HoldingInput {
  /** 杠杆股持仓成本价 */
  costPrice: number | null
  /** 持仓股数 */
  shares: number | null
}

export interface HoldingPnl {
  /** 盈亏金额 */
  amount: number | null
  /** 盈亏百分比（百分数） */
  percent: number | null
}

/** 按给定的杠杆股价格算持仓盈亏 */
export function holdingPnl(leveragedPrice: number | null, holding: HoldingInput): HoldingPnl {
  const { costPrice, shares } = holding
  if (leveragedPrice === null || !isFinitePositive(costPrice))
    return { amount: null, percent: null }

  const percent = (leveragedPrice / costPrice - 1) * 100
  const amount = Number.isFinite(shares as number) && shares !== null
    ? (leveragedPrice - costPrice) * shares
    : null

  return { amount, percent }
}

/** 该配对是否可以计算（基准价齐全且倍数有效） */
export function isComputable(
  basePrice: number | null,
  baseLeveraged: number | null,
  k: number | null,
): boolean {
  return isFinitePositive(basePrice)
    && isFinitePositive(baseLeveraged)
    && typeof k === 'number'
    && Number.isFinite(k)
    && k !== 0
}
