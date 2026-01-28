// plugins/data-providers/GarminProvider/client/GarminSyncManager.ts
import { getTokens, getSyncState, updateSyncState } from './storage'
import { adaptGarminSummary, adaptGarminDetails } from './adapter'
import { getActivityService } from '@/services/ActivityService'
import pluginEnv from './env'

const baseURL = pluginEnv.apiUrl

// Event emitter for sync completion notifications
export const syncEmitter = new EventTarget()

export interface SyncCompleteEvent {
  success: boolean
  count: number
  error?: string
}

export interface SyncProgressEvent {
  type: 'started' | 'progress'
  month?: string
  completed?: number
  total?: number
}

/**
 * GarminSyncManager handles:
 * - Initial import of historical data (up to 6 months, in 30-day chunks)
 * - Daily refresh (last 7 days)
 * - State persistence to avoid duplicate imports
 */
export class GarminSyncManager {
  private static instance: GarminSyncManager | null = null
  private isRunning = false

  static getInstance(): GarminSyncManager {
    if (!GarminSyncManager.instance) {
      GarminSyncManager.instance = new GarminSyncManager()
    }
    return GarminSyncManager.instance
  }

  /**
   * Start initial import in background (non-blocking)
   * Emits 'sync-complete' event when done
   */
  async startInitialImportAsync(): Promise<void> {
    // Don't start if already running (atomic check)
    if (this.isRunning) {
      console.log('[GarminSync] Import already running, skipping')
      return
    }

    // Set running flag BEFORE async operations to prevent race conditions
    this.isRunning = true

    const state = await getSyncState()

    // Reset stale "syncing" state (browser was closed during previous import)
    if (state.status === 'syncing') {
      console.log('[GarminSync] Detected stale sync state, resetting to idle')
      await updateSyncState({ status: 'idle' })
    }

    if (state.initialImportDone) {
      console.log('[GarminSync] Initial import already done, skipping')
      this.isRunning = false
      return
    }

    // Run in background (don't await)
    this.runInitialImport()
      .catch(err => {
        console.error('[GarminSync] Background import failed:', err)
      })
      .finally(() => {
        this.isRunning = false
      })
  }

