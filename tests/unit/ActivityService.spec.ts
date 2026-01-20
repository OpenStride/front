import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ActivityService } from '@/services/ActivityService'
import type { Activity, ActivityDetails } from '@/types/activity'
import { createActivity, createActivityDetails, createActivities } from '../fixtures/activities'

// Mock IndexedDBService
vi.mock('@/services/IndexedDBService', () => {
  class FakeDB {
    public db: any
    private stores: Record<string, any[]> = {
      activities: [],
      activity_details: []
    }
    public emitter = new EventTarget()

    constructor() {
      // Initialize db with proper transaction method
      this.db = {
        transaction: (storeNames: string[], mode: IDBTransactionMode) => {
          return this.getMockTransaction(storeNames, mode)
        }
      }
    }

    static instance: FakeDB | null = null

    static async getInstance() {
      if (!FakeDB.instance) {
        FakeDB.instance = new FakeDB()
      }
      return FakeDB.instance
    }

    async getAllData(store: string) {
      return [...(this.stores[store] || [])]
    }

    async getDataFromStore(store: string, id: string) {
      return this.stores[store]?.find((item: any) => item.id === id) || null
    }

    async addItemsToStore(store: string, items: any[], keyFn?: (item: any) => any) {
      const existing = this.stores[store] || []
      const keyExtractor = keyFn || ((item: any) => item.id)

      for (const newItem of items) {
        const key = keyExtractor(newItem)
        const existingIndex = existing.findIndex((item: any) => keyExtractor(item) === key)

        if (existingIndex >= 0) {
          existing[existingIndex] = newItem
        } else {
          existing.push(newItem)
        }
      }

      this.stores[store] = existing
    }

    // Reset for tests
    reset() {
      this.stores = {
        activities: [],
        activity_details: []
      }
    }

    // Get mock transaction (with proper async sequencing)
    getMockTransaction(storeNames: string[], mode: IDBTransactionMode) {
      const self = this
      const stores: Record<string, any> = {}
      let pendingOps = 0

      const checkComplete = (tx: any) => {
        if (pendingOps === 0) {
          setTimeout(() => {
            if (tx.oncomplete) tx.oncomplete()
          }, 0)
        }
      }

      for (const name of storeNames) {
        stores[name] = {
          put: vi.fn((item: any) => {
            const storeData = self.stores[name] || []
            const existing = storeData.findIndex((i: any) => i.id === item.id)
            if (existing >= 0) {
              storeData[existing] = item
            } else {
              storeData.push(item)
            }
            self.stores[name] = storeData
          }),
          get: vi.fn((id: string) => {
            pendingOps++
            const storeData = self.stores[name] || []
            const item = storeData.find((i: any) => i.id === id)
            const req = {
              result: item,
              onsuccess: null as any
            }
            // Trigger onsuccess asynchronously
            setTimeout(() => {
              if (req.onsuccess) req.onsuccess()
              pendingOps--
              checkComplete(tx)
            }, 0)
            return req
          })
        }
      }

      const tx = {
        objectStore: vi.fn((name: string) => stores[name]),
        oncomplete: null as any,
        onerror: null as any,
        error: null
      }

      // Check if transaction can complete (will fire after all pending ops)
      setTimeout(() => checkComplete(tx), 1)

      return tx
    }
  }

  return {
    IndexedDBService: FakeDB
  }
})

