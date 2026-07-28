import { Activity, ActivityDetails, type ActivityFilters } from '@/types/activity'
import { warnOnContractViolations } from './activityContract'
import { FriendActivity } from '@/types/friend'
import { IndexedDBService } from './IndexedDBService'
import type { IActivityService } from '@/types/plugin-context'

/**
 * Events emitted by ActivityService
 */
export interface ActivityServiceEvent {
  type: 'saved' | 'updated' | 'deleted'
  activity: Activity
  details?: ActivityDetails
}

/**
 * Unified CRUD service for activities with transactional writes,
 * versioning, and soft delete support.
 *
 * Replaces ActivityDBService with better data integrity guarantees.
 *
 * Emits events for aggregation and other reactive services:
 * - 'activity-changed': Fired after save/update/delete with { type, activity, details }
 *
 * Implements IActivityService for plugin dependency injection.
 */
export class ActivityService implements IActivityService {
  private static instance: ActivityService | null = null
  private db: IndexedDBService | null = null
  public emitter = new EventTarget()

  private constructor() {
    /* singleton */
  }

  public static async getInstance(): Promise<ActivityService> {
    if (!ActivityService.instance) {
      const service = new ActivityService()
      service.db = await IndexedDBService.getInstance()
      ActivityService.instance = service
    }
    return ActivityService.instance
  }

  private ensureDB(): IndexedDBService {
    if (!this.db) throw new Error('IndexedDB not initialized')
    return this.db
  }

  /**
   * Save activity and details in a single atomic transaction
   * This ensures data consistency - both succeed or both fail
   */
  public async saveActivityWithDetails(
    activity: Activity,
    details: ActivityDetails
  ): Promise<void> {
    // Every provider writes through here, so this is where the storage contract
    // is checked — a per-provider test has to be remembered, this does not.
    warnOnContractViolations(activity, details)
    const db = this.ensureDB()
    const idb = db.getIDB()

    // Ensure metadata fields are set
    const now = Date.now()
    const activityToSave: Activity = {
      ...activity,
      version: activity.version ?? 0,
      lastModified: now,
      synced: false,
      deleted: false
    }

    const detailsToSave: ActivityDetails = {
      ...details,
      version: details.version ?? 0,
      lastModified: now,
      synced: false,
      deleted: false
    }

    return new Promise((resolve, reject) => {
      const tx = idb.transaction(['activities', 'activity_details'], 'readwrite')

      tx.objectStore('activities').put(activityToSave)
      tx.objectStore('activity_details').put(detailsToSave)

      tx.oncomplete = () => {
        // Emit dbChange events for both stores (backward compatibility)
        db.emitter.dispatchEvent(
          new CustomEvent('dbChange', {
            detail: { store: 'activities', key: activity.id }
          })
        )
        db.emitter.dispatchEvent(
          new CustomEvent('dbChange', {
            detail: { store: 'activity_details', key: details.id }
          })
        )

        // Emit activity-changed event for reactive services (e.g., AggregationService)
        this.emitter.dispatchEvent(
          new CustomEvent<ActivityServiceEvent>('activity-changed', {
            detail: {
              type: 'saved',
              activity: activityToSave,
              details: detailsToSave
            }
          })
        )

        console.log(`[ActivityService] Saved activity ${activity.id} with details`)
        resolve()
      }

      tx.onerror = () => {
        console.error('[ActivityService] Transaction failed:', tx.error)
        reject(tx.error)
      }
    })
  }

