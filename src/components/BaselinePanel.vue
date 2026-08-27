<script setup lang="ts">
import { computed } from 'vue'
import { RotateCcwIcon } from '@lucide/vue'
import type { LeverageFit } from '@/lib/stats'
import type { Pair, SymbolQuote } from '@/types'
import { DASH, formatPrice } from '@/lib/format'
import Card from './ui/Card.vue'
import Badge from './ui/Badge.vue'
import NumberField from './ui/NumberField.vue'

const props = defineProps<{
  pair: Pair | null
  underlyingQuote: SymbolQuote | null
  leveragedQuote: SymbolQuote | null
  livePrice: number | null
  liveLeveraged: number | null
  overrideBase: number | null
  overrideLeveraged: number | null
  fit: LeverageFit | null
}>()

const emit = defineEmits<{
  'update:overrideBase': [number | null]
  'update:overrideLeveraged': [number | null]
  'update:leverage': [number]
}>()

/** 实测倍数与配置值偏离超过 15% 就提醒 —— 多半是配对表里的倍数写错了 */
const fitMismatch = computed(() => {
  const fit = props.fit
  const k = props.pair?.leverage
  if (!fit || k === undefined || fit.r2 < 0.8)
    return false
  return Math.abs(fit.beta - k) / Math.abs(k) > 0.15
})

const baseValue = computed({
  get: () => props.overrideBase ?? props.livePrice,
  set: (v: number | null) => emit('update:overrideBase', v === props.livePrice ? null : v),
})

const leveragedValue = computed({
  get: () => props.overrideLeveraged ?? props.liveLeveraged,
  set: (v: number | null) => emit('update:overrideLeveraged', v === props.liveLeveraged ? null : v),
})

const leverageValue = computed({
  get: () => props.pair?.leverage ?? null,
  set: (v: number | null) => {
    if (v !== null && Number.isFinite(v) && v !== 0)
      emit('update:leverage', v)
  },
})
</script>

<template>
  <Card title="基准价" subtitle="表格里的所有估算都以这两个价格为起点">
    <div class="grid gap-4 sm:grid-cols-3">
      <!-- 正股 -->
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center gap-1.5">
          <span class="text-sm font-medium">{{ pair?.underlying ?? DASH }}</span>
          <Badge variant="muted">正股</Badge>
          <Badge v-if="overrideBase !== null" variant="warn">已覆盖</Badge>
        </div>
        <NumberField v-model="baseValue" :step="0.01" placeholder="等待行情…" />
        <div class="text-muted-foreground flex h-4 items-center gap-1.5 text-[11px]">
          <template v-if="overrideBase !== null">
            <span>实时 {{ formatPrice(livePrice) }}</span>
            <button
              class="hover:text-foreground inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
              @click="emit('update:overrideBase', null)"
            >
              <RotateCcwIcon class="size-3" />恢复实时
            </button>
          </template>
          <span v-else class="truncate">{{ underlyingQuote?.name ?? '　' }}</span>
        </div>
      </div>

      <!-- 杠杆股 -->
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center gap-1.5">
          <span class="text-sm font-medium">{{ pair?.leveraged ?? DASH }}</span>
          <Badge variant="muted">杠杆</Badge>
          <Badge v-if="overrideLeveraged !== null" variant="warn">已覆盖</Badge>
        </div>
        <NumberField v-model="leveragedValue" :step="0.01" placeholder="等待行情…" />
        <div class="text-muted-foreground flex h-4 items-center gap-1.5 text-[11px]">
          <template v-if="overrideLeveraged !== null">
            <span>实时 {{ formatPrice(liveLeveraged) }}</span>
            <button
              class="hover:text-foreground inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
              @click="emit('update:overrideLeveraged', null)"
            >
              <RotateCcwIcon class="size-3" />恢复实时
            </button>
          </template>
          <span v-else class="truncate">{{ leveragedQuote?.name ?? '　' }}</span>
        </div>
      </div>

      <!-- 倍数 -->
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center gap-1.5">
          <span class="text-sm font-medium">倍数</span>
          <Badge v-if="fitMismatch" variant="warn">与实测不符</Badge>
        </div>
        <NumberField v-model="leverageValue" :step="0.5" placeholder="如 2 / -2" />
        <div class="text-muted-foreground h-4 text-[11px]">
          <template v-if="fit">
            实测 {{ fit.beta.toFixed(2) }}x
            <span class="opacity-70">（近 {{ fit.samples }} 日回归，R²={{ fit.r2.toFixed(2) }}）</span>
          </template>
          <span v-else>反向产品填负数</span>
        </div>
      </div>
    </div>
  </Card>
</template>
