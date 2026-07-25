import { getTokens, getSyncState, updateSyncState } from './storage'
import { getValidAccessToken } from './stravaAuth'
import {
  adaptStravaSummary,
  adaptStravaDetails,
  type StravaActivity,
  type StravaStreams
} from './adapter'
import { getPluginContext } from '@/services/PluginContextFactory'
import pluginEnv from './env'

const proxyUrl = pluginEnv.proxyUrl
const API = `${proxyUrl}/strava/api`

// Streams we pull per activity (key_by_type=true gives us an object per metric).
const STREAM_KEYS = 'time,distance,latlng,altitude,heartrate,cadence,watts,velocity_smooth,temp'

// Strava rate limit is ~100 req / 15 min. We throttle between activities and cap
// how many we pull per run; anything left over is picked up by later refreshes.
const REQUEST_DELAY_MS = 1200
const MAX_ACTIVITIES_PER_RUN = 200
const PER_PAGE = 30

export const syncEmitter = new EventTarget()

export interface SyncCompleteEvent {
  success: boolean
  count: number
  error?: string
}

export interface SyncProgressEvent {
  type: 'started' | 'progress'
  completed?: number
}

export class StravaSyncManager {
  private static instance: StravaSyncManager | null = null
  private isRunning = false

  static getInstance(): StravaSyncManager {
    if (!StravaSyncManager.instance) StravaSyncManager.instance = new StravaSyncManager()
    return StravaSyncManager.instance
  }

  /** Start the initial import in the background (non-blocking). Idempotent. */
  async startInitialImportAsync(): Promise<void> {
    if (this.isRunning) {
      console.log('[StravaSync] Import already running, skipping')
      return
    }
    this.isRunning = true

    const state = await getSyncState()
    if (state.status === 'syncing') await updateSyncState({ status: 'idle' })
    if (state.initialImportDone) {
      this.isRunning = false
      return
    }

    this.runImport(undefined)
      .catch(err => console.error('[StravaSync] Import failed:', err))
      .finally(() => {
        this.isRunning = false
      })
  }

  /** Daily refresh: pull only activities newer than the last import. */
  async dailyRefresh(): Promise<number> {
    const tokens = await getTokens()
    if (!tokens) return 0
    const state = await getSyncState()
    return this.runImport(state.lastActivityDate ?? undefined)
  }

  /**
   * Pull activity summaries (paginated), fetch each activity's streams, adapt and
   * save. `after` (epoch seconds) limits to newer activities for incremental sync.
   */
  private async runImport(after?: number): Promise<number> {
    const ctx = await getPluginContext()
    let totalCount = 0
    let newestSeen = after ?? 0
    const errors: string[] = []

    try {
      await updateSyncState({ status: 'syncing', lastError: null })
      syncEmitter.dispatchEvent(
        new CustomEvent<SyncProgressEvent>('sync-progress', { detail: { type: 'started' } })
      )

      let page = 1
      while (totalCount < MAX_ACTIVITIES_PER_RUN) {
        const list = await this.listActivities(page, after)
        if (list.length === 0) break

        for (const activity of list) {
          try {
            const streams = await this.fetchStreams(activity.id)
            const summary = adaptStravaSummary(activity, streams)
            const details = adaptStravaDetails(activity, streams)
            await ctx.activity.saveActivitiesWithDetails([summary], [details])
            totalCount++
            newestSeen = Math.max(newestSeen, summary.startTime)

            syncEmitter.dispatchEvent(
              new CustomEvent<SyncProgressEvent>('sync-progress', {
                detail: { type: 'progress', completed: totalCount }
              })
            )
            await this.sleep(REQUEST_DELAY_MS)
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Unknown error'
            // Rate-limited: stop gracefully, keep progress, let a later refresh continue.
            if (msg.includes('429')) {
              console.warn('[StravaSync] Rate limited, pausing import (will resume later)')
              throw new Error('RATE_LIMIT')
            }
            errors.push(`${activity.id}: ${msg}`)
          }
        }

        if (list.length < PER_PAGE) break
        page++
      }

      const hitCap = totalCount >= MAX_ACTIVITIES_PER_RUN
      await updateSyncState({
        status: errors.length > 0 ? 'error' : 'idle',
        initialImportDone: !hitCap,
        lastActivityDate: newestSeen || null,
        lastSyncDate: Date.now(),
        lastError: errors.length > 0 ? errors.slice(0, 3).join('; ') : null
      })

      syncEmitter.dispatchEvent(
        new CustomEvent<SyncCompleteEvent>('sync-complete', {
          detail: { success: errors.length === 0, count: totalCount }
        })
      )
      console.log(`[StravaSync] Import complete: ${totalCount} activities`)
    } catch (err: unknown) {
      const rateLimited = err instanceof Error && err.message === 'RATE_LIMIT'
      await updateSyncState({
        status: rateLimited ? 'idle' : 'error',
        lastActivityDate: newestSeen || null,
        lastSyncDate: Date.now(),
        lastError: rateLimited ? 'Rate limited — will resume' : String(err)
      })
      syncEmitter.dispatchEvent(
        new CustomEvent<SyncCompleteEvent>('sync-complete', {
          detail: {
            success: false,
            count: totalCount,
            error: rateLimited ? 'rate-limit' : String(err)
          }
        })
      )
    }

    return totalCount
  }

  private async listActivities(page: number, after?: number): Promise<StravaActivity[]> {
    const accessToken = await getValidAccessToken()
    const params = new URLSearchParams({ per_page: String(PER_PAGE), page: String(page) })
    if (after) params.set('after', String(after))

    const res = await fetch(`${API}/athlete/activities?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (res.status === 429) throw new Error('Strava API error: 429')
    if (!res.ok) throw new Error(`Strava list error: ${res.status}`)

    const data = await res.json()
    return Array.isArray(data) ? (data as StravaActivity[]) : []
  }

  private async fetchStreams(activityId: number): Promise<StravaStreams> {
    const accessToken = await getValidAccessToken()
    const params = new URLSearchParams({ keys: STREAM_KEYS, key_by_type: 'true' })

    const res = await fetch(`${API}/activities/${activityId}/streams?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (res.status === 429) throw new Error('Strava API error: 429')
    // Streams are optional (e.g. manual activities) — treat any non-OK as "no streams".
    if (!res.ok) return undefined

    return (await res.json()) as StravaStreams
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export function getStravaSyncManager(): StravaSyncManager {
  return StravaSyncManager.getInstance()
}
