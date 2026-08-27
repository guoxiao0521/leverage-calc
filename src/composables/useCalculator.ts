// 把「配对 + 行情 + 参数 + 持仓」编排成主表所需的数据。
// 组件只负责展示和收集输入，计算全部在这里和 lib/ 里完成。

import { computed, ref, watch } from 'vue'
import type { LeverageFit } from '@/lib/stats'
import { alignByDate, estimateDailyVol, fitLeverage } from '@/lib/stats'
import {
  changePercent,
  holdingPnl,
  invertDecay,
  invertLinear,
  isComputable,
  projectDecay,
  projectLinear,
} from '@/lib/leverage'
import { generateLevels, isExtraLevel, levelKey } from '@/lib/levels'
import type { LevelRow, PairQuote } from '@/types'
import { usePairs } from './usePairs'
import { useQuotes } from './useQuotes'
import { useSettings } from './useSettings'

export function useCalculator() {
  const { activePair, activePairId } = usePairs()
  const { decay, levelConfig, holding } = useSettings(() => activePairId.value)
  const quotes = useQuotes()

  const pairQuote = ref<PairQuote | null>(null)
  const fit = ref<LeverageFit | null>(null)
  const errorMessage = ref<string | null>(null)
  const volHint = ref<number | null>(null)

  /** 手动覆盖的基准价，只存在内存里；切换配对或点「恢复实时」即清空 */
  const overrideBase = ref<number | null>(null)
  const overrideLeveraged = ref<number | null>(null)

  const underlyingQuote = computed(() => pairQuote.value?.underlying ?? null)
  const leveragedQuote = computed(() => pairQuote.value?.leveraged ?? null)

  const livePrice = computed(() => underlyingQuote.value?.latestPrice ?? null)
  const liveLeveraged = computed(() => leveragedQuote.value?.latestPrice ?? null)

  const basePrice = computed(() => overrideBase.value ?? livePrice.value)
  const baseLeveraged = computed(() => overrideLeveraged.value ?? liveLeveraged.value)
  const leverage = computed(() => activePair.value?.leverage ?? null)

  const computable = computed(() =>
    isComputable(basePrice.value, baseLeveraged.value, leverage.value))

  /** days > 1 才有多日衰减一列 */
  const showDecay = computed(() => decay.value.days > 1)
  const showPnl = computed(() =>
    holding.value.costPrice !== null && holding.value.costPrice > 0)

  /** 持仓回本对应的正股价（按当日线性口径） */
  const breakEvenPrice = computed<number | null>(() => {
    if (!computable.value || !showPnl.value)
      return null
    return invertLinear(
      holding.value.costPrice as number,
      basePrice.value as number,
      baseLeveraged.value as number,
      leverage.value as number,
    )
  })

  /** 主表行 */
  const rows = computed<LevelRow[]>(() => {
    if (!computable.value)
      return []

    const p0 = basePrice.value as number
    const l0 = baseLeveraged.value as number
    const k = leverage.value as number

    const prices = generateLevels(p0, levelConfig.value)

    // 回本价单独插进来，方便一眼看到那条线在哪
    const be = breakEvenPrice.value
    const beNorm = be !== null && Number.isFinite(be) && be > 0 ? levelKey(be) : null
    if (beNorm !== null && !prices.includes(beNorm)) {
      prices.push(beNorm)
      prices.sort((a, b) => b - a)
    }

    return prices.map((price) => {
      const linear = projectLinear(price, p0, l0, k)
      const wipedOut = linear !== null && linear <= 0
      const pnl = holdingPnl(wipedOut ? 0 : linear, holding.value)
      const change = changePercent(price, p0)

      return {
        price,
        changePercent: change,
        leveragedChangePercent: change === null ? null : change * k,
        linearPrice: linear,
        decayPrice: showDecay.value ? projectDecay(price, p0, l0, k, decay.value) : null,
        pnlAmount: pnl.amount,
        pnlPercent: pnl.percent,
        isCurrent: levelKey(price) === levelKey(p0),
        isExtra: isExtraLevel(price, levelConfig.value),
        isBreakEven: beNorm !== null && levelKey(price) === beNorm,
        wipedOut,
      }
    })
  })

  // -------------------------------------------------------------------------
  // 反推
  // -------------------------------------------------------------------------

  const reverseTarget = ref<number | null>(null)

  const reverseLinear = computed(() => {
    if (!computable.value || reverseTarget.value === null)
      return null
    return invertLinear(
      reverseTarget.value,
      basePrice.value as number,
      baseLeveraged.value as number,
      leverage.value as number,
    )
  })

  const reverseDecay = computed(() => {
    if (!computable.value || reverseTarget.value === null || !showDecay.value)
      return null
    return invertDecay(
      reverseTarget.value,
      basePrice.value as number,
      baseLeveraged.value as number,
      leverage.value as number,
      decay.value,
    )
  })

  /** 按当前基准价算的持仓盈亏 */
  const currentPnl = computed(() => holdingPnl(baseLeveraged.value, holding.value))

  // -------------------------------------------------------------------------
  // 拉数
  // -------------------------------------------------------------------------

  async function refreshQuote(force = false) {
    const pair = activePair.value
    if (!pair)
      return

    errorMessage.value = null
    try {
      pairQuote.value = await quotes.fetchPairQuote(pair.underlying, pair.leveraged, force)
      const errs = [pairQuote.value.underlying.error, pairQuote.value.leveraged.error]
        .filter((e): e is string => !!e)
      errorMessage.value = errs.length > 0 ? errs.join('；') : null
    }
    catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
    }
  }

  /** 拉历史，算日波动率和实测倍数 */
  async function refreshHistory(force = false) {
    const pair = activePair.value
    if (!pair)
      return

    try {
      const series = await quotes.fetchSeries([pair.underlying, pair.leveraged], '6mo', force)
      const [u, l] = series
      if (!u || u.error || u.closes.length < 10) {
        volHint.value = null
        fit.value = null
        return
      }

      volHint.value = estimateDailyVol(u.closes, 60)

      if (!l || l.error || l.closes.length < 10) {
        fit.value = null
        return
      }
      const aligned = alignByDate(u.dates, u.closes, l.dates, l.closes)
      // 只用最近 60 个交易日，太久远的样本对当前跟踪表现没有参考价值
      const n = 61
      fit.value = fitLeverage(
        aligned.closesA.slice(-n),
        aligned.closesB.slice(-n),
      )
    }
    catch {
      volHint.value = null
      fit.value = null
    }
  }

  async function refreshAll(force = false) {
    await Promise.all([refreshQuote(force), refreshHistory(force)])
  }

  /** 把估算出的日波动率填进参数 */
  function applyVolHint() {
    if (volHint.value !== null)
      decay.value = { ...decay.value, dailyVol: volHint.value }
  }

  // 切换配对时清掉上一组的覆盖值和历史统计，避免串数据
  watch(activePairId, () => {
    overrideBase.value = null
    overrideLeveraged.value = null
    pairQuote.value = null
    fit.value = null
    volHint.value = null
    reverseTarget.value = null
    errorMessage.value = null
    void refreshAll()
  })

  return {
    activePair,
    underlyingQuote,
    leveragedQuote,
    livePrice,
    liveLeveraged,
    basePrice,
    baseLeveraged,
    leverage,
    overrideBase,
    overrideLeveraged,
    computable,
    showDecay,
    showPnl,
    rows,
    breakEvenPrice,
    reverseTarget,
    reverseLinear,
    reverseDecay,
    currentPnl,
    holding,
    decay,
    levelConfig,
    fit,
    volHint,
    errorMessage,
    loading: quotes.loadingQuote,
    loadingHistory: quotes.loadingSeries,
    refreshAll,
    refreshQuote,
    refreshHistory,
    applyVolHint,
  }
}
