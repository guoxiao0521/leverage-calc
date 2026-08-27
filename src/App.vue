<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  AlertTriangleIcon,
  CheckIcon,
  ClipboardCopyIcon,
  LoaderCircleIcon,
  MoonIcon,
  RefreshCwIcon,
  SettingsIcon,
  SunIcon,
} from '@lucide/vue'
import { SESSION_LABEL } from '@/types'
import { formatDateTime } from '@/lib/format'
import { buildMarkdown } from '@/lib/markdown'
import { usePairs } from '@/composables/usePairs'
import { useSettings } from '@/composables/useSettings'
import { useCalculator } from '@/composables/useCalculator'
import { isTauri } from '@/composables/useStore'
import PairSelector from '@/components/PairSelector.vue'
import BaselinePanel from '@/components/BaselinePanel.vue'
import DecaySettings from '@/components/DecaySettings.vue'
import LevelTable from '@/components/LevelTable.vue'
import LevelEditor from '@/components/LevelEditor.vue'
import ReverseCalcCard from '@/components/ReverseCalcCard.vue'
import HoldingPanel from '@/components/HoldingPanel.vue'
import PairManagerDialog from '@/components/PairManagerDialog.vue'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'

const { activePairId, updatePair, whenReady } = usePairs()
const { theme, toggleTheme } = useSettings(() => activePairId.value)
const calc = useCalculator()

const managerOpen = ref(false)
const copied = ref(false)

const session = computed(() => calc.underlyingQuote.value?.session ?? null)
const asOf = computed(() => calc.underlyingQuote.value?.asOf ?? null)

const sessionVariant = computed(() => {
  switch (session.value) {
    case 'pre':
    case 'post':
      return 'warn' as const
    case 'regular':
      return 'default' as const
    default:
      return 'muted' as const
  }
})

async function copyMarkdown() {
  const pair = calc.activePair.value
  if (!pair || !calc.computable.value)
    return

  const text = buildMarkdown({
    pair,
    basePrice: calc.basePrice.value as number,
    baseLeveraged: calc.baseLeveraged.value as number,
    decay: calc.decay.value,
    rows: calc.rows.value,
    sessionLabel: session.value ? SESSION_LABEL[session.value] : undefined,
    showDecay: calc.showDecay.value,
    showPnl: calc.showPnl.value,
    costPrice: calc.holding.value.costPrice,
    shares: calc.holding.value.shares,
  })

  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => (copied.value = false), 1600)
  }
  catch (error) {
    console.warn('复制失败', error)
  }
}

function removeLevel(price: number) {
  calc.levelConfig.value = {
    ...calc.levelConfig.value,
    extra: calc.levelConfig.value.extra.filter(p => Math.abs(p - price) > 1e-6),
  }
}

function onLeverageChange(next: number) {
  if (activePairId.value)
    updatePair(activePairId.value, { leverage: next })
}

onMounted(async () => {
  await whenReady
  await calc.refreshAll()
})
</script>

