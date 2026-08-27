// 历史序列统计：日收益率、波动率、以及正股↔杠杆股的实测倍数回归

/** 由收盘价序列算对数日收益率 */
export function logReturns(closes: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]
    const curr = closes[i]
    if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev <= 0 || curr <= 0)
      continue
    out.push(Math.log(curr / prev))
  }
  return out
}

/** 由收盘价序列算简单日收益率（回归用，杠杆产品跟踪的是简单收益） */
export function simpleReturns(closes: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]
    const curr = closes[i]
    if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev <= 0 || curr <= 0)
      continue
    out.push(curr / prev - 1)
  }
  return out
}

/** 样本标准差（n-1 分母） */
export function stdev(values: number[]): number | null {
  if (values.length < 2)
    return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/**
 * 由收盘价序列估算日波动率。
 * @param closes 收盘价序列（按时间正序）
 * @param window 取最近多少个交易日，默认 60
 */
export function estimateDailyVol(closes: number[], window = 60): number | null {
  const slice = closes.slice(-(window + 1))
  const rets = logReturns(slice)
  if (rets.length < 5)
    return null
  return stdev(rets)
}

export interface LeverageFit {
  /** 实测倍数（过原点 OLS 斜率） */
  beta: number
  /** 拟合优度 */
  r2: number
  /** 参与回归的样本天数 */
  samples: number
}

/**
 * 用两条序列的日收益率做过原点最小二乘，估出杠杆股相对正股的实测倍数。
 *
 *   β = Σ(x·y) / Σ(x²)
 *
 * 过原点是因为杠杆产品的设计目标就是 y = k·x，截距应为 0（费率造成的微小漂移忽略）。
 */
export function fitLeverage(underlyingCloses: number[], leveragedCloses: number[]): LeverageFit | null {
  const n = Math.min(underlyingCloses.length, leveragedCloses.length)
  if (n < 6)
    return null

  // 对齐到相同长度后再算收益率，避免长度不一致导致的错位
  const x = simpleReturns(underlyingCloses.slice(-n))
  const y = simpleReturns(leveragedCloses.slice(-n))
  const m = Math.min(x.length, y.length)
  if (m < 5)
    return null

  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < m; i++) {
    sxy += x[i] * y[i]
    sxx += x[i] * x[i]
    syy += y[i] * y[i]
  }
  if (sxx <= 0 || syy <= 0)
    return null

  const beta = sxy / sxx
  // 过原点回归的 R²：1 - SSE/SST，其中 SST 也不减均值
  let sse = 0
  for (let i = 0; i < m; i++)
    sse += (y[i] - beta * x[i]) ** 2
  const r2 = 1 - sse / syy

  return { beta, r2, samples: m }
}

/** 按日期对齐两条序列，只保留两边都有的交易日 */
export function alignByDate(
  datesA: string[],
  closesA: number[],
  datesB: string[],
  closesB: number[],
): { closesA: number[], closesB: number[], dates: string[] } {
  const mapB = new Map<string, number>()
  for (let i = 0; i < Math.min(datesB.length, closesB.length); i++)
    mapB.set(datesB[i], closesB[i])

  const dates: string[] = []
  const a: number[] = []
  const b: number[] = []
  for (let i = 0; i < Math.min(datesA.length, closesA.length); i++) {
    const other = mapB.get(datesA[i])
    if (other === undefined)
      continue
    dates.push(datesA[i])
    a.push(closesA[i])
    b.push(other)
  }
  return { closesA: a, closesB: b, dates }
}
