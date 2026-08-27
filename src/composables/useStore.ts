// tauri-plugin-store 的薄封装。
// 浏览器里跑 `pnpm dev`（非 Tauri 环境）时自动回退到 localStorage，
// 这样纯前端调试也能用，不必每次都起完整的桌面壳。

import { load, type Store } from '@tauri-apps/plugin-store'

const STORE_FILE = 'settings.json'
const LOCAL_PREFIX = 'leverage-calc:'

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

let storePromise: Promise<Store> | null = null

function getStore(): Promise<Store> {
  if (!storePromise)
    storePromise = load(STORE_FILE, { autoSave: true })
  return storePromise
}

export async function readSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    if (isTauri) {
      const store = await getStore()
      const value = await store.get<T>(key)
      return value === null || value === undefined ? fallback : value
    }
    const raw = localStorage.getItem(LOCAL_PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  }
  catch (error) {
    console.warn(`[store] 读取 ${key} 失败`, error)
    return fallback
  }
}

export async function writeSetting<T>(key: string, value: T): Promise<void> {
  try {
    if (isTauri) {
      const store = await getStore()
      await store.set(key, value)
      return
    }
    localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value))
  }
  catch (error) {
    console.warn(`[store] 写入 ${key} 失败`, error)
  }
}