  /**
   * Save multiple activities with details in bulk (atomic transaction)
   */
  public async saveActivitiesWithDetails(
    activities: Activity[],
    details: ActivityDetails[],
    opts: { fromSync?: boolean } = {}
  ): Promise<void> {
    activities.forEach((a, i) => warnOnContractViolations(a, details[i]))
    if (activities.length !== details.length) {
      throw new Error('Activities and details arrays must have same length')
    }

    const db = this.ensureDB()
    const idb = db.getIDB()
    const now = Date.now()

    // When pulling from a remote store we must preserve the incoming metadata
    // (synced flag, version, lastModified) instead of stamping fresh local values.
    // Otherwise pulled activities are re-marked unsynced -> re-pushed, and their
    // rewritten lastModified triggers spurious conflicts + an extra sync round.
    const fromSync = opts.fromSync === true
    const savedActivities: Activity[] = activities.map(a => ({
      ...a,
      version: a.version ?? 0,
      lastModified: fromSync ? (a.lastModified ?? now) : now,
      synced: fromSync ? (a.synced ?? true) : false,
      deleted: fromSync ? (a.deleted ?? false) : false
    }))
    const savedDetails: ActivityDetails[] = details.map(d => ({
      ...d,
      version: d.version ?? 0,
      lastModified: fromSync ? (d.lastModified ?? now) : now,
      synced: fromSync ? (d.synced ?? true) : false,
      deleted: fromSync ? (d.deleted ?? false) : false
    }))

    return new Promise((resolve, reject) => {
      const tx = idb.transaction(['activities', 'activity_details'], 'readwrite')

      for (let i = 0; i < savedActivities.length; i++) {
        tx.objectStore('activities').put(savedActivities[i])
        tx.objectStore('activity_details').put(savedDetails[i])
      }

      tx.oncomplete = () => {
        // Emit batch change event (backward compatibility)
        db.emitter.dispatchEvent(
          new CustomEvent('dbChange', {
            detail: { store: 'activities', key: '' }
          })
        )

        // Emit activity-changed event for each saved activity (drives aggregation)
        for (let i = 0; i < savedActivities.length; i++) {
          this.emitter.dispatchEvent(
            new CustomEvent<ActivityServiceEvent>('activity-changed', {
              detail: {
                type: 'saved',
                activity: savedActivities[i],
                details: savedDetails[i]
              }
            })
          )
        }

        console.log(`[ActivityService] Saved ${savedActivities.length} activities with details`)
        resolve()
      }

      tx.onerror = () => {
        console.error('[ActivityService] Bulk save failed:', tx.error)
        reject(tx.error)
      }
    })
  }

  /**
   * Update activity fields (increments version, updates timestamp)
   */
  public async updateActivity(id: string, updates: Partial<Activity>): Promise<void> {
    const db = this.ensureDB()
    const activity = await this.getActivity(id)
    if (!activity) {
      throw new Error(`Activity ${id} not found`)
    }

    const updatedActivity: Activity = {
      ...activity,
      ...updates,
      id: activity.id, // Prevent ID change
      version: activity.version + 1,
      lastModified: Date.now(),
      synced: false
    }

    await db.addItemsToStore('activities', [updatedActivity], (a: Activity) => a.id)

    // Emit dbChange event (backward compatibility)
    db.emitter.dispatchEvent(
      new CustomEvent('dbChange', {
        detail: { store: 'activities', key: id }
      })
    )

    // Emit activity-changed event
    const details = await this.getDetails(id)
    this.emitter.dispatchEvent(
      new CustomEvent<ActivityServiceEvent>('activity-changed', {
        detail: {
          type: 'updated',
          activity: updatedActivity,
          details: details || undefined
        }
      })
    )

    console.log(`[ActivityService] Updated activity ${id} (version ${updatedActivity.version})`)
  }

  /**
   * Soft delete activity (sets deleted flag instead of removing)
   */
  public async deleteActivity(id: string): Promise<void> {
    const db = this.ensureDB()
    const activity = await this.getActivity(id)
    if (!activity) {
      throw new Error(`Activity ${id} not found`)
    }

    const deletedActivity: Activity = {
      ...activity,
      version: activity.version + 1,
      lastModified: Date.now(),
      deleted: true,
      synced: false
    }

    await db.addItemsToStore('activities', [deletedActivity], (a: Activity) => a.id)

    // Emit dbChange event (backward compatibility)
    db.emitter.dispatchEvent(
      new CustomEvent('dbChange', {
        detail: { store: 'activities', key: id }
      })
    )

    // Emit activity-changed event
    const details = await this.getDetails(id)
    this.emitter.dispatchEvent(
      new CustomEvent<ActivityServiceEvent>('activity-changed', {
        detail: {
          type: 'deleted',
          activity: deletedActivity,
          details: details || undefined
        }
      })
    )

    console.log(`[ActivityService] Soft deleted activity ${id}`)
  }

