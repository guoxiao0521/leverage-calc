// 点位表的生成与合并

import type { LevelConfig } from '../types'

export const DEFAULT_LEVEL_CONFIG: LevelConfig = {
  downPercent: 10,
  upPercent: 10,
  stepPercent: 2,
  extra: [],
}

/** 价位归一到 4 位小数，用作去重的键 */
export function levelKey(price: number): number {
  return Math.round(price * 10000) / 10000
}

/**
 * 按「锚点 ±N%、步长 M%」生成价位序列，并合入手动追加的价位。
 *
 * 锚点以**原始精度**保留：Yahoo 返回的价格常带 f32 转换误差（218.05000305…），
 * 如果把它四舍五入成 218.05 再去除以原价，基准行会算出 −1e-8 的假跌幅、显示成「−0.0%」。
 * 去重仍然按 4 位小数比较，所以精度保留不会带来重复行。
 *
 * 返回按价格降序排列（高价在上，与常见看盘习惯一致）。
 */
export function generateLevels(anchor: number, config: LevelConfig): number[] {
  const byKey = new Map<number, number>()

  function put(price: number) {
    if (!Number.isFinite(price) || price <= 0)
      return
    const key = levelKey(price)
    if (!byKey.has(key))
      byKey.set(key, price)
  }

  // 锚点先进，独占它那个键，保住原始精度
  if (Number.isFinite(anchor) && anchor > 0) {
    put(anchor)

    const step = Math.abs(config.stepPercent)
    if (step > 0.0001) {
      const up = Math.max(0, config.upPercent)
      const down = Math.max(0, config.downPercent)
      // 每档都从锚点直接乘出来，不做浮点累加，避免步长漂移
      for (let pct = step; pct <= up + 1e-9; pct += step)
        put(levelKey(anchor * (1 + pct / 100)))
      for (let pct = step; pct <= down + 1e-9; pct += step)
        put(levelKey(anchor * (1 - pct / 100)))
    }
  }

  for (const price of config.extra)
    put(levelKey(price))

  return [...byKey.values()].sort((a, b) => b - a)
}

/** 判断某个价位是否是手动追加的（用于表格打标） */
export function isExtraLevel(price: number, config: LevelConfig): boolean {
  return config.extra.some(p => levelKey(p) === levelKey(price))
}