  /**
   * Internal: Run the actual import (called async)
   * Note: isRunning flag is managed by startInitialImportAsync()
   */
  private async runInitialImport(): Promise<void> {
    let totalCount = 0
    const errors: string[] = []

    try {
      await updateSyncState({ status: 'syncing', lastError: null })

      // Emit sync-started event for UI update
      syncEmitter.dispatchEvent(new CustomEvent<SyncProgressEvent>('sync-progress', {
        detail: { type: 'started' }
      }))

      const months = this.getLast6Months()
      const state = await getSyncState()

      // Months fully done (backfill asked AND synced)
      const fullyDone = state.backfillSyncedMonths
      // Months where backfill was asked but not yet synced (browser closed mid-import)
      const pendingSync = state.backfillAskedMonths.filter(m => !state.backfillSyncedMonths.includes(m))
      // Months not yet started
      const notStarted = months.filter(m => !state.backfillAskedMonths.includes(m))

      console.log(`[GarminSync] Status: ${fullyDone.length} done, ${pendingSync.length} pending sync, ${notStarted.length} not started`)

      const totalMonths = pendingSync.length + notStarted.length
      let completedMonths = 0

      // First: sync pending months (backfill already asked, just need to fetch)
      for (const month of pendingSync) {
        console.log(`[GarminSync] ${month} - Resuming (backfill already asked)...`)

        // Emit progress event
        syncEmitter.dispatchEvent(new CustomEvent<SyncProgressEvent>('sync-progress', {
          detail: { type: 'progress', month, completed: completedMonths, total: totalMonths }
        }))

        try {
          const { start, end } = this.getMonthRange(month)

          // Fetch with backfill=1 to retrieve data (standard API limited to 24h)
          console.log(`[GarminSync] ${month} - Fetching activities...`)
          const count = await this.fetchAndSaveActivities(start, end, true) // useBackfill=true
          totalCount += count

          // Only mark as synced if we got activities (otherwise backfill might not be ready)
          if (count > 0) {
            const currentState = await getSyncState()
            await updateSyncState({
              backfillSyncedMonths: [...currentState.backfillSyncedMonths, month]
            })
            console.log(`[GarminSync] ${month} done: ${count} activities`)
          } else {
            console.log(`[GarminSync] ${month} returned 0 activities, will retry later`)
          }

          await this.sleep(15000) // 15s between months
        } catch (err: any) {
          console.error(`[GarminSync] Error syncing ${month}:`, err)
          errors.push(`${month}: ${err.message || 'Unknown error'}`)
        }
        completedMonths++
      }

      // Then: process new months (backfill=1 both triggers webhooks AND returns data)
      for (const month of notStarted) {
        console.log(`[GarminSync] Importing ${month}...`)

        // Emit progress event
        syncEmitter.dispatchEvent(new CustomEvent<SyncProgressEvent>('sync-progress', {
          detail: { type: 'progress', month, completed: completedMonths, total: totalMonths }
        }))

        try {
          const { start, end } = this.getMonthRange(month)

          // Mark backfill as asked BEFORE the request (in case of crash)
          let currentState = await getSyncState()
          await updateSyncState({
            backfillAskedMonths: [...currentState.backfillAskedMonths, month]
          })

          // Single call with backfill=1: triggers webhooks AND returns available data
          console.log(`[GarminSync] ${month} - Fetching with backfill...`)
          const count = await this.fetchAndSaveActivities(start, end, true)
          totalCount += count

          // Only mark as synced if we got activities (otherwise backfill might not be ready)
          if (count > 0) {
            currentState = await getSyncState()
            await updateSyncState({
              backfillSyncedMonths: [...currentState.backfillSyncedMonths, month]
            })
            console.log(`[GarminSync] ${month} done: ${count} activities`)
          } else {
            console.log(`[GarminSync] ${month} returned 0 activities, will retry later`)
          }

          // Longer delay between chunks to respect Garmin API rate limits (100 req/min)
          await this.sleep(15000) // 15 seconds between months
        } catch (err: any) {
          console.error(`[GarminSync] Error importing ${month}:`, err)
          errors.push(`${month}: ${err.message || 'Unknown error'}`)
          // Continue with next month instead of failing completely
        }
        completedMonths++
      }

      // Check if all months are fully synced
      const finalState = await getSyncState()
      const allMonthsSynced = months.every(m => finalState.backfillSyncedMonths.includes(m))

      // Mark initial import as complete only if ALL months are synced
      await updateSyncState({
        status: errors.length > 0 ? 'error' : 'idle',
        initialImportDone: allMonthsSynced,
        lastSyncDate: Date.now(),
        lastError: errors.length > 0 ? errors.join('; ') : null
      })

      if (!allMonthsSynced) {
        const missingSynced = months.filter(m => !finalState.backfillSyncedMonths.includes(m))
        console.log(`[GarminSync] Not all months synced yet. Missing: ${missingSynced.join(', ')}`)
      }

      // Emit completion event for toast notification
      syncEmitter.dispatchEvent(new CustomEvent<SyncCompleteEvent>('sync-complete', {
        detail: {
          success: errors.length === 0,
          count: totalCount,
          error: errors.length > 0 ? `Erreurs sur ${errors.length} mois` : undefined
        }
      }))

      console.log(`[GarminSync] Initial import complete: ${totalCount} activities total`)

    } catch (err: any) {
      await updateSyncState({
        status: 'error',
        lastError: err.message || 'Unknown error'
      })

      // Emit error event for toast notification
      syncEmitter.dispatchEvent(new CustomEvent<SyncCompleteEvent>('sync-complete', {
        detail: { success: false, count: 0, error: err.message }
      }))

      console.error('[GarminSync] Initial import failed:', err)
    }
    // Note: isRunning flag is reset by startInitialImportAsync() finally block
  }

  /**
   * Daily refresh: fetch last 7 days
   * Called by DataProviderService.triggerRefresh() via plugin.refreshData()
   */
  async dailyRefresh(): Promise<number> {
    const tokens = await getTokens()
    if (!tokens) {
      console.warn('[GarminSync] No tokens, skipping daily refresh')
      return 0
    }

    console.log('[GarminSync] Daily refresh: fetching last 7 days')

    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 7)

    const count = await this.fetchAndSaveActivities(start, end, false)

    await updateSyncState({ lastSyncDate: Date.now() })

