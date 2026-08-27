<script setup lang="ts">
import { computed } from 'vue'
import { WandSparklesIcon } from '@lucide/vue'
import type { DecayParams } from '@/lib/leverage'
import { decayFactor } from '@/lib/leverage'
import Card from './ui/Card.vue'
import Button from './ui/Button.vue'
import NumberField from './ui/NumberField.vue'

const props = defineProps<{
  decay: DecayParams
  leverage: number | null
  volHint: number | null
  loadingHistory: boolean
}>()

const emit = defineEmits<{
  'update:decay': [DecayParams]
  'applyVolHint': []
}>()

function patch(part: Partial<DecayParams>) {
  emit('update:decay', { ...props.decay, ...part })
}

const days = computed({
  get: () => props.decay.days,
  set: (v: number | null) => patch({ days: v === null ? 1 : Math.max(1, Math.round(v)) }),
})

// σ 和费率在界面上用百分数，内部存小数
const volPercent = computed({
  get: () => Math.round(props.decay.dailyVol * 10000) / 100,
  set: (v: number | null) => patch({ dailyVol: v === null ? 0 : Math.max(0, v) / 100 }),
})

const feePercent = computed({
  get: () => Math.round(props.decay.feeAnnual * 10000) / 100,
  set: (v: number | null) => patch({ feeAnnual: v === null ? 0 : Math.max(0, v) / 100 }),
})

/** 在完全不涨不跌的横盘假设下，这段时间会磨掉多少 */
const flatDrag = computed(() => {
  if (props.leverage === null || props.decay.days <= 1)
    return null
  return (decayFactor(props.leverage, props.decay) - 1) * 100
})

const volHintPercent = computed(() =>
  props.volHint === null ? null : (props.volHint * 100).toFixed(2))
</script>

<template>
  <Card title="持有参数" subtitle="只影响「N 日后」那一列">
    <div class="grid gap-3 sm:grid-cols-3">
      <NumberField v-model="days" label="持有交易日" :step="1" :min="1" />
      <NumberField v-model="volPercent" label="日波动率 σ" suffix="%" :step="0.1" :min="0" />
      <NumberField v-model="feePercent" label="年费率" suffix="%" :step="0.05" :min="0" />
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button
        variant="outline"
        size="sm"
        :disabled="volHint === null || loadingHistory"
        @click="emit('applyVolHint')"
      >
        <WandSparklesIcon />
        {{ volHint === null ? '暂无历史数据' : `按近 60 日估算（${volHintPercent}%）` }}
      </Button>

      <p v-if="flatDrag !== null" class="text-muted-foreground text-xs">
        横盘不动时，{{ decay.days }} 个交易日大约磨掉
        <span class="text-rose-600 tabular-nums dark:text-rose-500">{{ flatDrag.toFixed(2) }}%</span>
        <span class="opacity-70">；单边大幅波动时复利凸性会反过来压过这份损耗</span>
      </p>
      <p v-else class="text-muted-foreground text-xs">
        持有天数设为 1 时不计衰减，表格只显示当日线性估算
      </p>
    </div>
  </Card>
</template>
