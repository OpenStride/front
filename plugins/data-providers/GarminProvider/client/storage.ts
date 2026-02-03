// plugins/data-providers/GarminProvider/client/storage.ts
import { getIndexedDBService } from '@/services/IndexedDBService'

const PLUGIN_PREFIX = 'plugin:garmin'

/**
 * Get plugin-specific data from IndexedDB
 */
export async function getPluginData<T>(key: string): Promise<T | null> {
  const db = await getIndexedDBService()
  return db.getData(`${PLUGIN_PREFIX}:${key}`)
}

/**
 * Save plugin-specific data to IndexedDB
 */
export async function setPluginData<T>(key: string, value: T): Promise<void> {
  const db = await getIndexedDBService()
  await db.saveData(`${PLUGIN_PREFIX}:${key}`, value)
}

/**
 * Delete plugin-specific data from IndexedDB
 */
export async function deletePluginData(key: string): Promise<void> {
  const db = await getIndexedDBService()
  await db.deleteData(`${PLUGIN_PREFIX}:${key}`)
}

// ============================================================================
// Type definitions for Garmin plugin data
// ============================================================================

export interface GarminTokens {
  accessToken: string
  accessTokenSecret: string
}

export interface GarminSyncState {
  status: 'idle' | 'syncing' | 'error'
  initialImportDone: boolean
  backfillAskedMonths: string[]   // Months where backfill was requested (webhooks triggered)
  backfillSyncedMonths: string[]  // Months where data was actually fetched and saved
  lastSyncDate: number | null     // timestamp ms
  lastError: string | null
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
  return state ?? {
    status: 'idle',
    initialImportDone: false,
    backfillAskedMonths: [],
    backfillSyncedMonths: [],
    lastSyncDate: null,
    lastError: null
  }
}

export async function updateSyncState(partial: Partial<GarminSyncState>): Promise<void> {
  const current = await getSyncState()
  return setPluginData('sync_state', { ...current, ...partial })
}