    console.log(`[GarminSync] Daily refresh complete: ${count} activities`)
    return count
  }

  /**
   * Fetch activities from Garmin API and save to IndexedDB
   * Includes retry logic with exponential backoff for rate limit errors
   * Handles "duplicate backfill" by fetching with the backfill timestamp
   */
  private async fetchAndSaveActivities(
    startDate: Date,
    endDate: Date,
    useBackfill: boolean,
    retryCount = 0
  ): Promise<number> {
    const MAX_RETRIES = 3
    const tokens = await getTokens()
    if (!tokens) throw new Error('No Garmin tokens')

    const activityService = await getActivityService()

    const startTime = startDate.toISOString()
    const endTime = endDate.toISOString()

    let url = `${baseURL}/activities/fetch?oauth_token=${tokens.accessToken}&oauth_token_secret=${tokens.accessTokenSecret}&start_time=${startTime}&end_time=${endTime}&detail=1`

    if (useBackfill) {
      url += '&backfill=1'
    }

    const res = await fetch(url)

    // Handle rate limit errors with retry
    if (res.status === 429 || res.status === 503) {
      if (retryCount < MAX_RETRIES) {
        const backoffMs = Math.pow(2, retryCount + 1) * 30000 // 60s, 120s, 240s
        console.warn(`[GarminSync] Rate limit hit, retrying in ${backoffMs / 1000}s (attempt ${retryCount + 1}/${MAX_RETRIES})`)
        await this.sleep(backoffMs)
        return this.fetchAndSaveActivities(startDate, endDate, useBackfill, retryCount + 1)
      }
    }

    if (!res.ok) {
      const errorBody = await res.text()

      // Handle "duplicate backfill" error - need to fetch using the backfill timestamp
      const duplicateMatch = errorBody.match(/duplicate backfill processed at (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/)
      if (duplicateMatch) {
        const backfillTimestamp = duplicateMatch[1]
        console.log(`[GarminSync] Duplicate backfill detected, fetching with timestamp: ${backfillTimestamp}`)
        return this.fetchWithBackfillTimestamp(backfillTimestamp)
      }

      // Check for rate limit in response body
      if (errorBody.includes('Rate limit') || errorBody.includes('Too many request')) {
        if (retryCount < MAX_RETRIES) {
          const backoffMs = Math.pow(2, retryCount + 1) * 30000 // 60s, 120s, 240s
          console.warn(`[GarminSync] Rate limit in response, retrying in ${backoffMs / 1000}s (attempt ${retryCount + 1}/${MAX_RETRIES})`)
          await this.sleep(backoffMs)
          return this.fetchAndSaveActivities(startDate, endDate, useBackfill, retryCount + 1)
        }
      }
      throw new Error(`Garmin API error: ${res.status} - ${errorBody.substring(0, 200)}`)
    }

    const raw = await res.json()

    if (!Array.isArray(raw) || raw.length === 0) {
      return 0
    }

    const summaries = raw.map(adaptGarminSummary)
    const details = raw.map(adaptGarminDetails)

    // Atomic transaction: both succeed or both fail
    await activityService.saveActivitiesWithDetails(summaries, details)

    return summaries.length
  }

  /**
   * Fetch activities using the backfill timestamp (for duplicate backfill case)
   * Uses a 2-second interval around the timestamp (no backfill flag)
   * Standard fetch is limited to 24h, but 2 seconds is fine
   */
  private async fetchWithBackfillTimestamp(backfillTimestamp: string): Promise<number> {
    const tokens = await getTokens()
    if (!tokens) throw new Error('No Garmin tokens')

    const activityService = await getActivityService()

    // Use a small interval around the backfill timestamp (1 second before to 1 second after)
    const backfillDate = new Date(backfillTimestamp)
    const startTime = new Date(backfillDate.getTime() - 1000).toISOString()
    const endTime = new Date(backfillDate.getTime() + 1000).toISOString()

    // NO backfill here - we're fetching data from a previous backfill using its timestamp
    // The 2-second interval is well under the 24h limit for standard fetch
    const url = `${baseURL}/activities/fetch?oauth_token=${tokens.accessToken}&oauth_token_secret=${tokens.accessTokenSecret}&start_time=${startTime}&end_time=${endTime}&detail=1`

    console.log(`[GarminSync] Fetching with backfill timestamp interval: ${startTime} to ${endTime}`)

    const res = await fetch(url)

    if (!res.ok) {
      const errorBody = await res.text()
      throw new Error(`Garmin API error (backfill fetch): ${res.status} - ${errorBody.substring(0, 200)}`)
    }

    const raw = await res.json()

    if (!Array.isArray(raw) || raw.length === 0) {
      console.log('[GarminSync] No activities returned from backfill timestamp fetch')
      return 0
    }

    const summaries = raw.map(adaptGarminSummary)
    const details = raw.map(adaptGarminDetails)

    // Atomic transaction: both succeed or both fail
    await activityService.saveActivitiesWithDetails(summaries, details)

    console.log(`[GarminSync] Fetched ${summaries.length} activities from backfill timestamp`)
    return summaries.length
  }

  /**
   * Get array of last 6 months in format ['2025-01', '2025-02', ...]
   */
  private getLast6Months(): string[] {
    const months: string[] = []
    const now = new Date()

    for (let i = 0; i < 6; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      months.push(month)
    }

    return months.reverse() // Oldest first
  }

  /**
   * Get start and end dates for a month string like '2025-01'
   * Uses UTC to avoid timezone boundary issues
   */
  private getMonthRange(month: string): { start: Date; end: Date } {
    const [year, monthNum] = month.split('-').map(Number)

    // Use UTC to avoid timezone issues when converting to ISO string
    const start = new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0, 0))
    const end = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999)) // Last day of month

    return { start, end }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Export singleton getter
export function getGarminSyncManager(): GarminSyncManager {
  return GarminSyncManager.getInstance()
}
