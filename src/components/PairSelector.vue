<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDownIcon } from '@lucide/vue'
import { usePairs } from '@/composables/usePairs'

const { grouped, activePairId, select } = usePairs()

const value = computed({
  get: () => activePairId.value ?? '',
  set: (id: string) => select(id),
})

function optionLabel(underlying: string, leveraged: string, leverage: number): string {
  const sign = leverage > 0 ? '' : '反向 '
  return `${underlying} → ${leveraged}（${sign}${Math.abs(leverage)}x）`
}
</script>

<template>
  <div class="relative">
    <select
      v-model="value"
      class="focus-visible:ring-ring/50 h-9 appearance-none rounded-md border bg-background py-0 pr-8 pl-2.5 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
    >
      <option v-if="grouped.length === 0" value="">
        暂无配对，先去「配对管理」添加
      </option>
      <optgroup v-for="[underlying, list] in grouped" :key="underlying" :label="underlying">
        <option v-for="pair in list" :key="pair.id" :value="pair.id">
          {{ optionLabel(pair.underlying, pair.leveraged, pair.leverage) }}
        </option>
      </optgroup>
    </select>
    <ChevronDownIcon class="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2" />
  </div>
</template>
