// 计算参数、点位配置、持仓、主题的持久化。
// 持仓按配对分开存，切换配对时自动带出对应的成本/股数。

import { computed, ref, watch } from 'vue'
import type { DecayParams } from '@/lib/leverage'
import { DEFAULT_DECAY } from '@/lib/leverage'
import type { Holding, LevelConfig } from '@/types'
import { DEFAULT_LEVEL_CONFIG } from '@/lib/levels'
import { readSetting, writeSetting } from './useStore'

const KEY_DECAY = 'decay'
const KEY_LEVELS = 'levelConfig'
const KEY_HOLDINGS = 'holdings'
const KEY_THEME = 'theme'

export type Theme = 'light' | 'dark'

const decay = ref<DecayParams>({ ...DEFAULT_DECAY })
const levelConfig = ref<LevelConfig>({ ...DEFAULT_LEVEL_CONFIG })
const holdings = ref<Record<string, Holding>>({})
const theme = ref<Theme>('dark')
const ready = ref(false)

let initPromise: Promise<void> | null = null

function applyTheme(value: Theme) {
  document.documentElement.classList.toggle('dark', value === 'dark')
}

async function init(): Promise<void> {
  decay.value = { ...DEFAULT_DECAY, ...(await readSetting(KEY_DECAY, {})) }
  levelConfig.value = { ...DEFAULT_LEVEL_CONFIG, ...(await readSetting(KEY_LEVELS, {})) }
  holdings.value = await readSetting<Record<string, Holding>>(KEY_HOLDINGS, {})

  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
  theme.value = await readSetting<Theme>(KEY_THEME, prefersDark ? 'dark' : 'light')
  applyTheme(theme.value)

  ready.value = true

  watch(decay, value => void writeSetting(KEY_DECAY, value), { deep: true })
  watch(levelConfig, value => void writeSetting(KEY_LEVELS, value), { deep: true })
  watch(holdings, value => void writeSetting(KEY_HOLDINGS, value), { deep: true })
  watch(theme, (value) => {
    applyTheme(value)
    void writeSetting(KEY_THEME, value)
  })
}

export function useSettings(pairId?: () => string | null) {
  if (!initPromise)
    initPromise = init()

  const holding = computed<Holding>({
    get() {
      const id = pairId?.()
      if (!id)
        return { costPrice: null, shares: null }
      return holdings.value[id] ?? { costPrice: null, shares: null }
    },
    set(value) {
      const id = pairId?.()
      if (!id)
        return
      holdings.value = { ...holdings.value, [id]: value }
    },
  })

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  function clearHolding() {
    const id = pairId?.()
    if (!id)
      return
    const next = { ...holdings.value }
    delete next[id]
    holdings.value = next
  }

  return { decay, levelConfig, holdings, holding, theme, ready, toggleTheme, clearHolding }
}
