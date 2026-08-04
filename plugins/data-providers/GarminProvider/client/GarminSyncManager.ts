// plugins/data-providers/GarminProvider/client/GarminSyncManager.ts
import { getTokens, getSyncState, updateSyncState } from './storage'
import {
  adaptGarminSummary,
  adaptGarminDetails,
  isActivityPayload,
  mergeGarminActivity,
  mergeGarminDetails
} from './adapter'
import { getValidAccessToken } from './garminAuth'
import { getPluginContext } from '@/services/PluginContextFactory'
import type { Activity, ActivityDetails } from '@/types/activity'
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
   * Daily refresh: poll Firestore for any push data from Garmin.
   * Garmin pushes new activities automatically when the user syncs their watch.
   * Called by DataProviderService.triggerRefresh() via plugin.refreshData()
   */
  async dailyRefresh(): Promise<number> {
    const tokens = await getTokens()
    if (!tokens) {
      console.warn('[GarminSync] No tokens, skipping daily refresh')
      return 0
    }

    console.log('[GarminSync] Daily refresh: polling for push data')

    // Ids, not saves: one outing is pushed twice (summary, then details), and
    // it is also the one the pull below completes. Counting rows would report
    // three activities for one run.
    const seen = new Set<string>()
    await this.pollAndConsumeCallbacks(1, seen) // single attempt, no retry
    await this.fetchRecentDetails(seen)
    await updateSyncState({ lastSyncDate: Date.now() })

    console.log(`[GarminSync] Daily refresh complete: ${seen.size} activities`)
    return seen.size
  }

  /**
   * Pull the details for everything uploaded in the last 24 h.
   *
   * The push buffer alone is not enough to answer a refresh: Garmin sends the
   * activity *summary* as soon as the watch syncs, but the *details* — the
   * samples the map and the graphs are drawn from — only once it has processed
   * the FIT file, minutes later. Refreshing in between used to leave the card
   * on the feed with nothing in it until the next refresh.
   *
   * Best effort: the push data has already been saved when this runs, so a
   * failure here must not fail the refresh.
   */
  private async fetchRecentDetails(collector: Set<string>): Promise<void> {
    const end = new Date()
    // Garmin caps the pull endpoints at a 24 h window.
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)

    try {
      await this.fetchAndSaveActivities(start, end, false, 0, collector)
    } catch (err) {
      console.warn('[GarminSync] Could not pull recent activity details:', err)
    }
  }

  /**
   * Fetch recent days via backfill + poll push data.
   * Triggers a backfill for the given range, waits for Garmin to push, then polls.
   */
  async fetchRecentDays(days: number): Promise<number> {
    const tokens = await getTokens()
    if (!tokens) return 0

    const accessToken = await getValidAccessToken()
    const now = new Date()
    const start = new Date(now)
    start.setDate(start.getDate() - days)

    const startSeconds = Math.floor(start.getTime() / 1000)
    const endSeconds = Math.floor(now.getTime() / 1000)

    console.log(`[GarminSync] Fetching last ${days} days via backfill`)

    // Trigger backfill for the date range (best effort, don't block on error)
    try {
      const url = `${proxyUrl}/api/backfill/activityDetails?summaryStartTimeInSeconds=${startSeconds}&summaryEndTimeInSeconds=${endSeconds}`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      })

      if (res.status === 202) {
        console.log('[GarminSync] Backfill accepted, waiting for push...')
      } else if (res.status === 409) {
        console.log('[GarminSync] Backfill already done, checking for push data...')
      } else {
        const text = await res.text()
        console.warn(`[GarminSync] Backfill returned ${res.status}: ${text.substring(0, 200)}`)
      }
    } catch (err) {
      console.warn('[GarminSync] Backfill request failed, checking for existing push data:', err)
    }

    // Poll for push data (whether backfill just triggered or was already done)
    console.log('[GarminSync] Polling for push data...')
    await this.sleep(5000)
    const count = await this.pollAndConsumeCallbacks(5) // 5 retries, 5s between each

    await updateSyncState({ lastSyncDate: Date.now() })
    console.log(`[GarminSync] Fetched ${count} activities for last ${days} days`)
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
    retryCount = 0,
    /** Ids saved so far, when the caller counts distinct activities. */
    collector?: Set<string>
  ): Promise<number> {
    const MAX_RETRIES = 3
    const accessToken = await getValidAccessToken()

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
        return this.fetchAndSaveActivities(
          startDate,
          endDate,
          useBackfill,
          retryCount + 1,
          collector
        )
      }
    }

    if (!res.ok) {
      const errorBody = await res.text()

      // 409 = duplicate backfill already processed, poll callbacks from ping notifications
      if (res.status === 409 && errorBody.includes('duplicate backfill')) {
        console.log('[GarminSync] Backfill already done, polling callbacks')
        return this.pollAndConsumeCallbacks(3, collector)
      }

      // 403 = user didn't grant HISTORICAL_DATA_EXPORT — skip this range gracefully.
      if (useBackfill && res.status === 403) {
        console.warn(
          '[GarminSync] Backfill forbidden (403) — HISTORICAL_DATA_EXPORT permission not granted; skipping range'
        )
        return 0
      }

      // 400 = range outside the user's available/consented data window
      // (e.g. before account data start). Nothing to fetch — skip, don't fail.
      if (useBackfill && res.status === 400) {
        console.warn(
          `[GarminSync] Backfill rejected (400) for this range, skipping: ${errorBody.substring(0, 120)}`
        )
        return 0
      }

      // Check for rate limit in response body
      if (errorBody.includes('Rate limit') || errorBody.includes('Too many request')) {
        if (retryCount < MAX_RETRIES) {
          const backoffMs = Math.pow(2, retryCount + 1) * 30000 // 60s, 120s, 240s
          console.warn(
            `[GarminSync] Rate limit in response, retrying in ${backoffMs / 1000}s (attempt ${retryCount + 1}/${MAX_RETRIES})`
          )
          await this.sleep(backoffMs)
          return this.fetchAndSaveActivities(
            startDate,
            endDate,
            useBackfill,
            retryCount + 1,
            collector
          )
        }
      }
      throw new Error(`Garmin API error: ${res.status} - ${errorBody.substring(0, 200)}`)
    }

    const text = await res.text()

    // Backfill is asynchronous: Garmin returns 202 with an empty body and pushes
    // the data later to our /ping endpoint. There is no inline data to parse — we
    // must poll the push bucket to consume what Garmin has delivered so far.
    if (useBackfill && (res.status === 202 || !text || text.trim() === '')) {
      console.log('[GarminSync] Backfill accepted (async), polling push data...')
      await this.sleep(5000)
      return this.pollAndConsumeCallbacks(5, collector)
    }

    if (!text || text.trim() === '') return 0

    const raw = JSON.parse(text)

    if (!Array.isArray(raw) || raw.length === 0) {
      // Backfill may also acknowledge with an empty array; data still comes via push.
      if (useBackfill) return this.pollAndConsumeCallbacks(5, collector)
      return 0
    }

    const saved = await this.saveRawActivities(raw, collector)

    return saved.length
  }

  /**
   * Adapt raw Garmin payloads and fold them into what is already stored.
   *
   * Garmin sends the same outing twice — an activity summary as soon as the
   * watch syncs, then the activity details with the samples once the FIT file
   * is processed — and the two can arrive in either order, in either direction
   * of the same batch. Writing them straight through meant whichever landed
   * last won, so a summary push regularly erased a track that was already
   * there: the activity stayed in the feed with an empty map.
   *
   * Returns the ids actually written, so both halves of one outing count once.
   */
  private async saveRawActivities(raw: unknown[], collector?: Set<string>): Promise<string[]> {
    const ctx = await getPluginContext()
    const payloads = raw.filter(isActivityPayload)

    if (payloads.length < raw.length) {
      console.warn(
        `[GarminSync] Ignoring ${raw.length - payloads.length} payload(s) that are not activities`
      )
    }
    if (payloads.length === 0) return []

    // Collapse a batch that carries both halves of the same activity.
    const byId = new Map<string, { activity: Activity; details: ActivityDetails }>()
    for (const payload of payloads) {
      const activity = adaptGarminSummary(payload)
      const details = adaptGarminDetails(payload)
      const seen = byId.get(activity.id)
      byId.set(activity.id, {
        activity: mergeGarminActivity(seen?.activity, activity),
        details: mergeGarminDetails(seen?.details, details)
      })
    }

    const activities: Activity[] = []
    const detailsList: ActivityDetails[] = []
    for (const [id, entry] of byId) {
      const [storedActivity, storedDetails] = await Promise.all([
        ctx.activity.getActivity(id),
        ctx.activity.getDetails(id)
      ])
      activities.push(mergeGarminActivity(storedActivity, entry.activity))
      detailsList.push(mergeGarminDetails(storedDetails, entry.details))
    }

    // Atomic transaction: both succeed or both fail
    await ctx.activity.saveActivitiesWithDetails(activities, detailsList)

    const ids = [...byId.keys()]
    ids.forEach(id => collector?.add(id))
    return ids
  }

  /**
   * Fetch pending Garmin push data from the buffer and save it to IndexedDB.
   *
   * Access is owner-scoped by the OAuth Bearer token: the proxy derives the userId
   * from the token server-side, so we never send a userId and can only ever receive
   * our own data. Consumed files are deleted immediately via /push/consume.
   *
   * Retries up to `maxRetries` times with a 5s delay when no data is buffered yet
   * (Garmin's backfill push is asynchronous).
   */
  private async pollAndConsumeCallbacks(maxRetries = 3, collector?: Set<string>): Promise<number> {
    // Ids, not entries: Garmin buffers a summary push and a details push for
    // the same outing, and announcing "2 new activities" for one run is wrong.
    const savedIds = collector ?? new Set<string>()
    let waited = 0
    const MAX_DRAIN_BATCHES = 500 // safety cap against an unexpected infinite loop

    for (let i = 0; i < MAX_DRAIN_BATCHES; i++) {
      const accessToken = await getValidAccessToken()

      const res = await fetch(`${proxyUrl}/push`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      })

      if (res.status === 401) {
        console.warn('[GarminSync] Unauthorized when reading push buffer')
        return savedIds.size
      }
      if (!res.ok) {
        console.warn(`[GarminSync] Failed to fetch push data: ${res.status}`)
        return savedIds.size
      }

      const entries = await res.json()
      if (!Array.isArray(entries) || entries.length === 0) {
        // Buffer empty. If we already drained some, we're done.
        if (savedIds.size > 0) break
        // Otherwise wait for Garmin's async backfill push to land.
        if (waited < maxRetries - 1) {
          waited++
          console.log(`[GarminSync] No push data yet, retry ${waited}/${maxRetries} in 5s`)
          await this.sleep(5000)
          continue
        }
        console.log('[GarminSync] No push data available after retries')
        break
      }

      console.log(`[GarminSync] Draining ${entries.length} push entries`)
      const consumedFiles: string[] = []

      for (const entry of entries) {
        try {
          const raw = entry.data
          if (!raw) continue

          // Push data: activity object directly (ownership already enforced server-side)
          const items = Array.isArray(raw) ? raw : [raw]
          await this.saveRawActivities(items, savedIds)

          consumedFiles.push(entry.name)
        } catch (err) {
          console.warn('[GarminSync] Error processing entry:', err)
        }
      }

      // Delete consumed files immediately (owner-scoped, verified server-side),
      // then loop to drain the next capped batch.
      if (consumedFiles.length > 0) {
        await fetch(`${proxyUrl}/push/consume`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({ files: consumedFiles })
        })
      } else {
        // Nothing consumable in a non-empty batch (all errored) — stop to avoid a loop.
        break
      }
    }

    return savedIds.size
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