  /**
   * Get activities with optional filters
   */
  public async getActivities(
    params: {
      offset?: number
      limit?: number
      includeDeleted?: boolean
      filters?: ActivityFilters
    } = {}
  ): Promise<Activity[]> {
    const db = this.ensureDB()
    const { offset = 0, limit = 10, includeDeleted = false, filters } = params

    const all = (await db.getAllData('activities')) as Activity[]

    let filtered = all
    if (!includeDeleted) {
      filtered = filtered.filter(a => !a.deleted)
    }

    if (filters) {
      filtered = this.applyFilters(filtered, filters)
    }

    return filtered.sort((a, b) => b.startTime - a.startTime).slice(offset, offset + limit)
  }

  /**
   * Count total activities matching filters (for UI result count)
   */
  public async countActivities(filters?: ActivityFilters): Promise<number> {
    const db = this.ensureDB()
    const all = (await db.getAllData('activities')) as Activity[]
    let filtered = all.filter(a => !a.deleted)
    if (filters) {
      filtered = this.applyFilters(filtered, filters)
    }
    return filtered.length
  }

  private applyFilters(activities: Activity[], filters: ActivityFilters): Activity[] {
    let result = activities

    if (filters.text) {
      const search = filters.text.toLowerCase()
      result = result.filter(a => a.title?.toLowerCase().includes(search))
    }

    if (filters.sportType) {
      const sport = filters.sportType.toLowerCase()
      result = result.filter(a => a.type?.toLowerCase() === sport)
    }

    if (filters.distanceMin != null) {
      result = result.filter(a => a.distance >= filters.distanceMin!)
    }

    if (filters.distanceMax != null) {
      result = result.filter(a => a.distance <= filters.distanceMax!)
    }

    return result
  }

  /**
   * Get single activity by ID
   */
  public async getActivity(id: string): Promise<Activity | undefined> {
    const db = this.ensureDB()
    const result = (await db.getDataFromStore('activities', id)) as Activity | null
    return result ?? undefined
  }

  /**
   * Get all activities (excluding deleted)
   * Used by plugins via IActivityService interface
   */
  public async getAllActivities(): Promise<Activity[]> {
    const db = this.ensureDB()
    const all = (await db.getAllData('activities')) as Activity[]
    return all.filter(a => !a.deleted).sort((a, b) => b.startTime - a.startTime)
  }

  /**
   * Get activity details by ID
   */
  public async getDetails(id: string): Promise<ActivityDetails | undefined> {
    const db = this.ensureDB()
    const result = (await db.getDataFromStore('activity_details', id)) as ActivityDetails | null
    return result ?? undefined
  }

  /**
   * Get a friend's activity from friend_activities store
   */
  public async getFriendActivity(
    friendId: string,
    activityId: string
  ): Promise<FriendActivity | undefined> {
    const db = this.ensureDB()
    const allFriendActivities = (await db.getAllData('friend_activities')) as FriendActivity[]
    return allFriendActivities.find(a => a.friendId === friendId && a.activityId === activityId)
  }

  /**
   * Mark activities as synced
   */
  public async markAsSynced(activityIds: string[]): Promise<void> {
    const db = this.ensureDB()
    const idb = db.getIDB()

    return new Promise((resolve, reject) => {
      const tx = idb.transaction(['activities', 'activity_details'], 'readwrite')

      for (const id of activityIds) {
        const activityReq = tx.objectStore('activities').get(id)
        activityReq.onsuccess = () => {
          const activity = activityReq.result
          if (activity) {
            activity.synced = true
            tx.objectStore('activities').put(activity)
          }
        }

        const detailsReq = tx.objectStore('activity_details').get(id)
        detailsReq.onsuccess = () => {
          const details = detailsReq.result
          if (details) {
            details.synced = true
            tx.objectStore('activity_details').put(details)
          }
        }
      }

      tx.oncomplete = () => {
        console.log(`[ActivityService] Marked ${activityIds.length} activities as synced`)
        resolve()
      }

      tx.onerror = () => reject(tx.error)
    })
  }

  /**
   * Get unsynced activities (for incremental sync)
   */
  public async getUnsyncedActivities(): Promise<Activity[]> {
    const db = this.ensureDB()
    const all = (await db.getAllData('activities')) as Activity[]
    return all.filter(a => !a.synced && !a.deleted)
  }
}

// Singleton factory
let instance: ActivityService | null = null

export async function getActivityService(): Promise<ActivityService> {
  if (!instance) {
    instance = await ActivityService.getInstance()
  }
  return instance
}
