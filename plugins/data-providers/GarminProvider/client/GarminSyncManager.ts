// plugins/data-providers/GarminProvider/client/GarminSyncManager.ts
import { getTokens, getSyncState, updateSyncState, getGarminUserId } from './storage'
import { adaptGarminSummary, adaptGarminDetails } from './adapter'
import { getValidAccessToken } from './garminAuth'
import { getPluginContext } from '@/services/PluginContextFactory'
import pluginEnv from './env'

const proxyUrl = pluginEnv.proxyUrl

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
      syncEmitter.dispatchEvent(
        new CustomEvent<SyncProgressEvent>('sync-progress', {
          detail: { type: 'started' }
        })
      )

      const months = this.getLast6Months()
      const state = await getSyncState()

      // Months fully done (backfill asked AND synced)
      const fullyDone = state.backfillSyncedMonths
      // Months where backfill was asked but not yet synced (browser closed mid-import)
      const pendingSync = state.backfillAskedMonths.filter(
        m => !state.backfillSyncedMonths.includes(m)
      )
      // Months not yet started
      const notStarted = months.filter(m => !state.backfillAskedMonths.includes(m))

      console.log(
        `[GarminSync] Status: ${fullyDone.length} done, ${pendingSync.length} pending sync, ${notStarted.length} not started`
      )

      const totalMonths = pendingSync.length + notStarted.length
      let completedMonths = 0

      // First: sync pending months (backfill already asked, just need to fetch)
      for (const month of pendingSync) {
        console.log(`[GarminSync] ${month} - Resuming (backfill already asked)...`)

        // Emit progress event
        syncEmitter.dispatchEvent(
          new CustomEvent<SyncProgressEvent>('sync-progress', {
            detail: { type: 'progress', month, completed: completedMonths, total: totalMonths }
          })
        )

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
        } catch (err: unknown) {
          console.error(`[GarminSync] Error syncing ${month}:`, err)
          errors.push(`${month}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        }
        completedMonths++
      }

      // Then: process new months (backfill=1 both triggers webhooks AND returns data)
      for (const month of notStarted) {
        console.log(`[GarminSync] Importing ${month}...`)

        // Emit progress event
        syncEmitter.dispatchEvent(
          new CustomEvent<SyncProgressEvent>('sync-progress', {
            detail: { type: 'progress', month, completed: completedMonths, total: totalMonths }
          })
        )

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
        } catch (err: unknown) {
          console.error(`[GarminSync] Error importing ${month}:`, err)
          errors.push(`${month}: ${err instanceof Error ? err.message : 'Unknown error'}`)
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
      syncEmitter.dispatchEvent(
        new CustomEvent<SyncCompleteEvent>('sync-complete', {
          detail: {
            success: errors.length === 0,
            count: totalCount,
            error: errors.length > 0 ? `Errors on ${errors.length} months` : undefined
          }
        })
      )

      console.log(`[GarminSync] Initial import complete: ${totalCount} activities total`)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      await updateSyncState({
        status: 'error',
        lastError: errorMessage
      })

      // Emit error event for toast notification
      syncEmitter.dispatchEvent(
        new CustomEvent<SyncCompleteEvent>('sync-complete', {
          detail: { success: false, count: 0, error: errorMessage }
        })
      )

      console.error('[GarminSync] Initial import failed:', err)
    }
    // Note: isRunning flag is reset by startInitialImportAsync() finally block
  }

  /**
   * Daily refresh: fetch last 7 days (one day at a time due to API 24h limit)
   * Called by DataProviderService.triggerRefresh() via plugin.refreshData()
   */
  async dailyRefresh(): Promise<number> {
    const tokens = await getTokens()
    if (!tokens) {
      console.warn('[GarminSync] No tokens, skipping daily refresh')
      return 0
    }

    // Validate token is still valid (will auto-refresh if needed)
    await getValidAccessToken()

    console.log('[GarminSync] Daily refresh: fetching last 7 days (day by day)')

    let totalCount = 0
    const now = new Date()

    // Fetch each day separately (Garmin API has 24h max range)
    for (let daysAgo = 0; daysAgo < 7; daysAgo++) {
      const end = new Date(now)
      end.setDate(end.getDate() - daysAgo)

      const start = new Date(end)
      start.setDate(start.getDate() - 1)

      try {
        const count = await this.fetchAndSaveActivities(start, end, false)
        totalCount += count
        if (count > 0) {
          console.log(`[GarminSync] Day ${daysAgo + 1}/7: ${count} activities`)
        }
      } catch (err: unknown) {
        // Log but continue with other days
        console.warn(
          `[GarminSync] Day ${daysAgo + 1}/7 failed:`,
          err instanceof Error ? err.message : err
        )
      }
    }

    await updateSyncState({ lastSyncDate: Date.now() })

    console.log(`[GarminSync] Daily refresh complete: ${totalCount} activities`)
    return totalCount
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
    const accessToken = await getValidAccessToken()
    const ctx = await getPluginContext()

    const startSeconds = Math.floor(startDate.getTime() / 1000)
    const endSeconds = Math.floor(endDate.getTime() / 1000)

    const endpoint = useBackfill ? 'backfill/activityDetails' : 'activityDetails'
    const timeParams = useBackfill
      ? `summaryStartTimeInSeconds=${startSeconds}&summaryEndTimeInSeconds=${endSeconds}`
      : `uploadStartTimeInSeconds=${startSeconds}&uploadEndTimeInSeconds=${endSeconds}`

    const url = `${proxyUrl}/api/${endpoint}?${timeParams}`

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    // Handle rate limit errors with retry
    if (res.status === 429 || res.status === 503) {
      if (retryCount < MAX_RETRIES) {
        const backoffMs = Math.pow(2, retryCount + 1) * 30000 // 60s, 120s, 240s
        console.warn(
          `[GarminSync] Rate limit hit, retrying in ${backoffMs / 1000}s (attempt ${retryCount + 1}/${MAX_RETRIES})`
        )
        await this.sleep(backoffMs)
        return this.fetchAndSaveActivities(startDate, endDate, useBackfill, retryCount + 1)
      }
    }

    if (!res.ok) {
      const errorBody = await res.text()

      // 409 = duplicate backfill already processed, poll callbacks from ping notifications
      if (res.status === 409 && errorBody.includes('duplicate backfill')) {
        console.log('[GarminSync] Backfill already done, polling callbacks')
        return this.pollAndConsumeCallbacks()
      }

      // Check for rate limit in response body
      if (errorBody.includes('Rate limit') || errorBody.includes('Too many request')) {
        if (retryCount < MAX_RETRIES) {
          const backoffMs = Math.pow(2, retryCount + 1) * 30000 // 60s, 120s, 240s
          console.warn(
            `[GarminSync] Rate limit in response, retrying in ${backoffMs / 1000}s (attempt ${retryCount + 1}/${MAX_RETRIES})`
          )
          await this.sleep(backoffMs)
          return this.fetchAndSaveActivities(startDate, endDate, useBackfill, retryCount + 1)
        }
      }
      throw new Error(`Garmin API error: ${res.status} - ${errorBody.substring(0, 200)}`)
    }

    const text = await res.text()
    if (!text || text.trim() === '') return 0

    const raw = JSON.parse(text)

    if (!Array.isArray(raw) || raw.length === 0) {
      return 0
    }

    const summaries = raw.map(adaptGarminSummary)
    const details = raw.map(adaptGarminDetails)

    // Atomic transaction: both succeed or both fail
    await ctx.activity.saveActivitiesWithDetails(summaries, details)

    return summaries.length
  }

  /**
   * Poll Firebase for pending Garmin ping callbacks, fetch data via proxy, save to IndexedDB.
   * Retries up to 3 times with 5s delay if no callbacks found yet (backfill async).
   */
  private async pollAndConsumeCallbacks(maxRetries = 3): Promise<number> {
    const userId = await getGarminUserId()
    if (!userId) {
      console.warn('[GarminSync] No Garmin userId stored, cannot poll callbacks')
      return 0
    }

    const ctx = await getPluginContext()
    let totalCount = 0

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Fetch pending push data for this user
      const res = await fetch(`${proxyUrl}/callbacks/${userId}`)
      if (!res.ok) {
        console.warn(`[GarminSync] Failed to fetch push data: ${res.status}`)
        return totalCount
      }

      const entries = await res.json()
      if (!Array.isArray(entries) || entries.length === 0) {
        if (attempt < maxRetries - 1) {
          console.log(`[GarminSync] No push data yet, retry ${attempt + 1}/${maxRetries} in 5s`)
          await this.sleep(5000)
          continue
        }
        console.log('[GarminSync] No push data available after retries')
        return totalCount
      }

      console.log(`[GarminSync] Found ${entries.length} push entries to process`)
      const consumedIds: string[] = []

      for (const entry of entries) {
        try {
          // Push data is stored directly in entry.data (Garmin activity object)
          const raw = entry.data
          if (!raw) continue

          // Wrap in array for adapter (expects array)
          const items = Array.isArray(raw) ? raw : [raw]
          const summaries = items.map(adaptGarminSummary)
          const details = items.map(adaptGarminDetails)
          await ctx.activity.saveActivitiesWithDetails(summaries, details)
          totalCount += summaries.length
          console.log(`[GarminSync] Push ${entry.summaryType}: ${summaries.length} activities`)
          consumedIds.push(entry.id)
        } catch (err) {
          console.warn('[GarminSync] Error processing push entry:', err)
        }
      }

      // Clean up consumed entries
      if (consumedIds.length > 0) {
        await fetch(`${proxyUrl}/callbacks/${userId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: consumedIds })
        })
      }

      break // got data, done
    }

    return totalCount
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
