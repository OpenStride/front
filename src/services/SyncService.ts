import { StoragePluginManager } from '@/services/StoragePluginManager'
import type { StoragePlugin } from '@/types/storage'
import { IndexedDBService } from '@/services/IndexedDBService'
import { getActivityService } from '@/services/ActivityService'
import type { Activity, ActivityDetails } from '@/types/activity'
import type { CustomAggregate } from '@/types/customAggregate'
import {
  CUSTOM_AGGREGATES_STORE,
  getCustomAggregateService
} from '@/services/CustomAggregateService'
import { applyConflictResolution, mergedRemote, reconcile } from '@/services/TimestampedSync'
import { debounce } from '@/utils/debounce'

/**
 * Events emitted by SyncService
 */
export interface SyncServiceEvent {
  type:
    | 'sync-started'
    | 'sync-completed'
    | 'sync-failed'
    | 'sync-in-progress'
    | 'sync-no-plugins'
    | 'sync-conflict'
  activitiesSynced?: number
  errors?: string[]
  conflictActivity?: string
}

/**
 * SyncService - Explicit sync orchestration with conflict detection
 *
 * Replaces StorageService with:
 * - Manual sync (user-initiated, not automatic)
 * - Incremental sync (only unsynced activities)
 * - Conflict detection via version counter
 * - LWW resolution with user notification
 */
// Stores whose remote change is tracked to skip full reads. Both make up the
// activity dataset; a change in either warrants a pull.
const TRACKED_STORES = ['activities', 'activity_details']
// Device-local bookkeeping (never synced): last remote change-token seen per
// plugin+store. Kept in localStorage so it survives reloads without triggering
// a settings backup.
const CHANGE_TOKENS_KEY = 'openstride:sync:changeTokens'

export class SyncService {
  private static instance: SyncService
  private pluginManager = StoragePluginManager.getInstance()
  private syncing = false
  public emitter = new EventTarget()
  private activityServiceListener: ((evt: Event) => void) | null = null
  private debouncedSync: (() => void) | null = null

  private constructor() {
    /* singleton */
  }

