<script setup lang="ts">
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary'
  size?: 'sm' | 'md' | 'icon'
  class?: string
  disabled?: boolean
}>(), {
  variant: 'default',
  size: 'md',
})

const VARIANTS: Record<string, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  outline: 'border bg-background hover:bg-accent hover:text-accent-foreground',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  destructive: 'bg-destructive text-white hover:bg-destructive/90',
}

const SIZES: Record<string, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1',
  md: 'h-9 px-3.5 text-sm gap-1.5',
  icon: 'h-9 w-9',
}
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    :class="cn(
      'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors',
      'focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none',
      'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
      VARIANTS[props.variant],
      SIZES[props.size],
      props.class,
    )"
  >
    <slot />
  </button>
</template>
