<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { CheckIcon, LoaderCircleIcon, PlusIcon, Trash2Icon, XIcon } from '@lucide/vue'
import type { Pair } from '@/types'
import { usePairs } from '@/composables/usePairs'
import { useQuotes } from '@/composables/useQuotes'
import { alignByDate, fitLeverage } from '@/lib/stats'
import Button from './ui/Button.vue'
import Badge from './ui/Badge.vue'
import NumberField from './ui/NumberField.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [boolean] }>()

const { pairs, addPair, updatePair, removePair, restorePresets } = usePairs()
const { fetchSeries, resolveSymbol } = useQuotes()

const message = ref<string | null>(null)
const messageTone = ref<'error' | 'ok'>('error')

function say(text: string, tone: 'error' | 'ok' = 'error') {
  message.value = text
  messageTone.value = tone
}

// —— 新增表单 ——
const draft = reactive({ underlying: '', leveraged: '', leverage: 2 as number | null, label: '' })

function submitDraft() {
  const error = addPair({
    underlying: draft.underlying,
    leveraged: draft.leveraged,
    leverage: draft.leverage ?? 0,
    label: draft.label,
  })
  if (error) {
    say(error)
    return
  }
  say(`已添加 ${draft.underlying.toUpperCase()} → ${draft.leveraged.toUpperCase()}`, 'ok')
  draft.underlying = ''
  draft.leveraged = ''
  draft.leverage = 2
  draft.label = ''
}

// —— 逐条验证 ——
interface VerifyResult {
  status: 'loading' | 'ok' | 'error'
  name?: string | null
  beta?: number | null
  r2?: number | null
  text: string
}

const verified = reactive<Record<string, VerifyResult>>({})

async function verify(pair: Pair) {
  verified[pair.id] = { status: 'loading', text: '验证中…' }
  try {
    const info = await resolveSymbol(pair.leveraged)
    const series = await fetchSeries([pair.underlying, pair.leveraged], '6mo', false)
    const [u, l] = series

    let beta: number | null = null
    let r2: number | null = null
    if (u && l && !u.error && !l.error) {
      const aligned = alignByDate(u.dates, u.closes, l.dates, l.closes)
      const fit = fitLeverage(aligned.closesA.slice(-61), aligned.closesB.slice(-61))
      if (fit) {
        beta = fit.beta
        r2 = fit.r2
      }
    }

    const parts = [info.name ?? pair.leveraged]
    if (beta !== null)
      parts.push(`实测 ${beta.toFixed(2)}x（R²=${(r2 ?? 0).toFixed(2)}）`)

    verified[pair.id] = { status: 'ok', name: info.name, beta, r2, text: parts.join(' · ') }
  }
  catch (error) {
    verified[pair.id] = {
      status: 'error',
      text: error instanceof Error ? error.message : String(error),
    }
  }
}

/** 实测倍数和配置值差得多就标黄 */
function mismatched(pair: Pair): boolean {
  const result = verified[pair.id]
  if (!result || result.status !== 'ok' || result.beta === null || result.beta === undefined)
    return false
  if ((result.r2 ?? 0) < 0.8)
    return false
  return Math.abs(result.beta - pair.leverage) / Math.abs(pair.leverage) > 0.15
}

function applyMeasured(pair: Pair) {
  const beta = verified[pair.id]?.beta
  if (beta === null || beta === undefined)
    return
  // 实测值是带噪声的，取到 0.1 就够了
  const rounded = Math.round(beta * 10) / 10
  const error = updatePair(pair.id, { leverage: rounded })
  say(error ?? `${pair.leveraged} 倍数已改为 ${rounded}x`, error ? 'error' : 'ok')
}

/** 代码改动用 change 而不是 input —— 边打字边改会在半截代码上反复报「找不到」 */
function onCodeChange(pair: Pair, field: 'underlying' | 'leveraged', event: Event) {
  const input = event.target as HTMLInputElement
  const next = input.value.trim().toUpperCase()
  if (next === pair[field]) {
    input.value = pair[field]
    return
  }
  const error = updatePair(pair.id, { [field]: next })
  if (error) {
    say(error)
    input.value = pair[field]
    return
  }
  // 代码变了，旧的验证结果不再对应
  delete verified[pair.id]
  say(`已改为 ${field === 'underlying' ? next : pair.underlying} → ${field === 'leveraged' ? next : pair.leveraged}`, 'ok')
}

function onLabelChange(pair: Pair, event: Event) {
  const error = updatePair(pair.id, { label: (event.target as HTMLInputElement).value })
  if (error)
    say(error)
}

function onLeverageChange(pair: Pair, value: number | null) {
  if (value === null)
    return
  const error = updatePair(pair.id, { leverage: value })
  if (error)
    say(error)
}

function doRestore() {
  const added = restorePresets()
  say(added === 0 ? '内置配对都还在，没有需要补的' : `补回了 ${added} 组内置配对`, 'ok')
}

