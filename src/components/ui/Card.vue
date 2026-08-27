<script setup lang="ts">
import { cn } from '@/lib/utils'

const props = defineProps<{
  title?: string
  subtitle?: string
  class?: string
  bodyClass?: string
}>()
</script>

<template>
  <section :class="cn('rounded-xl border bg-card text-card-foreground shadow-sm', props.class)">
    <header
      v-if="title || $slots.header"
      class="flex min-h-11 items-center justify-between gap-3 border-b px-4 py-2"
    >
      <div class="flex items-baseline gap-2">
        <h2 class="text-sm font-semibold tracking-tight">{{ title }}</h2>
        <span v-if="subtitle" class="text-muted-foreground text-xs">{{ subtitle }}</span>
      </div>
      <slot name="header" />
    </header>
    <div :class="cn('p-4', props.bodyClass)">
      <slot />
    </div>
  </section>
</template>
