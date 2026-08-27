<script setup lang="ts">
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  variant?: 'default' | 'outline' | 'muted' | 'warn'
  class?: string
}>(), { variant: 'default' })

const VARIANTS: Record<string, string> = {
  default: 'bg-primary text-primary-foreground border-transparent',
  outline: 'border-border text-foreground',
  muted: 'bg-muted text-muted-foreground border-transparent',
  warn: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
}
</script>

<template>
  <span :class="cn('inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap', VARIANTS[props.variant], props.class)">
    <slot />
  </span>
</template>