<template>
  <div class="min-h-screen">
    <!-- 顶栏 -->
    <header class="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-30 border-b backdrop-blur">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <PairSelector />

        <Badge v-if="session" :variant="sessionVariant">{{ SESSION_LABEL[session] }}</Badge>
        <span v-if="asOf" class="text-muted-foreground text-xs tabular-nums">
          {{ formatDateTime(asOf) }}
        </span>
        <LoaderCircleIcon v-if="calc.loading.value" class="text-muted-foreground size-3.5 animate-spin" />

        <div class="ml-auto flex items-center gap-1.5">
          <Button variant="outline" size="sm" :disabled="calc.loading.value" @click="calc.refreshAll(true)">
            <RefreshCwIcon :class="calc.loading.value ? 'animate-spin' : ''" />刷新
          </Button>
          <Button variant="ghost" size="icon" title="配对管理" @click="managerOpen = true">
            <SettingsIcon />
          </Button>
          <Button variant="ghost" size="icon" title="切换主题" @click="toggleTheme">
            <MoonIcon v-if="theme === 'light'" />
            <SunIcon v-else />
          </Button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-6xl space-y-4 p-4">
      <!-- 环境/错误提示 -->
      <div
        v-if="!isTauri"
        class="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
      >
        <AlertTriangleIcon class="mt-0.5 size-3.5 shrink-0" />
        <span>当前在浏览器里运行，无法直连行情接口。手填两个基准价照样能算，完整功能请跑 <code>pnpm tauri dev</code>。</span>
      </div>
      <div
        v-else-if="calc.errorMessage.value"
        class="text-destructive border-destructive/40 bg-destructive/10 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs"
      >
        <AlertTriangleIcon class="mt-0.5 size-3.5 shrink-0" />
        <span>{{ calc.errorMessage.value }}</span>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <BaselinePanel
          :pair="calc.activePair.value"
          :underlying-quote="calc.underlyingQuote.value"
          :leveraged-quote="calc.leveragedQuote.value"
          :live-price="calc.livePrice.value"
          :live-leveraged="calc.liveLeveraged.value"
          :override-base="calc.overrideBase.value"
          :override-leveraged="calc.overrideLeveraged.value"
          :fit="calc.fit.value"
          @update:override-base="calc.overrideBase.value = $event"
          @update:override-leveraged="calc.overrideLeveraged.value = $event"
          @update:leverage="onLeverageChange"
        />
        <DecaySettings
          :decay="calc.decay.value"
          :leverage="calc.leverage.value"
          :vol-hint="calc.volHint.value"
          :loading-history="calc.loadingHistory.value"
          @update:decay="calc.decay.value = $event"
          @apply-vol-hint="calc.applyVolHint()"
        />
      </div>

      <!-- 主表 -->
      <Card title="价位对照表" body-class="p-0">
        <template #header>
          <Button variant="outline" size="sm" :disabled="!calc.computable.value" @click="copyMarkdown">
            <CheckIcon v-if="copied" />
            <ClipboardCopyIcon v-else />
            {{ copied ? '已复制' : '复制为 Markdown' }}
          </Button>
        </template>

        <LevelTable
          :rows="calc.rows.value"
          :pair="calc.activePair.value"
          :days="calc.decay.value.days"
          :show-decay="calc.showDecay.value"
          :show-pnl="calc.showPnl.value"
          :computable="calc.computable.value"
          @remove-level="removeLevel"
        />

        <div class="bg-muted/30 border-t px-4 py-3">
          <LevelEditor
            :config="calc.levelConfig.value"
            :base-price="calc.basePrice.value"
            @update:config="calc.levelConfig.value = $event"
          />
        </div>
      </Card>

      <div class="grid gap-4 lg:grid-cols-2">
        <ReverseCalcCard
          :pair="calc.activePair.value"
          :target="calc.reverseTarget.value"
          :linear="calc.reverseLinear.value"
          :decay="calc.reverseDecay.value"
          :base-price="calc.basePrice.value"
          :days="calc.decay.value.days"
          :show-decay="calc.showDecay.value"
          @update:target="calc.reverseTarget.value = $event"
        />
        <HoldingPanel
          :pair="calc.activePair.value"
          :holding="calc.holding.value"
          :pnl="calc.currentPnl.value"
          :break-even="calc.breakEvenPrice.value"
          :base-price="calc.basePrice.value"
          @update:holding="calc.holding.value = $event"
          @clear="calc.holding.value = { costPrice: null, shares: null }"
        />
      </div>

      <!-- 免责声明 -->
      <div class="text-muted-foreground space-y-1.5 rounded-lg border border-dashed px-4 py-3 text-xs leading-relaxed">
        <p class="text-foreground flex items-center gap-1.5 font-medium">
          <AlertTriangleIcon class="size-3.5" />提醒
        </p>
        <p>· 「当日」一列是简化的线性估算，只反映同一交易日内从基准价涨跌到目标价的大致对应关系。</p>
        <p>· 杠杆 ETP 按<strong class="text-foreground">每日重置</strong>，跨多个交易日的结果是路径依赖的，不能直接用线性关系推。</p>
        <p>
          · 常说的「多日持有一定比线性估算低」<strong class="text-foreground">只在震荡行情下成立</strong>：净变动不大时波动损耗占主导，「N 日后」会低于「当日」；
          但遇到<strong class="text-foreground">大幅单边行情</strong>，复利凸性反过来占主导，「N 日后」会<strong class="text-foreground">高于</strong>「当日」——
          比如 2x 在线性口径下跌到某个价就归零了，复利口径却永远打不到 0。两列并排看，差在哪一目了然。
        </p>
        <p>· 「N 日后」一列假设波动率恒定、忽略跟踪误差、折溢价和分红，是粗糙模型；σ 越不准，这一列越不可信。</p>
        <p>· 仅供参考，不构成投资建议。</p>
      </div>
    </main>

    <PairManagerDialog :open="managerOpen" @update:open="managerOpen = $event" />
  </div>
</template>
