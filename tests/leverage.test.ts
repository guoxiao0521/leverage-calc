import { describe, expect, it } from 'vitest'
import {
  changePercent,
  decayFactor,
  holdingPnl,
  invertDecay,
  invertLinear,
  isComputable,
  projectDecay,
  projectLinear,
} from '../src/lib/leverage'
import { generateLevels } from '../src/lib/levels'
import { alignByDate, estimateDailyVol, fitLeverage, stdev } from '../src/lib/stats'

// 用户手算过的一组真实基准：NBIS 229.380 / NEBX 27.479，2x
const P0 = 229.38
const L0 = 27.479
const K = 2

describe('projectLinear —— 对齐手算表格', () => {
  const cases: [number, number][] = [
    [250, 32.42],
    [240, 30.02],
    [230, 27.63],
    [225, 26.43],
    [220, 25.23],
    [215, 24.03],
    [210, 22.83],
    [208, 22.35],
    [205, 21.64],
    [200, 20.44],
    [195, 19.24],
    [190, 18.04],
    [180, 15.65],
  ]

  // 容差取 0.01：原表里 210/208 两档是截断而不是四舍五入（22.8357 记成 22.83）
  it.each(cases)('正股 %d → 杠杆股 ≈ %f', (price, expected) => {
    expect(projectLinear(price, P0, L0, K)).toBeCloseTo(expected, 1)
    expect(Math.abs((projectLinear(price, P0, L0, K) as number) - expected)).toBeLessThan(0.01)
  })

  it('基准价本身原样返回', () => {
    expect(projectLinear(P0, P0, L0, K)).toBeCloseTo(L0, 10)
  })

  it('涨跌幅按倍数放大', () => {
    const r = changePercent(250, P0)
    expect(r).toBeCloseTo(8.98945, 4)
    const rL = changePercent(projectLinear(250, P0, L0, K) as number, L0)
    expect(rL).toBeCloseTo((r as number) * K, 8)
  })

  it('跌破 1/k 后线性外推为负（调用方需按理论清零展示）', () => {
    // 2x 下跌 50% 即归零，再跌就是负数
    expect(projectLinear(P0 * 0.4, P0, L0, K)).toBeLessThan(0)
  })
})

describe('decayFactor', () => {
  it('持有 1 日不计衰减（当天就是严格 k 倍，没有重置）', () => {
    expect(decayFactor(2, { days: 1, dailyVol: 0.05, feeAnnual: 0.0095 })).toBe(1)
    expect(decayFactor(-3, { days: 0, dailyVol: 0.05, feeAnnual: 0.0095 })).toBe(1)
  })

  it('σ=0 且无费率时因子为 1', () => {
    expect(decayFactor(2, { days: 20, dailyVol: 0, feeAnnual: 0 })).toBeCloseTo(1, 12)
  })

  it('1x 无波动损耗（(k²−k)/2 = 0）', () => {
    expect(decayFactor(1, { days: 20, dailyVol: 0.06, feeAnnual: 0 })).toBeCloseTo(1, 12)
  })

  it('反向 2x 比正向 2x 衰减更快', () => {
    const params = { days: 10, dailyVol: 0.05, feeAnnual: 0 }
    const long2x = decayFactor(2, params)
    const short2x = decayFactor(-2, params)
    expect(short2x).toBeLessThan(long2x)
    // (k²−k)/2：2x 为 1、-2x 为 3，衰减指数应正好是 3 倍
    expect(Math.log(short2x) / Math.log(long2x)).toBeCloseTo(3, 6)
  })

  it('天数越多衰减越大', () => {
    const base = { dailyVol: 0.04, feeAnnual: 0.0095 }
    expect(decayFactor(2, { ...base, days: 20 }))
      .toBeLessThan(decayFactor(2, { ...base, days: 5 }))
  })

  it('费率单独生效', () => {
    const factor = decayFactor(2, { days: 252, dailyVol: 0, feeAnnual: 0.01 })
    expect(factor).toBeCloseTo(Math.exp(-0.01), 10)
  })
})

