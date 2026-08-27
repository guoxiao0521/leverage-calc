<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeftIcon } from '@lucide/vue'
import type { Pair } from '@/types'
import { DASH, changeColorClass, formatPrice } from '@/lib/format'
import Card from './ui/Card.vue'
import NumberField from './ui/NumberField.vue'

const props = defineProps<{
  pair: Pair | null
  target: number | null
  linear: number | null
  decay: number | null
  basePrice: number | null
  days: number
  showDecay: boolean
}>()

const emit = defineEmits<{ 'update:target': [number | null] }>()

const value = computed({
  get: () => props.target,
  set: (v: number | null) => emit('update:target', v),
})

/** 相对当前基准价还要走多少 */
function delta(price: number | null): number | null {
  if (price === null || props.basePrice === null || props.basePrice <= 0)
    return null
  return (price / props.basePrice - 1) * 100
}

const linearDelta = computed(() => delta(props.linear))
const decayDelta = computed(() => delta(props.decay))

function show(price: number | null): string {
  if (price === null || !Number.isFinite(price))
    return DASH
  return price <= 0 ? '不可能达到' : formatPrice(price)
}

function showDelta(value: number | null): string {
  if (value === null || !Number.isFinite(value))
    return ''
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(1)}%`
}
</script>

<template>
  <Card title="反推" subtitle="想让杠杆股到某个价，正股得走到哪">
    <NumberField
      v-model="value"
      :label="`目标 ${pair?.leveraged ?? '杠杆股'} 价格`"
      :step="0.01"
      placeholder="如 22.35"
    />

    <dl class="mt-3 space-y-2 text-sm">
      <div class="flex items-baseline justify-between gap-3">
        <dt class="text-muted-foreground">当日需要 {{ pair?.underlying ?? '正股' }}</dt>
        <dd class="flex items-baseline gap-2 tabular-nums">
          <span class="font-medium">{{ show(linear) }}</span>
          <span class="text-xs" :class="changeColorClass(linearDelta)">{{ showDelta(linearDelta) }}</span>
        </dd>
      </div>
      <div v-if="showDecay" class="flex items-baseline justify-between gap-3">
        <dt class="text-muted-foreground">持有 {{ days }} 日则需要</dt>
        <dd class="flex items-baseline gap-2 tabular-nums">
          <span class="font-medium">{{ show(decay) }}</span>
          <span class="text-xs" :class="changeColorClass(decayDelta)">{{ showDelta(decayDelta) }}</span>
        </dd>
      </div>
    </dl>

    <p v-if="showDecay" class="text-muted-foreground mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed">
      <ArrowLeftIcon class="mt-0.5 size-3 shrink-0" />
      多日口径下要求更高，因为衰减先吃掉一部分涨幅
    </p>
  </Card>
</template>
