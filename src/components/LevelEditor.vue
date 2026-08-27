<script setup lang="ts">
import { computed, ref } from 'vue'
import { PlusIcon } from '@lucide/vue'
import type { LevelConfig } from '@/types'
import Button from './ui/Button.vue'
import NumberField from './ui/NumberField.vue'

const props = defineProps<{
  config: LevelConfig
  basePrice: number | null
}>()

const emit = defineEmits<{ 'update:config': [LevelConfig] }>()

const manualPrice = ref<number | null>(null)

function patch(part: Partial<LevelConfig>) {
  emit('update:config', { ...props.config, ...part })
}

const downPercent = computed({
  get: () => props.config.downPercent,
  set: (v: number | null) => patch({ downPercent: v === null ? 0 : Math.max(0, v) }),
})

const upPercent = computed({
  get: () => props.config.upPercent,
  set: (v: number | null) => patch({ upPercent: v === null ? 0 : Math.max(0, v) }),
})

const stepPercent = computed({
  get: () => props.config.stepPercent,
  set: (v: number | null) => patch({ stepPercent: v === null || v <= 0 ? 1 : v }),
})

function addManual() {
  const price = manualPrice.value
  if (price === null || !Number.isFinite(price) || price <= 0)
    return
  if (!props.config.extra.includes(price))
    patch({ extra: [...props.config.extra, price] })
  manualPrice.value = null
}

function clearExtras() {
  patch({ extra: [] })
}
</script>

<template>
  <div class="flex flex-wrap items-end gap-3">
    <NumberField v-model="downPercent" label="向下" suffix="%" :step="1" :min="0" class="w-24" />
    <NumberField v-model="upPercent" label="向上" suffix="%" :step="1" :min="0" class="w-24" />
    <NumberField v-model="stepPercent" label="步长" suffix="%" :step="0.5" :min="0.1" class="w-24" />

    <div class="bg-border mx-1 hidden h-9 w-px sm:block" />

    <div class="flex items-end gap-2">
      <NumberField
        v-model="manualPrice"
        label="手动添加价位"
        :step="0.01"
        :placeholder="basePrice === null ? '如 208' : String(Math.round(basePrice))"
        class="w-32"
      />
      <Button variant="outline" @click="addManual">
        <PlusIcon />添加
      </Button>
    </div>

    <Button
      v-if="config.extra.length > 0"
      variant="ghost"
      size="sm"
      class="mb-0.5"
      @click="clearExtras"
    >
      清空 {{ config.extra.length }} 个手动价位
    </Button>
  </div>
</template>
