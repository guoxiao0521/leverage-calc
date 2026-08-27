<script setup lang="ts">
import { computed } from 'vue'
import { Trash2Icon } from '@lucide/vue'
import type { Holding, Pair } from '@/types'
import type { HoldingPnl } from '@/lib/leverage'
import { DASH, changeColorClass, formatPrice, formatSignedMoney } from '@/lib/format'
import Card from './ui/Card.vue'
import Button from './ui/Button.vue'
import NumberField from './ui/NumberField.vue'

const props = defineProps<{
  pair: Pair | null
  holding: Holding
  pnl: HoldingPnl
  breakEven: number | null
  basePrice: number | null
}>()

const emit = defineEmits<{
  'update:holding': [Holding]
  'clear': []
}>()

const costPrice = computed({
  get: () => props.holding.costPrice,
  set: (v: number | null) => emit('update:holding', { ...props.holding, costPrice: v }),
})

const shares = computed({
  get: () => props.holding.shares,
  set: (v: number | null) => emit('update:holding', { ...props.holding, shares: v }),
})

const hasHolding = computed(() =>
  props.holding.costPrice !== null || props.holding.shares !== null)

/** 回本相对当前基准价还要走多少 */
const breakEvenDelta = computed(() => {
  if (props.breakEven === null || props.basePrice === null || props.basePrice <= 0)
    return null
  return (props.breakEven / props.basePrice - 1) * 100
})

function showDelta(value: number | null): string {
  if (value === null || !Number.isFinite(value))
    return ''
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `还需 ${sign}${Math.abs(value).toFixed(1)}%`
}
</script>

<template>
  <Card title="持仓" subtitle="填了成本，表格会多出盈亏两列">
    <template #header>
      <Button v-if="hasHolding" variant="ghost" size="sm" @click="emit('clear')">
        <Trash2Icon />清空
      </Button>
    </template>

    <div class="grid grid-cols-2 gap-3">
      <NumberField
        v-model="costPrice"
        :label="`${pair?.leveraged ?? '杠杆股'} 成本价`"
        :step="0.01"
        :min="0"
        placeholder="如 24.50"
      />
      <NumberField v-model="shares" label="股数" :step="1" :min="0" placeholder="如 100" />
    </div>

    <dl class="mt-3 space-y-2 text-sm">
      <div class="flex items-baseline justify-between gap-3">
        <dt class="text-muted-foreground">当前盈亏</dt>
        <dd class="flex items-baseline gap-2 tabular-nums" :class="changeColorClass(pnl.percent)">
          <span class="font-medium">
            {{ pnl.amount === null ? DASH : formatSignedMoney(pnl.amount, 'USD') }}
          </span>
          <span class="text-xs">
            {{ pnl.percent === null ? DASH : `${pnl.percent > 0 ? '+' : pnl.percent < 0 ? '−' : ''}${Math.abs(pnl.percent).toFixed(2)}%` }}
          </span>
        </dd>
      </div>
      <div class="flex items-baseline justify-between gap-3">
        <dt class="text-muted-foreground">回本需 {{ pair?.underlying ?? '正股' }} 到</dt>
        <dd class="flex items-baseline gap-2 tabular-nums">
          <span class="font-medium">{{ breakEven === null ? DASH : formatPrice(breakEven) }}</span>
          <span class="text-muted-foreground text-xs">{{ showDelta(breakEvenDelta) }}</span>
        </dd>
      </div>
    </dl>

    <p v-if="holding.costPrice !== null && holding.shares === null" class="text-muted-foreground mt-3 text-[11px]">
      填上股数才会显示盈亏金额，只填成本价则只算百分比
    </p>
  </Card>
</template>