describe('projectDecay', () => {
  it('σ=0、无费率时退化为纯复利', () => {
    const params = { days: 5, dailyVol: 0, feeAnnual: 0 }
    const price = 250
    expect(projectDecay(price, P0, L0, K, params))
      .toBeCloseTo(L0 * (price / P0) ** K, 10)
  })

  // 「多日一定比线性低」是流传很广但不准确的说法。真实关系分两种情形：
  //   净变动小（震荡） → 波动损耗占主导，多日 < 当日线性，这才是通常说的 decay
  //   净变动大（单边）  → 复利凸性占主导，多日 > 当日线性
  // 分界点满足 (1+r)^k · D(k) = 1 + k·r。
  it('震荡区间内多日估值低于当日线性（波动损耗占主导）', () => {
    const params = { days: 10, dailyVol: 0.05, feeAnnual: 0.0095 }
    // 只跌 1%，远小于 10 日累计波动
    const price = P0 * 0.99
    expect(projectDecay(price, P0, L0, K, params) as number)
      .toBeLessThan(projectLinear(price, P0, L0, K) as number)
  })

  it('大幅单边下跌时多日估值反而高于当日线性（复利凸性占主导）', () => {
    const params = { days: 10, dailyVol: 0.05, feeAnnual: 0.0095 }
    // 跌 17%，2x 线性只剩 18.04，但复利口径永远打不到 0
    expect(projectDecay(190, P0, L0, K, params) as number)
      .toBeGreaterThan(projectLinear(190, P0, L0, K) as number)
  })

  it('波动率足够大时，即使单边大跌也会被磨到低于线性', () => {
    const price = 190
    const mild = { days: 10, dailyVol: 0.05, feeAnnual: 0.0095 }
    const wild = { days: 60, dailyVol: 0.09, feeAnnual: 0.0095 }
    expect(projectDecay(price, P0, L0, K, wild) as number)
      .toBeLessThan(projectDecay(price, P0, L0, K, mild) as number)
    expect(projectDecay(price, P0, L0, K, wild) as number)
      .toBeLessThan(projectLinear(price, P0, L0, K) as number)
  })

  it('永远不会算出负价（几何式不可能穿零）', () => {
    const params = { days: 10, dailyVol: 0.05, feeAnnual: 0.0095 }
    expect(projectDecay(P0 * 0.2, P0, L0, K, params)).toBeGreaterThan(0)
  })
})

describe('反推与正算互为逆运算', () => {
  const params = { days: 5, dailyVol: 0.045, feeAnnual: 0.0095 }

  it.each([250, 229.38, 208, 180])('线性往返：%d', (price) => {
    const l = projectLinear(price, P0, L0, K) as number
    expect(invertLinear(l, P0, L0, K)).toBeCloseTo(price, 8)
  })

  it.each([250, 229.38, 208, 180])('衰减往返：%d', (price) => {
    const l = projectDecay(price, P0, L0, K, params) as number
    expect(invertDecay(l, P0, L0, K, params)).toBeCloseTo(price, 8)
  })

  it.each([-1, -2, -3, 1.5, 3])('反向/非整数倍数也能往返：k=%d', (k) => {
    const price = 205
    const linear = projectLinear(price, P0, L0, k) as number
    expect(invertLinear(linear, P0, L0, k)).toBeCloseTo(price, 8)

    const decayed = projectDecay(price, P0, L0, k, params) as number
    expect(invertDecay(decayed, P0, L0, k, params)).toBeCloseTo(price, 8)
  })

  it('多日口径要求的正股价高于当日口径（衰减先吃掉一部分涨幅）', () => {
    const target = 32
    const day = invertLinear(target, P0, L0, K) as number
    const multi = invertDecay(target, P0, L0, K, params) as number
    expect(multi).toBeGreaterThan(day)
  })
})

describe('边界与无效输入', () => {
  it('k=0 一律返回 null', () => {
    expect(projectLinear(250, P0, L0, 0)).toBeNull()
    expect(invertLinear(30, P0, L0, 0)).toBeNull()
    expect(isComputable(P0, L0, 0)).toBe(false)
  })

  it('基准价缺失或非正返回 null', () => {
    expect(projectLinear(250, 0, L0, K)).toBeNull()
    expect(projectLinear(250, Number.NaN, L0, K)).toBeNull()
    expect(isComputable(null, L0, K)).toBe(false)
    expect(isComputable(P0, null, K)).toBe(false)
  })

  it('齐全时可计算', () => {
    expect(isComputable(P0, L0, K)).toBe(true)
    expect(isComputable(P0, L0, -2)).toBe(true)
  })
})

describe('holdingPnl', () => {
  it('成本 24.50、100 股，价格 27.479', () => {
    const { amount, percent } = holdingPnl(27.479, { costPrice: 24.5, shares: 100 })
    expect(amount).toBeCloseTo((27.479 - 24.5) * 100, 8)
    expect(percent).toBeCloseTo((27.479 / 24.5 - 1) * 100, 8)
  })

  it('只填成本价时只算百分比', () => {
    const { amount, percent } = holdingPnl(27.479, { costPrice: 24.5, shares: null })
    expect(amount).toBeNull()
    expect(percent).not.toBeNull()
  })

  it('没有成本价则两个都为 null', () => {
    expect(holdingPnl(27.479, { costPrice: null, shares: 100 })).toEqual({ amount: null, percent: null })
  })

  it('回本价代入线性公式后正好等于成本价', () => {
    const cost = 24.5
    const breakEven = invertLinear(cost, P0, L0, K) as number
    expect(projectLinear(breakEven, P0, L0, K)).toBeCloseTo(cost, 8)
    expect(holdingPnl(cost, { costPrice: cost, shares: 100 }).amount).toBeCloseTo(0, 8)
  })
})

