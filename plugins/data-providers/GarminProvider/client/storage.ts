// plugins/data-providers/GarminProvider/client/storage.ts
import { getPluginContext } from '@/services/PluginContextFactory'

const PLUGIN_PREFIX = 'plugin:garmin'

/**
 * Get plugin-specific data from IndexedDB via PluginContext
 */
async function getPluginData<T>(key: string): Promise<T | null> {
  const ctx = await getPluginContext()
  return (await ctx.storage.getData<T>(`${PLUGIN_PREFIX}:${key}`)) ?? null
}

/**
 * Save plugin-specific data to IndexedDB via PluginContext
 */
async function setPluginData<T>(key: string, value: T): Promise<void> {
  const ctx = await getPluginContext()
  await ctx.storage.saveData(`${PLUGIN_PREFIX}:${key}`, value)
}

/**
 * Delete plugin-specific data from IndexedDB via PluginContext
 */
export async function deletePluginData(key: string): Promise<void> {
  const ctx = await getPluginContext()
  await ctx.storage.deleteData(`${PLUGIN_PREFIX}:${key}`)
}

// ============================================================================
// Type definitions for Garmin plugin data
// ============================================================================

export interface GarminTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  refreshTokenExpiresAt: number
}

/**
 * What the last refresh actually brought back.
 *
 * A refresh has two sources — the push buffer Garmin fills on its own schedule,
 * and the 24 h details pull — and when it comes back empty the user has no way
 * to tell which one was silent. That answer used to live in the browser
 * console, which is unreachable on the phone the app is mostly used from.
 */
export interface GarminRefreshReport {
  at: number // timestamp ms
  pushed: number // activities drained from the push buffer
  pulled: number // activities returned by the 24 h details pull
  pullError?: string // why the pull returned nothing, when it failed
}

export interface GarminSyncState {
  status: 'idle' | 'syncing' | 'error'
  initialImportDone: boolean
  backfillAskedMonths: string[] // Months where backfill was requested (webhooks triggered)
  backfillSyncedMonths: string[] // Months where data was actually fetched and saved
  lastSyncDate: number | null // timestamp ms
  lastError: string | null
  lastRefresh?: GarminRefreshReport
}

// ============================================================================
// Typed helpers for Garmin-specific data
// ============================================================================

export async function getTokens(): Promise<GarminTokens | null> {
  return getPluginData<GarminTokens>('tokens')
}

export async function setTokens(tokens: GarminTokens): Promise<void> {
  return setPluginData('tokens', tokens)
}

export async function deleteTokens(): Promise<void> {
  return deletePluginData('tokens')
}

export async function getSyncState(): Promise<GarminSyncState> {
  const state = await getPluginData<GarminSyncState>('sync_state')
  return (
    state ?? {
      status: 'idle',
      initialImportDone: false,
      backfillAskedMonths: [],
      backfillSyncedMonths: [],
      lastSyncDate: null,
      lastError: null
    }
  )
}

export async function updateSyncState(partial: Partial<GarminSyncState>): Promise<void> {
  const current = await getSyncState()
  return setPluginData('sync_state', { ...current, ...partial })
}
