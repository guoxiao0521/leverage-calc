<script setup lang="ts">
import { computed } from 'vue'
import { XIcon } from '@lucide/vue'
import type { LevelRow, Pair } from '@/types'
import { DASH, changeColorClass, formatPrice, formatSignedMoney } from '@/lib/format'
import Badge from './ui/Badge.vue'

const props = defineProps<{
  rows: LevelRow[]
  pair: Pair | null
  days: number
  showDecay: boolean
  showPnl: boolean
  computable: boolean
}>()

const emit = defineEmits<{ removeLevel: [price: number] }>()

const columnCount = computed(() => 4 + (props.showDecay ? 1 : 0) + (props.showPnl ? 2 : 0) + 1)

function pct(value: number | null): string {
  if (value === null || !Number.isFinite(value))
    return DASH
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(1)}%`
}

function estimate(value: number | null, wipedOut: boolean): string {
  if (wipedOut)
    return '≈0'
  if (value === null || !Number.isFinite(value))
    return DASH
  return value.toFixed(2)
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full min-w-[640px] text-sm">
      <thead>
        <tr class="text-muted-foreground border-b text-xs">
          <th class="px-3 py-2 text-left font-medium">{{ pair?.underlying ?? '正股' }} 价格</th>
          <th class="px-3 py-2 text-right font-medium">涨跌幅</th>
          <th class="px-3 py-2 text-right font-medium">
            {{ pair?.leveraged ?? '杠杆股' }} 涨跌幅<span v-if="pair" class="opacity-70">（{{ pair.leverage }}x）</span>
          </th>
          <th class="px-3 py-2 text-right font-medium">估算价（当日）</th>
          <th v-if="showDecay" class="px-3 py-2 text-right font-medium">
            估算价（{{ days }} 日后）
          </th>
          <th v-if="showPnl" class="px-3 py-2 text-right font-medium">盈亏</th>
          <th v-if="showPnl" class="px-3 py-2 text-right font-medium">盈亏%</th>
          <th class="w-8 px-1 py-2" />
        </tr>
      </thead>
      <tbody>
        <tr v-if="!computable">
          <td :colspan="columnCount" class="text-muted-foreground px-3 py-10 text-center text-sm">
            等待基准价 —— 点右上角「刷新」拉取行情，或直接在上方手填两个基准价
          </td>
        </tr>
        <tr v-else-if="rows.length === 0">
          <td :colspan="columnCount" class="text-muted-foreground px-3 py-10 text-center text-sm">
            没有价位，去下面的「点位」调整范围或手动添加
          </td>
        </tr>

        <tr
          v-for="row in rows"
          :key="row.price"
          class="border-b last:border-b-0"
          :class="[
            row.isCurrent ? 'bg-accent/60 font-medium' : 'hover:bg-muted/40',
            row.isBreakEven ? 'bg-amber-500/10' : '',
          ]"
        >
          <td class="px-3 py-1.5 tabular-nums">
            <span class="inline-flex items-center gap-1.5">
              {{ formatPrice(row.price) }}
              <Badge v-if="row.isCurrent" variant="outline">基准</Badge>
              <Badge v-if="row.isBreakEven" variant="warn">回本</Badge>
            </span>
          </td>
          <td class="px-3 py-1.5 text-right tabular-nums" :class="changeColorClass(row.changePercent)">
            {{ pct(row.changePercent) }}
          </td>
          <td
            class="px-3 py-1.5 text-right tabular-nums"
            :class="changeColorClass(row.leveragedChangePercent)"
          >
            {{ pct(row.leveragedChangePercent) }}
          </td>
          <td class="px-3 py-1.5 text-right tabular-nums">
            <span :class="row.wipedOut ? 'text-rose-600 dark:text-rose-500' : ''">
              {{ estimate(row.linearPrice, row.wipedOut) }}
            </span>
            <span v-if="row.wipedOut" class="text-muted-foreground ml-1 text-[11px]">理论清零</span>
          </td>
          <td v-if="showDecay" class="text-muted-foreground px-3 py-1.5 text-right tabular-nums">
            {{ estimate(row.decayPrice, false) }}
          </td>
          <td
            v-if="showPnl"
            class="px-3 py-1.5 text-right tabular-nums"
            :class="changeColorClass(row.pnlAmount)"
          >
            {{ row.pnlAmount === null ? DASH : formatSignedMoney(row.pnlAmount, 'USD') }}
          </td>
          <td
            v-if="showPnl"
            class="px-3 py-1.5 text-right tabular-nums"
            :class="changeColorClass(row.pnlPercent)"
          >
            {{ pct(row.pnlPercent) }}
          </td>
          <td class="px-1 py-1.5 text-center">
            <button
              v-if="row.isExtra"
              class="text-muted-foreground hover:text-destructive inline-flex size-5 items-center justify-center rounded"
              title="移除这个手动价位"
              @click="emit('removeLevel', row.price)"
            >
              <XIcon class="size-3.5" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