describe('generateLevels', () => {
  const config = { downPercent: 10, upPercent: 10, stepPercent: 2, extra: [] }

  it('一定包含锚点自身', () => {
    expect(generateLevels(200, config)).toContain(200)
  })

  it('按降序排列', () => {
    const levels = generateLevels(200, config)
    expect([...levels].sort((a, b) => b - a)).toEqual(levels)
  })

  it('上下各 5 档 + 锚点 = 11 档', () => {
    expect(generateLevels(200, config)).toHaveLength(11)
  })

  it('边界档位精确（浮点累加不漂移）', () => {
    const levels = generateLevels(200, config)
    expect(levels[0]).toBeCloseTo(220, 6)
    expect(levels[levels.length - 1]).toBeCloseTo(180, 6)
  })

  it('手动价位会合并进来且不重复', () => {
    const levels = generateLevels(200, { ...config, extra: [208, 200, 175] })
    expect(levels).toContain(208)
    expect(levels).toContain(175)
    expect(levels.filter(p => p === 200)).toHaveLength(1)
  })

  it('步长为 0 时只剩锚点和手动价位', () => {
    expect(generateLevels(200, { ...config, stepPercent: 0, extra: [180] })).toEqual([200, 180])
  })

  it('锚点保留原始精度，基准行不会算出 -1e-8 的假跌幅', () => {
    // Yahoo 返回的是 f32 精度，218.05 实际是 218.05000305175781
    const noisy = 218.05000305175781
    const levels = generateLevels(noisy, config)
    expect(levels).toContain(noisy)
    // 基准行的涨跌幅必须是精确的 0，否则界面会显示「−0.0%」
    expect(changePercent(noisy, noisy)).toBe(0)
    // 且不会因为精度保留而多出一行重复价位
    expect(levels).toHaveLength(11)
    expect(levels.filter(p => Math.abs(p - noisy) < 0.005)).toHaveLength(1)
  })

  it('锚点无效时只返回手动价位', () => {
    expect(generateLevels(Number.NaN, { ...config, extra: [180] })).toEqual([180])
  })
})

describe('stats', () => {
  it('stdev 对已知序列正确', () => {
    // 样本标准差（n-1 分母）
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 4)
    expect(stdev([1])).toBeNull()
  })

  it('恒定涨幅序列的波动率为 0', () => {
    const closes = Array.from({ length: 61 }, (_, i) => 100 * 1.01 ** i)
    expect(estimateDailyVol(closes)).toBeCloseTo(0, 12)
  })

  it('波动率随振幅增大', () => {
    const mild = Array.from({ length: 61 }, (_, i) => 100 * (1 + (i % 2 ? 0.01 : -0.01)))
    const wild = Array.from({ length: 61 }, (_, i) => 100 * (1 + (i % 2 ? 0.06 : -0.06)))
    expect(estimateDailyVol(wild) as number).toBeGreaterThan(estimateDailyVol(mild) as number)
  })

  it('样本太少返回 null', () => {
    expect(estimateDailyVol([100, 101])).toBeNull()
  })

  it('fitLeverage 能还原严格的 2 倍关系', () => {
    // 构造一条随机游走的正股，再造一条每日收益严格 2 倍的杠杆股
    let u = 100
    let l = 10
    const uc = [u]
    const lc = [l]
    const rets = [0.03, -0.02, 0.015, -0.04, 0.025, 0.01, -0.018, 0.032, -0.011, 0.007,
      0.02, -0.03, 0.012, -0.005, 0.018, 0.009, -0.022, 0.028, -0.014, 0.006]
    for (const r of rets) {
      u *= 1 + r
      l *= 1 + 2 * r
      uc.push(u)
      lc.push(l)
    }

    const fit = fitLeverage(uc, lc)
    expect(fit).not.toBeNull()
    expect(fit!.beta).toBeCloseTo(2, 8)
    expect(fit!.r2).toBeCloseTo(1, 8)
    expect(fit!.samples).toBe(rets.length)
  })

  it('fitLeverage 能还原 -2 倍关系', () => {
    let u = 100
    let l = 10
    const uc = [u]
    const lc = [l]
    for (const r of [0.02, -0.01, 0.03, -0.025, 0.015, 0.008, -0.012, 0.02, -0.03, 0.01]) {
      u *= 1 + r
      l *= 1 - 2 * r
      uc.push(u)
      lc.push(l)
    }
    expect(fitLeverage(uc, lc)!.beta).toBeCloseTo(-2, 8)
  })

  it('样本太少返回 null', () => {
    expect(fitLeverage([100, 101, 102], [10, 10.2, 10.4])).toBeNull()
  })

  it('alignByDate 只保留共同交易日', () => {
    const result = alignByDate(
      ['2026-01-02', '2026-01-05', '2026-01-06'],
      [100, 102, 104],
      ['2026-01-05', '2026-01-06', '2026-01-07'],
      [10, 11, 12],
    )
    expect(result.dates).toEqual(['2026-01-05', '2026-01-06'])
    expect(result.closesA).toEqual([102, 104])
    expect(result.closesB).toEqual([10, 11])
  })
})
