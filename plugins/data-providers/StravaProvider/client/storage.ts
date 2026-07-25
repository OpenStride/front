import { getPluginContext } from '@/services/PluginContextFactory'

const PLUGIN_PREFIX = 'plugin:strava'

export async function getPluginData<T>(key: string): Promise<T | null> {
  const ctx = await getPluginContext()
  return (await ctx.storage.getData<T>(`${PLUGIN_PREFIX}:${key}`)) ?? null
}

export async function setPluginData<T>(key: string, value: T): Promise<void> {
  const ctx = await getPluginContext()
  await ctx.storage.saveData(`${PLUGIN_PREFIX}:${key}`, value)
}

export async function deletePluginData(key: string): Promise<void> {
  const ctx = await getPluginContext()
  await ctx.storage.deleteData(`${PLUGIN_PREFIX}:${key}`)
}

// ============================================================================
// Types
// ============================================================================

export interface StravaTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number // ms
}

export interface StravaSyncState {
  status: 'idle' | 'syncing' | 'error'
  initialImportDone: boolean
  lastActivityDate: number | null // epoch seconds of the newest imported activity
  lastSyncDate: number | null // ms
  lastError: string | null
}

// ============================================================================
// Typed helpers
// ============================================================================

export async function getTokens(): Promise<StravaTokens | null> {
  return getPluginData<StravaTokens>('tokens')
}

export async function setTokens(tokens: StravaTokens): Promise<void> {
  return setPluginData('tokens', tokens)
}

export async function deleteTokens(): Promise<void> {
  return deletePluginData('tokens')
}

export async function getSyncState(): Promise<StravaSyncState> {
  const state = await getPluginData<StravaSyncState>('sync_state')
  return (
    state ?? {
      status: 'idle',
      initialImportDone: false,
      lastActivityDate: null,
      lastSyncDate: null,
      lastError: null
    }
  )
}

export async function updateSyncState(partial: Partial<StravaSyncState>): Promise<void> {
  const current = await getSyncState()
  return setPluginData('sync_state', { ...current, ...partial })
}
