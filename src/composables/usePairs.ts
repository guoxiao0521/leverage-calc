// 配对列表的增删改查 + 持久化。
// 模块级 ref 单例，保证多个组件读到同一份数据。

import { computed, ref, watch } from 'vue'
import type { Pair } from '@/types'
import { buildPresetPairs, pairId } from '@/lib/presets'
import { readSetting, writeSetting } from './useStore'

const KEY_PAIRS = 'pairs'
const KEY_ACTIVE = 'activePairId'
const KEY_SEEDED = 'seeded'

const pairs = ref<Pair[]>([])
const activePairId = ref<string | null>(null)
const ready = ref(false)

let initPromise: Promise<void> | null = null

async function init(): Promise<void> {
  const seeded = await readSetting<boolean>(KEY_SEEDED, false)
  const stored = await readSetting<Pair[]>(KEY_PAIRS, [])

  if (!seeded && stored.length === 0) {
    // 首次启动：播种内置表。之后完全以用户数据为准，升级也不再覆盖。
    pairs.value = buildPresetPairs()
    await writeSetting(KEY_PAIRS, pairs.value)
    await writeSetting(KEY_SEEDED, true)
  }
  else {
    pairs.value = stored
  }

  const savedActive = await readSetting<string | null>(KEY_ACTIVE, null)
  activePairId.value = pairs.value.some(p => p.id === savedActive)
    ? savedActive
    : (pairs.value[0]?.id ?? null)

  ready.value = true

  watch(pairs, value => void writeSetting(KEY_PAIRS, value), { deep: true })
  watch(activePairId, value => void writeSetting(KEY_ACTIVE, value))
}

export function usePairs() {
  if (!initPromise)
    initPromise = init()

  const activePair = computed<Pair | null>(
    () => pairs.value.find(p => p.id === activePairId.value) ?? null,
  )

  /** 按正股分组，供下拉框展示 */
  const grouped = computed(() => {
    const map = new Map<string, Pair[]>()
    for (const pair of pairs.value) {
      const list = map.get(pair.underlying) ?? []
      list.push(pair)
      map.set(pair.underlying, list)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  })

  function select(id: string) {
    if (pairs.value.some(p => p.id === id))
      activePairId.value = id
  }

  /** 新增配对；代码组合重复时返回错误信息 */
  function addPair(input: Omit<Pair, 'id' | 'builtin'>): string | null {
    const underlying = input.underlying.trim().toUpperCase()
    const leveraged = input.leveraged.trim().toUpperCase()

    if (!underlying || !leveraged)
      return '正股代码和杠杆股代码都不能为空'
    if (underlying === leveraged)
      return '正股和杠杆股不能是同一个代码'
    if (!Number.isFinite(input.leverage) || input.leverage === 0)
      return '倍数必须是非 0 的数字'

    const id = pairId(underlying, leveraged)
    if (pairs.value.some(p => p.id === id))
      return `配对 ${underlying} → ${leveraged} 已存在`

    pairs.value = [
      ...pairs.value,
      { id, underlying, leveraged, leverage: input.leverage, label: input.label?.trim() || undefined },
    ]
    activePairId.value = id
    return null
  }

  /** 就地更新配对；改动代码会重算 id */
  function updatePair(id: string, patch: Partial<Omit<Pair, 'id'>>): string | null {
    const index = pairs.value.findIndex(p => p.id === id)
    if (index === -1)
      return '配对不存在'

    const current = pairs.value[index]
    const underlying = (patch.underlying ?? current.underlying).trim().toUpperCase()
    const leveraged = (patch.leveraged ?? current.leveraged).trim().toUpperCase()
    const leverage = patch.leverage ?? current.leverage

    if (!underlying || !leveraged)
      return '代码不能为空'
    if (underlying === leveraged)
      return '正股和杠杆股不能是同一个代码'
    if (!Number.isFinite(leverage) || leverage === 0)
      return '倍数必须是非 0 的数字'

    const nextId = pairId(underlying, leveraged)
    if (nextId !== id && pairs.value.some(p => p.id === nextId))
      return `配对 ${underlying} → ${leveraged} 已存在`

    const next = [...pairs.value]
    next[index] = {
      ...current,
      ...patch,
      id: nextId,
      underlying,
      leveraged,
      leverage,
      label: patch.label !== undefined ? (patch.label.trim() || undefined) : current.label,
    }
    pairs.value = next

    if (activePairId.value === id)
      activePairId.value = nextId

    return null
  }

  function removePair(id: string) {
    const next = pairs.value.filter(p => p.id !== id)
    pairs.value = next
    if (activePairId.value === id)
      activePairId.value = next[0]?.id ?? null
  }

  /** 把内置种子表重新合并进来（只补缺失的，不覆盖已有的） */
  function restorePresets(): number {
    const existing = new Set(pairs.value.map(p => p.id))
    const missing = buildPresetPairs().filter(p => !existing.has(p.id))
    if (missing.length > 0)
      pairs.value = [...pairs.value, ...missing]
    return missing.length
  }

  return {
    pairs,
    grouped,
    activePair,
    activePairId,
    ready,
    whenReady: initPromise,
    select,
    addPair,
    updatePair,
    removePair,
    restorePresets,
  }
}