  public static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService()
    }
    return SyncService.instance
  }

  /**
   * Main entry point: Sync all stores with all enabled storage plugins
   */
  public async syncNow(opts: { force?: boolean } = {}): Promise<{
    success: boolean
    activitiesSynced: number
    errors: string[]
  }> {
    if (this.syncing) {
      console.warn('[SyncService] Sync already in progress')

      // Emit sync-in-progress event instead of showing toast directly
      this.emitter.dispatchEvent(
        new CustomEvent<SyncServiceEvent>('sync-in-progress', {
          detail: { type: 'sync-in-progress' }
        })
      )

      return { success: false, activitiesSynced: 0, errors: ['Sync already in progress'] }
    }

    this.syncing = true
    const errors: string[] = []
    let totalSynced = 0

    try {
      console.log('[SyncService] 🔄 Starting sync...')

      // Emit sync-started event instead of showing toast directly
      this.emitter.dispatchEvent(
        new CustomEvent<SyncServiceEvent>('sync-started', {
          detail: { type: 'sync-started' }
        })
      )

      const plugins = await this.pluginManager.getMyStoragePlugins()
      if (plugins.length === 0) {
        console.warn('[SyncService] No storage plugins enabled')

        // Emit sync-no-plugins event instead of showing toast directly
        this.emitter.dispatchEvent(
          new CustomEvent<SyncServiceEvent>('sync-no-plugins', {
            detail: { type: 'sync-no-plugins' }
          })
        )

        return { success: false, activitiesSynced: 0, errors: ['No plugins'] }
      }

      // Sync activities with each plugin
      for (const plugin of plugins) {
        try {
          const result = await this.syncActivities(plugin, opts)
          totalSynced += result.activitiesSynced
          if (result.errors.length > 0) {
            errors.push(...result.errors)
          }
        } catch (error) {
          const msg = `Error syncing with ${plugin.label}: ${error}`
          console.error('[SyncService]', msg)
          errors.push(msg)
        }

        // Definitions ride the same round but are counted separately: the
        // number reported to the user is a count of activities, and folding
        // two aggregate edits into it would make it mean nothing.
        try {
          errors.push(...(await this.syncDefinitions(plugin)).errors)
        } catch (error) {
          const msg = `Error syncing definitions with ${plugin.label}: ${error}`
          console.error('[SyncService]', msg)
          errors.push(msg)
        }
      }

      // Success
      if (errors.length === 0) {
        console.log(`[SyncService] ✅ Sync complete: ${totalSynced} activities`)

        // Emit sync-completed event instead of showing toast directly
        this.emitter.dispatchEvent(
          new CustomEvent<SyncServiceEvent>('sync-completed', {
            detail: {
              type: 'sync-completed',
              activitiesSynced: totalSynced,
              errors: []
            }
          })
        )

        return { success: true, activitiesSynced: totalSynced, errors: [] }
      } else {
        console.warn(`[SyncService] ⚠️ Sync completed with errors:`, errors)

        // Emit sync-completed with errors instead of showing toast directly
        this.emitter.dispatchEvent(
          new CustomEvent<SyncServiceEvent>('sync-completed', {
            detail: {
              type: 'sync-completed',
              activitiesSynced: totalSynced,
              errors
            }
          })
        )

        return { success: false, activitiesSynced: totalSynced, errors }
      }
    } catch (error) {
      console.error('[SyncService] ❌ Sync failed:', error)

      // Emit sync-failed event instead of showing toast directly
      this.emitter.dispatchEvent(
        new CustomEvent<SyncServiceEvent>('sync-failed', {
          detail: {
            type: 'sync-failed',
            errors: [String(error)]
          }
        })
      )

      return { success: false, activitiesSynced: 0, errors: [String(error)] }
    } finally {
      this.syncing = false
    }
  }

  /**
   * Sync activities store with a specific plugin
   */
  private async syncActivities(
    plugin: StoragePlugin,
    opts: { force?: boolean } = {}
  ): Promise<{ activitiesSynced: number; errors: string[] }> {
    console.log(`[SyncService] Syncing activities with ${plugin.label}`)
    const errors: string[] = []
    const activityService = await getActivityService()

    try {
      // 1. Get unsynced local activities (purely local, no IO)
      const unsyncedActivities = await activityService.getUnsyncedActivities()
      console.log(`[SyncService] Found ${unsyncedActivities.length} unsynced activities`)

      // 1b. Change-token short-circuit: if there is nothing local to push AND the
      // remote hasn't changed since we last saw it, skip the (potentially large)
      // full remote read entirely. `force` bypasses this optimization.
      const remoteTokens = await this.getRemoteTokens(plugin)
      if (
        !opts.force &&
        unsyncedActivities.length === 0 &&
        remoteTokens &&
        !this.remoteChanged(plugin.id, remoteTokens)
      ) {
        console.log(`[SyncService] Skip ${plugin.label}: no local changes, remote unchanged`)
        return { activitiesSynced: 0, errors: [] }
      }

      // 2. Get remote activities
      const remoteActivities = (await plugin.readRemote('activities')) as Activity[]
      const remoteDetails = (await plugin.readRemote('activity_details')) as ActivityDetails[]

      // 3. Build maps for conflict detection
      const localMap = new Map<string, Activity>()
      for (const activity of unsyncedActivities) {
        localMap.set(activity.id, activity)
      }

      const remoteMap = new Map<string, Activity>()
      for (const activity of remoteActivities) {
        remoteMap.set(activity.id, activity)
      }

      // 4. Detect conflicts and prepare data
      const toPush: Activity[] = []
      const toPull: Activity[] = []
      const conflicts: Array<{ local: Activity; remote: Activity }> = []

      for (const [id, local] of localMap.entries()) {
        const remote = remoteMap.get(id)

        if (!remote) {
          // New local activity → push to remote
          toPush.push(local)
        } else if (this.hasConflict(local, remote)) {
          // Conflict detected
          conflicts.push({ local, remote })
        } else if (local.version > remote.version) {
          // Local is newer → push
          toPush.push(local)
        }
      }

      // Check for new remote activities to pull or remote soft-deletes
      const allLocal = await activityService.getAllActivities()
      const allLocalMap = new Map<string, Activity>()
      for (const a of allLocal) {
        allLocalMap.set(a.id, a)
      }

      for (const [id, remote] of remoteMap.entries()) {
        if (remote.deleted) {
          // Remote soft-delete: propagate locally if local copy exists and isn't deleted
          const localActivity = allLocalMap.get(id)
          if (localActivity && !localActivity.deleted) {
            try {
              await activityService.deleteActivity(id)
              console.log(`[SyncService] Propagated remote soft-delete for ${id}`)
            } catch {
              // Activity may not exist locally, ignore
            }
          }
        } else if (!localMap.has(id) && !allLocalMap.has(id)) {
          toPull.push(remote)
        }
      }

      console.log(
        `[SyncService] To push: ${toPush.length}, To pull: ${toPull.length}, Conflicts: ${conflicts.length}`
      )

      // 5. Resolve conflicts (LWW)
      for (const conflict of conflicts) {
        const winner = this.resolveConflict(conflict.local, conflict.remote)
        if (winner === conflict.local) {
          toPush.push(conflict.local)
        } else {
          toPull.push(conflict.remote)
        }
      }

      // 6. Pull new remote activities via ActivityService (ensures versioning, events, aggregation)
      if (toPull.length > 0) {
        const detailsToPull = remoteDetails.filter(d => toPull.some(a => a.id === d.id))
        const detailsMap = new Map<string, ActivityDetails>()
        for (const d of detailsToPull) {
          detailsMap.set(d.id, d)
        }

        const activitiesToSave: Activity[] = []
        const detailsToSave: ActivityDetails[] = []

        for (const activity of toPull) {
          const details = detailsMap.get(activity.id)
          if (details) {
            activitiesToSave.push({ ...activity, synced: true })
            detailsToSave.push({ ...details, synced: true })
          } else {
            // Activity without details: save via raw IDB as fallback
            const db = await IndexedDBService.getInstance()
            await db.addItemsToStore(
              'activities',
              [{ ...activity, synced: true }],
              (a: Activity) => a.id
            )
          }
        }

        if (activitiesToSave.length > 0) {
          // fromSync: preserve remote synced/version/lastModified so pulled
          // activities are not re-marked unsynced (which would re-push them and
          // raise false conflicts on the next sync round).
          await activityService.saveActivitiesWithDetails(activitiesToSave, detailsToSave, {
            fromSync: true
          })
        }

        console.log(`[SyncService] Pulled ${toPull.length} activities from ${plugin.label}`)
      }

      // 7. Push local changes to remote
      if (toPush.length > 0) {
        // Merge with existing remote activities (keep ones we're not updating)
        const updatedRemoteActivities = [
          ...remoteActivities.filter(r => !toPush.some(p => p.id === r.id)),
          ...toPush
        ]

        await plugin.writeRemote('activities', updatedRemoteActivities)

        // Also push corresponding details
        const detailsToPush: ActivityDetails[] = []
        for (const activity of toPush) {
          const details = await activityService.getDetails(activity.id)
          if (details) {
            detailsToPush.push(details)
          }
        }

        if (detailsToPush.length > 0) {
          const updatedRemoteDetails = [
            ...remoteDetails.filter(r => !detailsToPush.some(p => p.id === r.id)),
            ...detailsToPush
          ]
          await plugin.writeRemote('activity_details', updatedRemoteDetails)
        }

        console.log(`[SyncService] Pushed ${toPush.length} activities to ${plugin.label}`)

        // Mark as synced locally
        const pushedIds = toPush.map(a => a.id)
        await activityService.markAsSynced(pushedIds)
      }

      // Re-baseline the change tokens so the next idle sync can short-circuit.
      // Re-fetched AFTER any push so our own write is reflected in the token.
      await this.persistRemoteTokens(plugin)

      return { activitiesSynced: toPush.length + toPull.length, errors }
    } catch (error) {
      const msg = `Failed to sync activities with ${plugin.label}: ${error}`
      console.error('[SyncService]', msg)
      errors.push(msg)
      return { activitiesSynced: 0, errors }
    }
  }

  /**
   * Sync the saved aggregate definitions with one plugin.
   *
   * Deliberately not routed through `syncActivities`: that one pairs each
   * activity with its details, replays pulls through ActivityService so
   * aggregation and events fire, and pushes two remote files in step. None of
   * that applies to a store of a few dozen hand-written rows. What the two do
   * share — the version/lastModified ranking and the last-write-wins rule —
   * lives in `TimestampedSync`, so this is not a second copy of it.
   *
   * The definitions are what `StorageService`'s additive merge would mangle:
   * see the note on SYNC_SERVICE_OWNED_STORES.
   */
  private async syncDefinitions(plugin: StoragePlugin): Promise<{ errors: string[] }> {
    const store = CUSTOM_AGGREGATES_STORE
    const service = getCustomAggregateService()

    try {
      const local = await service.listAll()
      const unsynced = local.filter(a => !a.synced)

      // Same short-circuit as the activities round, scoped to this one file:
      // an auto-sync fires five seconds after every activity change, and a
      // remote read per round for a store that rarely moves is pure latency.
      const token = await this.readRemoteToken(plugin, store)
      if (unsynced.length === 0 && token != null && token === this.seenToken(plugin.id, store)) {
        return { errors: [] }
      }

      const remote = ((await plugin.readRemote(store)) as CustomAggregate[]) ?? []

      const { toPush, toPull } = applyConflictResolution(
        reconcile(local, remote),
        (localRecord, remoteRecord, winner) => {
          // Logged, not surfaced: `sync-conflict` carries an activity title and
          // its listener renders an activity toast. Reusing it here would tell
          // the user one of their outings clashed, which is not what happened.
          console.warn(
            `[SyncService] ⚠️ Conflict on aggregate "${localRecord.label}"`,
            `\nLocal: v${localRecord.version} (${new Date(localRecord.lastModified).toISOString()})`,
            `\nRemote: v${remoteRecord.version} (${new Date(remoteRecord.lastModified).toISOString()})`,
            `\nWinner: ${winner === localRecord ? 'Local' : 'Remote'}`
          )
        }
      )

      if (toPull.length > 0) {
        await service.applyRemote(toPull)
        console.log(`[SyncService] Pulled ${toPull.length} aggregates from ${plugin.label}`)
      }

      if (toPush.length > 0) {
        await plugin.writeRemote(store, mergedRemote(remote, toPush))
        await service.markAsSynced(toPush.map(r => r.id))
        console.log(`[SyncService] Pushed ${toPush.length} aggregates to ${plugin.label}`)
      }

      // Re-read after any push so the baseline reflects our own write.
      await this.rememberToken(plugin, store)

      return { errors: [] }
    } catch (error) {
      const msg = `Failed to sync aggregates with ${plugin.label}: ${error}`
      console.error('[SyncService]', msg)
      return { errors: [msg] }
    }
  }

  /** Current remote token for one store, or null when unavailable. */
  private async readRemoteToken(plugin: StoragePlugin, store: string): Promise<string | null> {
    if (!plugin.getRemoteChangeToken) return null
    try {
      return await plugin.getRemoteChangeToken(store)
    } catch {
      return null
    }
  }

  private seenToken(pluginId: string, store: string): string | undefined {
    return this.readTokenMap()[pluginId]?.[store]
  }

  private async rememberToken(plugin: StoragePlugin, store: string): Promise<void> {
    const fresh = await this.readRemoteToken(plugin, store)
    if (fresh == null) return
    const map = this.readTokenMap()
    map[plugin.id] = { ...(map[plugin.id] || {}), [store]: fresh }
    this.writeTokenMap(map)
  }

  /**
   * Detect if there's a conflict between local and remote
   * Conflict = same version but different lastModified (both modified independently)
   */
  private hasConflict(local: Activity, remote: Activity): boolean {
    return local.version === remote.version && local.lastModified !== remote.lastModified
  }

  /**
   * Resolve conflict using Last-Write-Wins
   * Returns the winner and emits notification event
   */
  private resolveConflict(local: Activity, remote: Activity): Activity {
    const winner = local.lastModified > remote.lastModified ? local : remote

    console.warn(
      `[SyncService] ⚠️ Conflict detected for activity "${local.title || local.id}"`,
      `\nLocal: v${local.version} (${new Date(local.lastModified).toISOString()})`,
      `\nRemote: v${remote.version} (${new Date(remote.lastModified).toISOString()})`,
      `\nWinner: ${winner === local ? 'Local' : 'Remote'}`
    )

    // Emit sync-conflict event instead of showing toast directly
    this.emitter.dispatchEvent(
      new CustomEvent<SyncServiceEvent>('sync-conflict', {
        detail: {
          type: 'sync-conflict',
          conflictActivity: local.title || 'Activité'
        }
      })
    )

    return winner
  }

  // ========== Remote change-token bookkeeping (device-local) ==========

  /** Read the persisted per-plugin/per-store last-seen tokens. */
  private readTokenMap(): Record<string, Record<string, string>> {
    try {
      return JSON.parse(localStorage.getItem(CHANGE_TOKENS_KEY) || '{}')
    } catch {
      return {}
    }
  }

  private writeTokenMap(map: Record<string, Record<string, string>>): void {
    try {
      localStorage.setItem(CHANGE_TOKENS_KEY, JSON.stringify(map))
    } catch {
      /* localStorage unavailable — optimization simply won't persist */
    }
  }

  /**
   * Fetch the current remote change-token for each tracked store. Returns null
   * when the plugin can't provide tokens (caller then does a full read).
   */
  private async getRemoteTokens(
    plugin: StoragePlugin
  ): Promise<Record<string, string | null> | null> {
    if (!plugin.getRemoteChangeToken) return null
    const out: Record<string, string | null> = {}
    for (const store of TRACKED_STORES) {
      try {
        out[store] = await plugin.getRemoteChangeToken(store)
      } catch {
        out[store] = null
      }
    }
    return out
  }

  /**
   * True if any tracked store's remote token differs from what we last saw.
   * A null remote token (missing/unreadable file) never counts as a change.
   */
  private remoteChanged(pluginId: string, remoteTokens: Record<string, string | null>): boolean {
    const seen = this.readTokenMap()[pluginId] || {}
    for (const store of TRACKED_STORES) {
      const rt = remoteTokens[store]
      if (rt != null && rt !== seen[store]) return true
    }
    return false
  }

  /**
   * Re-read and persist the current remote tokens as the new baseline. Called
   * after a completed sync (post-push) so the next idle sync can short-circuit.
   */
  private async persistRemoteTokens(plugin: StoragePlugin): Promise<void> {
    if (!plugin.getRemoteChangeToken) return
    const fresh: Record<string, string> = {}
    for (const store of TRACKED_STORES) {
      try {
        const t = await plugin.getRemoteChangeToken(store)
        if (t != null) fresh[store] = t
      } catch {
        /* ignore — a missing token just means no short-circuit next time */
      }
    }
    const map = this.readTokenMap()
    map[plugin.id] = { ...(map[plugin.id] || {}), ...fresh }
    this.writeTokenMap(map)
  }

  /**
   * Start listening to ActivityService events for auto-sync (debounced 5s).
   * When activities change, sync is triggered automatically after a delay.
   */
  async startListening(): Promise<void> {
    const activityService = await getActivityService()

    this.debouncedSync = debounce(() => {
      this.syncNow()
        .then(result => {
          if (result.activitiesSynced > 0) {
            window.dispatchEvent(new Event('openstride:activities-refreshed'))
          }
        })
        .catch(err => console.error('[SyncService] Auto-sync failed:', err))
    }, 5000)

    this.activityServiceListener = () => {
      if (this.debouncedSync) this.debouncedSync()
    }

    activityService.emitter.addEventListener('activity-changed', this.activityServiceListener)
    console.log('[SyncService] Started listening to ActivityService events (debounced 5s)')
  }

  /**
   * Stop listening to ActivityService events
   */
  async stopListening(): Promise<void> {
    if (this.activityServiceListener) {
      const activityService = await getActivityService()
      activityService.emitter.removeEventListener('activity-changed', this.activityServiceListener)
      this.activityServiceListener = null
      this.debouncedSync = null
      console.log('[SyncService] Stopped listening')
    }
  }

  /**
   * Check if sync is currently in progress
   */
  public isSyncing(): boolean {
    return this.syncing
  }
}

// Singleton factory
export function getSyncService(): SyncService {
  return SyncService.getInstance()
}