describe('ActivityService', () => {
  let service: ActivityService
  let db: any

  beforeEach(async () => {
    // Reset singleton
    ;(ActivityService as any).instance = null

    service = await ActivityService.getInstance()
    db = (service as any).db

    // Reset stores
    db.reset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Singleton Pattern', () => {
    it('should return same instance', async () => {
      const instance1 = await ActivityService.getInstance()
      const instance2 = await ActivityService.getInstance()
      expect(instance1).toBe(instance2)
    })
  })

  describe('saveActivityWithDetails', () => {
    it('should save activity and details atomically', async () => {
      const activity = createActivity({ id: 'test-1' })
      const details = createActivityDetails('test-1')

      await service.saveActivityWithDetails(activity, details)

      const savedActivity = await service.getActivity('test-1')
      const savedDetails = await service.getDetails('test-1')

      expect(savedActivity).toBeTruthy()
      expect(savedDetails).toBeTruthy()
      expect(savedActivity!.id).toBe('test-1')
      expect(savedDetails!.id).toBe('test-1')
    })

    it('should set metadata fields (version, lastModified, synced, deleted)', async () => {
      const activity = createActivity({ id: 'test-1', version: undefined as any })
      const details = createActivityDetails('test-1', 50, { version: undefined as any })

      await service.saveActivityWithDetails(activity, details)

      const savedActivity = await service.getActivity('test-1')
      const savedDetails = await service.getDetails('test-1')

      expect(savedActivity!.version).toBe(0)
      expect(savedActivity!.lastModified).toBeGreaterThan(Date.now() - 1000)
      expect(savedActivity!.synced).toBe(false)
      expect(savedActivity!.deleted).toBe(false)

      expect(savedDetails!.version).toBe(0)
      expect(savedDetails!.lastModified).toBeGreaterThan(Date.now() - 1000)
      expect(savedDetails!.synced).toBe(false)
      expect(savedDetails!.deleted).toBe(false)
    })

    it('should emit activity-changed event', async () => {
      const activity = createActivity({ id: 'test-1' })
      const details = createActivityDetails('test-1')

      const eventPromise = new Promise((resolve) => {
        service.emitter.addEventListener('activity-changed', (event: any) => {
          resolve(event.detail)
        })
      })

      await service.saveActivityWithDetails(activity, details)

      const eventDetail = await eventPromise
      expect(eventDetail).toMatchObject({
        type: 'saved',
        activity: expect.objectContaining({ id: 'test-1' }),
        details: expect.objectContaining({ id: 'test-1' })
      })
    })

    it('should throw if IndexedDB not initialized', async () => {
      ;(service as any).db = null

      const activity = createActivity()
      const details = createActivityDetails('activity-1')

      await expect(service.saveActivityWithDetails(activity, details)).rejects.toThrow(
        'IndexedDB not initialized'
      )
    })
  })

  describe('saveActivitiesWithDetails', () => {
    it('should save multiple activities in bulk', async () => {
      const activities = createActivities(3)
      const details = activities.map(a => createActivityDetails(a.id))

      await service.saveActivitiesWithDetails(activities, details)

      for (const activity of activities) {
        const saved = await service.getActivity(activity.id)
        expect(saved).toBeTruthy()
        expect(saved!.id).toBe(activity.id)
      }
    })

    it('should throw if arrays have different lengths', async () => {
      const activities = createActivities(2)
      const details = [createActivityDetails('activity-1')]

      await expect(service.saveActivitiesWithDetails(activities, details)).rejects.toThrow(
        'Activities and details arrays must have same length'
      )
    })

    it('should emit activity-changed event for each activity', async () => {
      const activities = createActivities(2)
      const details = activities.map(a => createActivityDetails(a.id))

      const events: any[] = []
      service.emitter.addEventListener('activity-changed', (event: any) => {
        events.push(event.detail)
      })

      await service.saveActivitiesWithDetails(activities, details)

      expect(events).toHaveLength(2)
      expect(events[0].type).toBe('saved')
      expect(events[1].type).toBe('saved')
    })
  })

  describe('updateActivity', () => {
    it('should update activity fields', async () => {
      const activity = createActivity({ id: 'test-1', title: 'Original' })
      const details = createActivityDetails('test-1')

      await service.saveActivityWithDetails(activity, details)
      await service.updateActivity('test-1', { title: 'Updated Title' })

      const updated = await service.getActivity('test-1')
      expect(updated!.title).toBe('Updated Title')
    })

    it('should increment version on update', async () => {
      const activity = createActivity({ id: 'test-1', version: 1 })
      const details = createActivityDetails('test-1')

      await service.saveActivityWithDetails(activity, details)
      await service.updateActivity('test-1', { title: 'Updated' })

      const updated = await service.getActivity('test-1')
      expect(updated!.version).toBe(2) // 1 + 1
    })

    it('should set synced to false on update', async () => {
      const activity = createActivity({ id: 'test-1', synced: true })
      const details = createActivityDetails('test-1')

      await service.saveActivityWithDetails(activity, details)

      // Manually mark as synced
      await service.markAsSynced(['test-1'])
      let synced = await service.getActivity('test-1')
      expect(synced!.synced).toBe(true)

      await service.updateActivity('test-1', { title: 'Updated' })

      const updated = await service.getActivity('test-1')
      expect(updated!.synced).toBe(false)
    })

    it('should update lastModified timestamp', async () => {
      const oldTime = Date.now() - 10000
      const activity = createActivity({ id: 'test-1', lastModified: oldTime })
      const details = createActivityDetails('test-1')

      await service.saveActivityWithDetails(activity, details)
      await service.updateActivity('test-1', { title: 'Updated' })

      const updated = await service.getActivity('test-1')
      expect(updated!.lastModified).toBeGreaterThan(oldTime)
    })

    it('should emit activity-changed event with type=updated', async () => {
      const activity = createActivity({ id: 'test-1' })
      const details = createActivityDetails('test-1')

      await service.saveActivityWithDetails(activity, details)

      const eventPromise = new Promise((resolve) => {
        service.emitter.addEventListener('activity-changed', (event: any) => {
          if (event.detail.type === 'updated') {
            resolve(event.detail)
          }
        })
      })

      await service.updateActivity('test-1', { title: 'New Title' })

      const eventDetail = await eventPromise
      expect(eventDetail).toMatchObject({
        type: 'updated',
        activity: expect.objectContaining({ id: 'test-1', title: 'New Title' })
      })
    })

    it('should throw if activity not found', async () => {
      await expect(service.updateActivity('non-existent', { title: 'Test' })).rejects.toThrow(
        'Activity non-existent not found'
      )
    })

    it('should prevent ID change', async () => {
      const activity = createActivity({ id: 'test-1' })
      const details = createActivityDetails('test-1')

      await service.saveActivityWithDetails(activity, details)
      await service.updateActivity('test-1', { id: 'hacked-id' } as any)

      const updated = await service.getActivity('test-1')
      expect(updated!.id).toBe('test-1') // ID should not change
    })
  })

  describe('deleteActivity (soft delete)', () => {
    it('should set deleted flag instead of removing', async () => {
      const activity = createActivity({ id: 'test-1' })
      const details = createActivityDetails('test-1')

      await service.saveActivityWithDetails(activity, details)
      await service.deleteActivity('test-1')

      const deleted = await service.getActivity('test-1')
      expect(deleted).toBeTruthy()
      expect(deleted!.deleted).toBe(true)
    })

    it('should increment version on delete', async () => {
      const activity = createActivity({ id: 'test-1', version: 1 })
      const details = createActivityDetails('test-1')

      await service.saveActivityWithDetails(activity, details)
      await service.deleteActivity('test-1')

      const deleted = await service.getActivity('test-1')
      expect(deleted!.version).toBe(2)
    })

    it('should set synced to false', async () => {
      const activity = createActivity({ id: 'test-1', synced: true })
      const details = createActivityDetails('test-1')

      await service.saveActivityWithDetails(activity, details)
      await service.markAsSynced(['test-1'])

      await service.deleteActivity('test-1')

      const deleted = await service.getActivity('test-1')
      expect(deleted!.synced).toBe(false)
    })

    it('should emit activity-changed event with type=deleted', async () => {
      const activity = createActivity({ id: 'test-1' })
      const details = createActivityDetails('test-1')

      await service.saveActivityWithDetails(activity, details)

      const eventPromise = new Promise((resolve) => {
        service.emitter.addEventListener('activity-changed', (event: any) => {
          if (event.detail.type === 'deleted') {
            resolve(event.detail)
          }
        })
      })

      await service.deleteActivity('test-1')

      const eventDetail = await eventPromise
      expect(eventDetail).toMatchObject({
        type: 'deleted',
        activity: expect.objectContaining({ id: 'test-1', deleted: true })
      })
    })

    it('should throw if activity not found', async () => {
      await expect(service.deleteActivity('non-existent')).rejects.toThrow(
        'Activity non-existent not found'
      )
    })
  })

  describe('getActivities', () => {
    beforeEach(async () => {
      const activities = createActivities(10)
      const details = activities.map(a => createActivityDetails(a.id))
      await service.saveActivitiesWithDetails(activities, details)
    })

    it('should return activities sorted by startTime DESC', async () => {
      const activities = await service.getActivities({ limit: 5 })
      expect(activities).toHaveLength(5)

      for (let i = 0; i < activities.length - 1; i++) {
        expect(activities[i].startTime).toBeGreaterThanOrEqual(activities[i + 1].startTime)
      }
    })

    it('should support offset and limit', async () => {
      const page1 = await service.getActivities({ offset: 0, limit: 3 })
      const page2 = await service.getActivities({ offset: 3, limit: 3 })

      expect(page1).toHaveLength(3)
      expect(page2).toHaveLength(3)
      expect(page1[0].id).not.toBe(page2[0].id)
    })

    it('should exclude deleted activities by default', async () => {
      await service.deleteActivity('activity-1')

      const activities = await service.getActivities({ limit: 20 })
      const deletedActivity = activities.find(a => a.id === 'activity-1')
      expect(deletedActivity).toBeUndefined()
    })

    it('should include deleted activities if includeDeleted=true', async () => {
      await service.deleteActivity('activity-1')

      const activities = await service.getActivities({ limit: 20, includeDeleted: true })
      const deletedActivity = activities.find(a => a.id === 'activity-1')
      expect(deletedActivity).toBeTruthy()
      expect(deletedActivity!.deleted).toBe(true)
    })
  })

  describe('getActivity', () => {
    it('should return activity by ID', async () => {
      const activity = createActivity({ id: 'test-1' })
      const details = createActivityDetails('test-1')
      await service.saveActivityWithDetails(activity, details)

      const result = await service.getActivity('test-1')
      expect(result).toBeTruthy()
      expect(result!.id).toBe('test-1')
    })

    it('should return null if not found', async () => {
      const result = await service.getActivity('non-existent')
      expect(result).toBeNull()
    })
  })

  describe('getDetails', () => {
    it('should return details by ID', async () => {
      const activity = createActivity({ id: 'test-1' })
      const details = createActivityDetails('test-1', 50)
      await service.saveActivityWithDetails(activity, details)

      const result = await service.getDetails('test-1')
      expect(result).toBeTruthy()
      expect(result!.id).toBe('test-1')
      expect(result!.samples).toHaveLength(50)
    })

    it('should return null if not found', async () => {
      const result = await service.getDetails('non-existent')
      expect(result).toBeNull()
    })
  })

  describe('markAsSynced', () => {
    it('should mark activities as synced', async () => {
      const activities = createActivities(2)
      const details = activities.map(a => createActivityDetails(a.id))
      await service.saveActivitiesWithDetails(activities, details)

      await service.markAsSynced(['activity-1', 'activity-2'])

      const activity1 = await service.getActivity('activity-1')
      const activity2 = await service.getActivity('activity-2')

      expect(activity1!.synced).toBe(true)
      expect(activity2!.synced).toBe(true)
    })

    it('should mark details as synced', async () => {
      const activity = createActivity({ id: 'test-1' })
      const details = createActivityDetails('test-1')
      await service.saveActivityWithDetails(activity, details)

      await service.markAsSynced(['test-1'])

      const savedDetails = await service.getDetails('test-1')
      expect(savedDetails!.synced).toBe(true)
    })

    it('should handle non-existent IDs gracefully', async () => {
      await expect(service.markAsSynced(['non-existent'])).resolves.not.toThrow()
    })
  })

  describe('getUnsyncedActivities', () => {
    it('should return only unsynced activities', async () => {
      const activities = createActivities(3)
      const details = activities.map(a => createActivityDetails(a.id))
      await service.saveActivitiesWithDetails(activities, details)

      await service.markAsSynced(['activity-1'])

      const unsynced = await service.getUnsyncedActivities()
      expect(unsynced).toHaveLength(2)
      expect(unsynced.find(a => a.id === 'activity-1')).toBeUndefined()
      expect(unsynced.find(a => a.id === 'activity-2')).toBeTruthy()
      expect(unsynced.find(a => a.id === 'activity-3')).toBeTruthy()
    })

    it('should exclude deleted activities', async () => {
      const activities = createActivities(2)
      const details = activities.map(a => createActivityDetails(a.id))
      await service.saveActivitiesWithDetails(activities, details)

      await service.deleteActivity('activity-1')

      const unsynced = await service.getUnsyncedActivities()
      expect(unsynced).toHaveLength(1)
      expect(unsynced[0].id).toBe('activity-2')
    })

    it('should return empty array if all synced', async () => {
      const activities = createActivities(2)
      const details = activities.map(a => createActivityDetails(a.id))
      await service.saveActivitiesWithDetails(activities, details)

      await service.markAsSynced(['activity-1', 'activity-2'])

      const unsynced = await service.getUnsyncedActivities()
      expect(unsynced).toHaveLength(0)
    })
  })
})