const sorted = computed(() =>
  [...pairs.value].sort((a, b) =>
    a.underlying.localeCompare(b.underlying) || a.leveraged.localeCompare(b.leveraged)))
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    @click.self="emit('update:open', false)"
  >
    <div class="bg-background flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border shadow-lg">
      <header class="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 class="text-sm font-semibold">配对管理</h2>
          <p class="text-muted-foreground text-xs">
            内置表只是起点 —— 杠杆 ETP 上新/清盘频繁，用「验证」核对真实名称和实测倍数
          </p>
        </div>
        <Button variant="ghost" size="icon" @click="emit('update:open', false)">
          <XIcon />
        </Button>
      </header>

      <!-- 新增 -->
      <div class="bg-muted/40 flex flex-wrap items-end gap-2 border-b px-4 py-3">
        <label class="flex w-28 flex-col gap-1">
          <span class="text-muted-foreground text-xs">正股代码</span>
          <input
            v-model="draft.underlying"
            class="focus-visible:ring-ring/50 h-9 rounded-md border bg-background px-2.5 text-sm uppercase focus-visible:ring-2 focus-visible:outline-none"
            placeholder="NBIS"
          >
        </label>
        <label class="flex w-28 flex-col gap-1">
          <span class="text-muted-foreground text-xs">杠杆股代码</span>
          <input
            v-model="draft.leveraged"
            class="focus-visible:ring-ring/50 h-9 rounded-md border bg-background px-2.5 text-sm uppercase focus-visible:ring-2 focus-visible:outline-none"
            placeholder="NEBX"
          >
        </label>
        <NumberField v-model="draft.leverage" label="倍数" :step="0.5" class="w-20" />
        <label class="flex min-w-32 flex-1 flex-col gap-1">
          <span class="text-muted-foreground text-xs">备注（可空）</span>
          <input
            v-model="draft.label"
            class="focus-visible:ring-ring/50 h-9 rounded-md border bg-background px-2.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
            placeholder="Nebius 2x"
          >
        </label>
        <Button @click="submitDraft">
          <PlusIcon />添加
        </Button>
      </div>

      <p
        v-if="message"
        class="border-b px-4 py-2 text-xs"
        :class="messageTone === 'ok' ? 'text-emerald-600 dark:text-emerald-500' : 'text-destructive'"
      >
        {{ message }}
      </p>

      <!-- 列表 -->
      <div class="flex-1 overflow-y-auto">
        <table class="w-full text-sm">
          <thead class="bg-background sticky top-0 z-10">
            <tr class="text-muted-foreground border-b text-xs">
              <th class="w-64 px-4 py-2 text-left font-medium">配对（可直接改代码）</th>
              <th class="w-24 px-2 py-2 text-left font-medium">倍数</th>
              <th class="px-2 py-2 text-left font-medium">验证结果</th>
              <th class="w-32 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="pair in sorted" :key="pair.id" class="border-b last:border-b-0">
              <td class="px-4 py-2">
                <div class="flex items-center gap-1.5">
                  <input
                    :value="pair.underlying"
                    class="focus-visible:ring-ring/50 h-8 w-20 rounded-md border bg-background px-2 text-sm font-medium uppercase focus-visible:ring-2 focus-visible:outline-none"
                    @change="onCodeChange(pair, 'underlying', $event)"
                  >
                  <span class="text-muted-foreground">→</span>
                  <input
                    :value="pair.leveraged"
                    class="focus-visible:ring-ring/50 h-8 w-20 rounded-md border bg-background px-2 text-sm font-medium uppercase focus-visible:ring-2 focus-visible:outline-none"
                    @change="onCodeChange(pair, 'leveraged', $event)"
                  >
                  <Badge v-if="pair.builtin" variant="muted">内置</Badge>
                  <Badge v-if="mismatched(pair)" variant="warn">倍数存疑</Badge>
                </div>
                <input
                  :value="pair.label ?? ''"
                  placeholder="备注"
                  class="text-muted-foreground focus-visible:text-foreground mt-1 h-6 w-full border-none bg-transparent px-0 text-xs focus-visible:outline-none"
                  @change="onLabelChange(pair, $event)"
                >
              </td>
              <td class="px-2 py-2">
                <NumberField
                  :model-value="pair.leverage"
                  :step="0.5"
                  input-class="h-8"
                  @update:model-value="onLeverageChange(pair, $event)"
                />
              </td>
              <td class="px-2 py-2 text-xs">
                <span
                  v-if="verified[pair.id]"
                  :class="{
                    'text-muted-foreground': verified[pair.id].status === 'loading',
                    'text-destructive': verified[pair.id].status === 'error',
                  }"
                  class="flex items-center gap-1"
                >
                  <LoaderCircleIcon
                    v-if="verified[pair.id].status === 'loading'"
                    class="size-3 animate-spin"
                  />
                  <CheckIcon
                    v-else-if="verified[pair.id].status === 'ok'"
                    class="size-3 text-emerald-600 dark:text-emerald-500"
                  />
                  {{ verified[pair.id].text }}
                </span>
                <span v-else class="text-muted-foreground">未验证</span>
              </td>
              <td class="px-2 py-2">
                <div class="flex items-center justify-end gap-1">
                  <Button
                    v-if="mismatched(pair)"
                    variant="outline"
                    size="sm"
                    title="用实测倍数覆盖配置值"
                    @click="applyMeasured(pair)"
                  >
                    采用实测
                  </Button>
                  <Button variant="ghost" size="sm" @click="verify(pair)">验证</Button>
                  <Button variant="ghost" size="icon" class="size-7" @click="removePair(pair.id)">
                    <Trash2Icon class="text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </td>
            </tr>
            <tr v-if="sorted.length === 0">
              <td colspan="4" class="text-muted-foreground px-4 py-10 text-center">
                一组配对都没有，上面添加一组，或点右下角补回内置表
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer class="flex items-center justify-between border-t px-4 py-2.5">
        <span class="text-muted-foreground text-xs">共 {{ sorted.length }} 组</span>
        <div class="flex gap-2">
          <Button variant="outline" size="sm" @click="doRestore">补回内置配对</Button>
          <Button size="sm" @click="emit('update:open', false)">完成</Button>
        </div>
      </footer>
    </div>
  </div>
</template>
