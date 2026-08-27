// 行情拉取：全部走 Rust 侧命令（WebView 直连 Yahoo 会被 CORS 拦掉）。
// 带 60 秒内存缓存 + 并发去重，手动点「刷新」走 force 绕过。

import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { DailySeries, PairQuote, SymbolInfo } from '@/types'
import { isTauri } from './useStore'

const CACHE_TTL_MS = 60 * 1000

interface CacheEntry<T> {
  at: number
  value: T
}

const quoteCache = new Map<string, CacheEntry<PairQuote>>()
const seriesCache = new Map<string, CacheEntry<DailySeries[]>>()

/** 同一个 key 正在飞的请求，避免初始化时重复打接口 */
const inflight = new Map<string, Promise<unknown>>()

function fresh<T>(cache: Map<string, CacheEntry<T>>, key: string, force: boolean): T | null {
  if (force)
    return null
  const hit = cache.get(key)
  if (!hit)
    return null
  return Date.now() - hit.at > CACHE_TTL_MS ? null : hit.value
}

function dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key)
  if (existing)
    return existing as Promise<T>

  const promise = run().finally(() => inflight.delete(key))
  inflight.set(key, promise)
  return promise
}

function notAvailable(): Error {
  return new Error('行情功能需要在桌面应用中运行（浏览器里无法直连 Yahoo）')
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const loadingQuote = ref(false)
const loadingSeries = ref(false)
const lastError = ref<string | null>(null)

export function useQuotes() {
  /** 拉配对两端的报价 */
  async function fetchPairQuote(
    underlying: string,
    leveraged: string,
    force = false,
  ): Promise<PairQuote> {
    const key = `quote:${underlying}|${leveraged}`
    const cached = fresh(quoteCache, key, force)
    if (cached)
      return cached

    if (!isTauri)
      throw notAvailable()

    return dedupe(key, async () => {
      loadingQuote.value = true
      lastError.value = null
      try {
        const result = await invoke<PairQuote>('fetch_pair_quote', { underlying, leveraged })
        quoteCache.set(key, { at: Date.now(), value: result })
        return result
      }
      catch (error) {
        lastError.value = toMessage(error)
        throw new Error(lastError.value)
      }
      finally {
        loadingQuote.value = false
      }
    })
  }

  /** 拉日线序列，用于波动率估算和倍数回归 */
  async function fetchSeries(
    symbols: string[],
    range = '6mo',
    force = false,
  ): Promise<DailySeries[]> {
    const key = `series:${symbols.join(',')}|${range}`
    const cached = fresh(seriesCache, key, force)
    if (cached)
      return cached

    if (!isTauri)
      throw notAvailable()

    return dedupe(key, async () => {
      loadingSeries.value = true
      try {
        const result = await invoke<DailySeries[]>('fetch_daily_series', { symbols, range })
        seriesCache.set(key, { at: Date.now(), value: result })
        return result
      }
      catch (error) {
        lastError.value = toMessage(error)
        throw new Error(lastError.value)
      }
      finally {
        loadingSeries.value = false
      }
    })
  }

  /** 校验单个代码 */
  async function resolveSymbol(symbol: string): Promise<SymbolInfo> {
    if (!isTauri)
      throw notAvailable()
    try {
      return await invoke<SymbolInfo>('resolve_symbol', { symbol })
    }
    catch (error) {
      throw new Error(toMessage(error))
    }
  }

  return { fetchPairQuote, fetchSeries, resolveSymbol, loadingQuote, loadingSeries, lastError }
}
