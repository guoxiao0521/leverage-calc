<script setup lang="ts">
// 数值输入：内部用字符串保存，避免「输到一半」被 v-model.number 吞掉小数点
import { ref, watch } from 'vue'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  modelValue: number | null
  label?: string
  suffix?: string
  placeholder?: string
  step?: number
  min?: number
  class?: string
  inputClass?: string
  disabled?: boolean
}>(), {
  step: 0.01,
})

const emit = defineEmits<{ 'update:modelValue': [number | null] }>()

const text = ref(props.modelValue === null ? '' : String(props.modelValue))

watch(() => props.modelValue, (next) => {
  const parsed = text.value.trim() === '' ? null : Number(text.value)
  // 只有外部值和当前输入框真的不一致时才回写，否则会打断用户输入
  if (next !== parsed)
    text.value = next === null ? '' : String(next)
})

function onInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  text.value = raw
  const trimmed = raw.trim()
  if (trimmed === '') {
    emit('update:modelValue', null)
    return
  }
  const parsed = Number(trimmed)
  if (Number.isFinite(parsed))
    emit('update:modelValue', parsed)
}
</script>

<template>
  <label :class="cn('flex flex-col gap-1', props.class)">
    <span v-if="label" class="text-muted-foreground text-xs">{{ label }}</span>
    <span class="relative flex items-center">
      <input
        :value="text"
        type="number"
        inputmode="decimal"
        :step="step"
        :min="min"
        :placeholder="placeholder"
        :disabled="disabled"
        :class="cn(
          'h-9 w-full rounded-md border bg-background px-2.5 text-sm tabular-nums',
          'focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50',
          suffix ? 'pr-8' : '',
          props.inputClass,
        )"
        @input="onInput"
      >
      <span v-if="suffix" class="text-muted-foreground pointer-events-none absolute right-2.5 text-xs">
        {{ suffix }}
      </span>
    </span>
  </label>
</template>
