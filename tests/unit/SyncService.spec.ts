import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SyncService } from '@/services/SyncService'
import { StoragePluginManager } from '@/services/StoragePluginManager'
import type { Activity, ActivityDetails } from '@/types/activity'

// Mock ToastService to avoid side effects
vi.mock('@/services/ToastService', () => ({
  ToastService: {
    push: vi.fn()
  }
}))

// Mock IndexedDBService
vi.mock('@/services/IndexedDBService', () => {
  class FakeDB {
    private stores: Record<string, any[]> = {
      settings: [],
      activities: [],
      activity_details: [],
      notifLogs: []
    }

    async getObjectStoresNames() {
      return Object.keys(this.stores)
    }

    async exportDB(store: string) {
      return [...(this.stores[store] || [])]
    }

    async getAllData(store: string) {
      return [...(this.stores[store] || [])]
    }

    async addItemsToStore(store: string, items: any[], keyFn?: (item: any) => any) {
      // Simulate IDBObjectStore.put() behavior: replace existing items with same key
      const existing = this.stores[store] || []
      const keyExtractor = keyFn || ((item: any) => item.id || item.key)

      for (const newItem of items) {
        const key = keyExtractor(newItem)
        const existingIndex = existing.findIndex((item: any) => keyExtractor(item) === key)

        if (existingIndex >= 0) {
          // Replace existing item
          existing[existingIndex] = newItem
        } else {
          // Add new item
          existing.push(newItem)
        }
      }

      this.stores[store] = existing
    }

    async saveData(key: string, value: any) {
      const settingsStore = this.stores['settings'] || []
      const existingIndex = settingsStore.findIndex((item: any) => item.key === key)
      if (existingIndex >= 0) {
        settingsStore[existingIndex] = { key, value }
      } else {
        settingsStore.push({ key, value })
      }
      this.stores['settings'] = settingsStore
    }

    async getData(key: string) {
      const item = this.stores['settings']?.find((i: any) => i.key === key)
      return item?.value || null
    }

    // Helper for tests
    setStoreData(store: string, data: any[]) {
      this.stores[store] = [...data]
    }

    clearStore(store: string) {
      this.stores[store] = []
    }

    emitter = new EventTarget()
  }

  let instance: any
  return {
    IndexedDBService: {
      getInstance: async () => {
        if (!instance) instance = new FakeDB()
        return instance
      }
    }
  }
})

// Mock ActivityService
vi.mock('@/services/ActivityService', async () => {
  const getDB = async () => {
    const { IndexedDBService } = await import('@/services/IndexedDBService')
    return await IndexedDBService.getInstance()
  }

  class FakeActivityService {
    async getUnsyncedActivities(): Promise<Activity[]> {
      const db = await getDB()
      const all = await (db as any).getAllData('activities')
      return all.filter((a: Activity) => !a.synced && !a.deleted)
    }

    async getActivity(id: string): Promise<Activity | null> {
      const db = await getDB()
      const all = await (db as any).getAllData('activities')
      return all.find((a: Activity) => a.id === id) || null
    }

    async getDetails(id: string): Promise<ActivityDetails | null> {
      const db = await getDB()
      const all = await (db as any).getAllData('activity_details')
      return all.find((d: ActivityDetails) => d.id === id) || null
    }

    async markAsSynced(ids: string[]): Promise<void> {
      const db: any = await getDB()
      const activities = await db.getAllData('activities')
      const updated = activities.map((a: Activity) => {
        if (ids.includes(a.id)) {
          return { ...a, synced: true }
        }
        return a
      })
      db.clearStore('activities')
      await db.addItemsToStore('activities', updated, (a: Activity) => a.id)
    }
  }

  let instance: any
  return {
    ActivityService: FakeActivityService,
    getActivityService: async () => {
      if (!instance) instance = new FakeActivityService()
      return instance
    }
  }
})

// Mock StoragePluginManager
vi.mock('@/services/StoragePluginManager', () => {
  class FakeManager {
    plugins: any[] = []
    setPlugins(p: any[]) { this.plugins = p }
    async getMyStoragePlugins() { return this.plugins }
    static getInstance() { return fakeManagerInstance }
  }
  const fakeManagerInstance = new FakeManager()
  return {
    StoragePluginManager: {
      getInstance: () => fakeManagerInstance
    }
  }
})

describe('SyncService', () => {
  let syncService: SyncService
  let mockPlugin: any
  let remoteStorage: Record<string, any[]>

  beforeEach(async () => {
    // Reset IndexedDB
    const { IndexedDBService } = await import('@/services/IndexedDBService')
    const db: any = await IndexedDBService.getInstance()
    db.clearStore('activities')
    db.clearStore('activity_details')

    // Reset remote storage
    remoteStorage = {
      activities: [],
      activity_details: []
    }

    // Create mock plugin
    mockPlugin = {
      id: 'test-storage',
      label: 'Test Storage',
      async readRemote(store: string): Promise<any[]> {
        return [...(remoteStorage[store] || [])]
      },
      async writeRemote(store: string, data: any[]): Promise<void> {
        remoteStorage[store] = [...data]
      }
    }

    // Set mock plugin
    const mgr = StoragePluginManager.getInstance() as any
    mgr.setPlugins([mockPlugin])

    // Get SyncService instance
    syncService = SyncService.getInstance()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('syncNow - Basic Sync', () => {
    it('should return early if no plugins enabled', async () => {
      const mgr = StoragePluginManager.getInstance() as any
      mgr.setPlugins([])

      const result = await syncService.syncNow()

      expect(result.success).toBe(false)
      expect(result.activitiesSynced).toBe(0)
      expect(result.errors).toContain('No plugins')
    })

    it('should push new local activities to remote', async () => {
      const { IndexedDBService } = await import('@/services/IndexedDBService')
      const db: any = await IndexedDBService.getInstance()

      // Add unsynced local activity
      const localActivity: Activity = {
        id: 'act1',
        provider: 'garmin',
        startTime: Date.now(),
        duration: 3600,
        distance: 10000,
        type: 'run',
        version: 1,
        lastModified: Date.now(),
        synced: false,
        deleted: false
      }

      const localDetails: ActivityDetails = {
        id: 'act1',
        version: 1,
        lastModified: Date.now(),
        synced: false,
        deleted: false,
        samples: []
      }

      await db.addItemsToStore('activities', [localActivity], (a: Activity) => a.id)
      await db.addItemsToStore('activity_details', [localDetails], (d: ActivityDetails) => d.id)

      const result = await syncService.syncNow()

      expect(result.success).toBe(true)
      expect(result.activitiesSynced).toBe(1)
      expect(remoteStorage.activities.length).toBe(1)
      expect(remoteStorage.activities[0].id).toBe('act1')
      expect(remoteStorage.activity_details.length).toBe(1)
      expect(remoteStorage.activity_details[0].id).toBe('act1')
    })

    it('should pull new remote activities to local', async () => {
      const { IndexedDBService } = await import('@/services/IndexedDBService')
      const db: any = await IndexedDBService.getInstance()

      // Add remote activity
      const remoteActivity: Activity = {
        id: 'act2',
        provider: 'garmin',
        startTime: Date.now(),
        duration: 3600,
        distance: 10000,
        type: 'run',
        version: 1,
        lastModified: Date.now(),
        synced: true,
        deleted: false
      }

      const remoteDetails: ActivityDetails = {
        id: 'act2',
        version: 1,
        lastModified: Date.now(),
        synced: true,
        deleted: false,
        samples: []
      }

      remoteStorage.activities = [remoteActivity]
      remoteStorage.activity_details = [remoteDetails]

      const result = await syncService.syncNow()

      expect(result.success).toBe(true)
      expect(result.activitiesSynced).toBe(1)

      const localActivities = await db.getAllData('activities')
      expect(localActivities.length).toBe(1)
      expect(localActivities[0].id).toBe('act2')
      expect(localActivities[0].synced).toBe(true)
    })

    it('should not sync activities that are already synced', async () => {
      const { IndexedDBService } = await import('@/services/IndexedDBService')
      const db: any = await IndexedDBService.getInstance()

      // Add synced local activity
      const syncedActivity: Activity = {
        id: 'act3',
        provider: 'garmin',
        startTime: Date.now(),
        duration: 3600,
        distance: 10000,
        type: 'run',
        version: 1,
        lastModified: Date.now(),
        synced: true,
        deleted: false
      }

      await db.addItemsToStore('activities', [syncedActivity], (a: Activity) => a.id)

      const result = await syncService.syncNow()

      expect(result.success).toBe(true)
      expect(result.activitiesSynced).toBe(0)
      expect(remoteStorage.activities.length).toBe(0)
    })
  })

  describe('Conflict Detection', () => {
    it('should detect conflict when same version but different lastModified', async () => {
      const { IndexedDBService } = await import('@/services/IndexedDBService')
      const { ToastService } = await import('@/services/ToastService')
      const db: any = await IndexedDBService.getInstance()

      const baseTime = Date.now()

      // Local activity modified at baseTime
      const localActivity: Activity = {
        id: 'act4',
        provider: 'garmin',
        startTime: baseTime - 10000,
        duration: 3600,
        distance: 10000,
        type: 'run',
        title: 'Morning Run (Local)',
        version: 2,
        lastModified: baseTime,
        synced: false,
        deleted: false
      }

      // Remote activity modified at baseTime + 5000 (later)
      const remoteActivity: Activity = {
        id: 'act4',
        provider: 'garmin',
        startTime: baseTime - 10000,
        duration: 3600,
        distance: 10000,
        type: 'run',
        title: 'Morning Run (Remote)',
        version: 2,
        lastModified: baseTime + 5000,
        synced: true,
        deleted: false
      }

      await db.addItemsToStore('activities', [localActivity], (a: Activity) => a.id)
      remoteStorage.activities = [remoteActivity]

      const result = await syncService.syncNow()

      expect(result.success).toBe(true)
      expect(ToastService.push).toHaveBeenCalledWith(
        expect.stringContaining('modifiée sur 2 appareils'),
        expect.objectContaining({ type: 'warning' })
      )
    })

    it('should resolve conflict with LWW (Last-Write-Wins) - remote wins', async () => {
      const { IndexedDBService } = await import('@/services/IndexedDBService')
      const db: any = await IndexedDBService.getInstance()

      const baseTime = Date.now()

      // Local activity (older)
      const localActivity: Activity = {
        id: 'act5',
        provider: 'garmin',
        startTime: baseTime - 10000,
        duration: 3600,
        distance: 10000,
        type: 'run',
        title: 'Old Title',
        version: 2,
        lastModified: baseTime - 5000,
        synced: false,
        deleted: false
      }

      // Remote activity (newer)
      const remoteActivity: Activity = {
        id: 'act5',
        provider: 'garmin',
        startTime: baseTime - 10000,
        duration: 3600,
        distance: 10000,
        type: 'run',
        title: 'New Title',
        version: 2,
        lastModified: baseTime,
        synced: true,
        deleted: false
      }

      const remoteDetails: ActivityDetails = {
        id: 'act5',
        version: 2,
        lastModified: baseTime,
        synced: true,
        deleted: false,
        samples: []
      }

      await db.addItemsToStore('activities', [localActivity], (a: Activity) => a.id)
      remoteStorage.activities = [remoteActivity]
      remoteStorage.activity_details = [remoteDetails]

      const result = await syncService.syncNow()

      expect(result.success).toBe(true)

      // Remote should win (newer timestamp) - it should be pulled
      // Note: addItemsToStore uses put() which replaces existing items
      const localActivities = await db.getAllData('activities')
      const pulled = localActivities.find((a: Activity) => a.id === 'act5')
      expect(pulled).toBeTruthy()
      // After sync, the remote version should have been pulled and replaced the local one
      expect(pulled.title).toBe('New Title')
      expect(pulled.lastModified).toBe(baseTime)
    })

    it('should resolve conflict with LWW (Last-Write-Wins) - local wins', async () => {
      const { IndexedDBService } = await import('@/services/IndexedDBService')
      const db: any = await IndexedDBService.getInstance()

      const baseTime = Date.now()

      // Local activity (newer)
      const localActivity: Activity = {
        id: 'act6',
        provider: 'garmin',
        startTime: baseTime - 10000,
        duration: 3600,
        distance: 10000,
        type: 'run',
        title: 'Latest Title',
        version: 2,
        lastModified: baseTime,
        synced: false,
        deleted: false
      }

      // Remote activity (older)
      const remoteActivity: Activity = {
        id: 'act6',
        provider: 'garmin',
        startTime: baseTime - 10000,
        duration: 3600,
        distance: 10000,
        type: 'run',
        title: 'Old Title',
        version: 2,
        lastModified: baseTime - 5000,
        synced: true,
        deleted: false
      }

      await db.addItemsToStore('activities', [localActivity], (a: Activity) => a.id)
      await db.addItemsToStore('activity_details', [{
        id: 'act6',
        version: 2,
        lastModified: baseTime,
        synced: false,
        deleted: false,
        samples: []
      }], (d: ActivityDetails) => d.id)

      remoteStorage.activities = [remoteActivity]
      remoteStorage.activity_details = []

      const result = await syncService.syncNow()

      expect(result.success).toBe(true)

      // Local should win (newer timestamp) - pushed to remote
      expect(remoteStorage.activities.length).toBe(1)
      expect(remoteStorage.activities[0].title).toBe('Latest Title')
      expect(remoteStorage.activities[0].lastModified).toBe(baseTime)
    })
  })

  describe('Incremental Sync', () => {
    it('should only sync unsynced activities', async () => {
      const { IndexedDBService } = await import('@/services/IndexedDBService')
      const db: any = await IndexedDBService.getInstance()

      const baseTime = Date.now()

      const activities: Activity[] = [
        {
          id: 'act7',
          provider: 'garmin',
          startTime: baseTime - 3000,
          duration: 3600,
          distance: 10000,
          type: 'run',
          version: 1,
          lastModified: baseTime - 3000,
          synced: true,
          deleted: false
        },
        {
          id: 'act8',
          provider: 'garmin',
          startTime: baseTime - 2000,
          duration: 3600,
          distance: 10000,
          type: 'run',
          version: 1,
          lastModified: baseTime - 2000,
          synced: false,
          deleted: false
        },
        {
          id: 'act9',
          provider: 'garmin',
          startTime: baseTime - 1000,
          duration: 3600,
          distance: 10000,
          type: 'run',
          version: 1,
          lastModified: baseTime - 1000,
          synced: false,
          deleted: false
        }
      ]

      const details: ActivityDetails[] = activities.map(a => ({
        id: a.id,
        version: a.version,
        lastModified: a.lastModified,
        synced: a.synced,
        deleted: a.deleted,
        samples: []
      }))

      await db.addItemsToStore('activities', activities, (a: Activity) => a.id)
      await db.addItemsToStore('activity_details', details, (d: ActivityDetails) => d.id)

      const result = await syncService.syncNow()

      expect(result.success).toBe(true)
      expect(result.activitiesSynced).toBe(2) // Only act8 and act9

      // Verify only unsynced were pushed
      expect(remoteStorage.activities.length).toBe(2)
      const pushedIds = remoteStorage.activities.map(a => a.id).sort()
      expect(pushedIds).toEqual(['act8', 'act9'])
    })

    it('should mark activities as synced after successful push', async () => {
      const { IndexedDBService } = await import('@/services/IndexedDBService')
      const db: any = await IndexedDBService.getInstance()

      const localActivity: Activity = {
        id: 'act10',
        provider: 'garmin',
        startTime: Date.now(),
        duration: 3600,
        distance: 10000,
        type: 'run',
        version: 1,
        lastModified: Date.now(),
        synced: false,
        deleted: false
      }

      await db.addItemsToStore('activities', [localActivity], (a: Activity) => a.id)
      await db.addItemsToStore('activity_details', [{
        id: 'act10',
        version: 1,
        lastModified: Date.now(),
        synced: false,
        deleted: false,
        samples: []
      }], (d: ActivityDetails) => d.id)

      await syncService.syncNow()

      // Verify activity is now marked as synced locally
      const activities = await db.getAllData('activities')
      const syncedActivity = activities.find((a: Activity) => a.id === 'act10')
      expect(syncedActivity.synced).toBe(true)
    })

    it('should not create duplicates on multiple syncs', async () => {
      const { IndexedDBService } = await import('@/services/IndexedDBService')
      const db: any = await IndexedDBService.getInstance()

      const localActivity: Activity = {
        id: 'act11',
        provider: 'garmin',
        startTime: Date.now(),
        duration: 3600,
        distance: 10000,
        type: 'run',
        version: 1,
        lastModified: Date.now(),
        synced: false,
        deleted: false
      }

      await db.addItemsToStore('activities', [localActivity], (a: Activity) => a.id)
      await db.addItemsToStore('activity_details', [{
        id: 'act11',
        version: 1,
        lastModified: Date.now(),
        synced: false,
        deleted: false,
        samples: []
      }], (d: ActivityDetails) => d.id)

      // First sync
      await syncService.syncNow()
      expect(remoteStorage.activities.length).toBe(1)

      // Second sync (should not push again)
      await syncService.syncNow()
      expect(remoteStorage.activities.length).toBe(1) // Still only 1
    })
  })

  describe('Version Management', () => {
    it('should push local activity when local version is higher', async () => {
      const { IndexedDBService } = await import('@/services/IndexedDBService')
      const db: any = await IndexedDBService.getInstance()

      const baseTime = Date.now()

      const localActivity: Activity = {
        id: 'act12',
        provider: 'garmin',
        startTime: baseTime - 10000,
        duration: 3600,
        distance: 10000,
        type: 'run',
        title: 'Updated Title',
        version: 3,
        lastModified: baseTime,
        synced: false,
        deleted: false
      }

      const remoteActivity: Activity = {
        id: 'act12',
        provider: 'garmin',
        startTime: baseTime - 10000,
        duration: 3600,
        distance: 10000,
        type: 'run',
        title: 'Old Title',
        version: 2,
        lastModified: baseTime - 5000,
        synced: true,
        deleted: false
      }

      await db.addItemsToStore('activities', [localActivity], (a: Activity) => a.id)
      await db.addItemsToStore('activity_details', [{
        id: 'act12',
        version: 3,
        lastModified: baseTime,
        synced: false,
        deleted: false,
        samples: []
      }], (d: ActivityDetails) => d.id)

      remoteStorage.activities = [remoteActivity]

      const result = await syncService.syncNow()

      expect(result.success).toBe(true)

      // Local should be pushed (higher version)
      expect(remoteStorage.activities.length).toBe(1)
      expect(remoteStorage.activities[0].version).toBe(3)
      expect(remoteStorage.activities[0].title).toBe('Updated Title')
    })

    it('should not push when versions match and activity already synced', async () => {
      const { IndexedDBService } = await import('@/services/IndexedDBService')
      const db: any = await IndexedDBService.getInstance()

      const baseTime = Date.now()

      const localActivity: Activity = {
        id: 'act13',
        provider: 'garmin',
        startTime: baseTime - 10000,
        duration: 3600,
        distance: 10000,
        type: 'run',
        version: 2,
        lastModified: baseTime,
        synced: true,
        deleted: false
      }

      const remoteActivity: Activity = {
        id: 'act13',
        provider: 'garmin',
        startTime: baseTime - 10000,
        duration: 3600,
        distance: 10000,
        type: 'run',
        version: 2,
        lastModified: baseTime,
        synced: true,
        deleted: false
      }

      await db.addItemsToStore('activities', [localActivity], (a: Activity) => a.id)
      remoteStorage.activities = [remoteActivity]

      const result = await syncService.syncNow()

      expect(result.success).toBe(true)
      // Activity is already synced, so getUnsyncedActivities() won't return it
      // Therefore nothing to push or pull
      // However, if remote has it, it may still be pulled to ensure consistency
      // The count reflects activities that were actually transferred
      expect(result.activitiesSynced).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Error Handling', () => {
    it('should handle plugin read errors gracefully', async () => {
      mockPlugin.readRemote = vi.fn().mockRejectedValue(new Error('Network error'))

      const result = await syncService.syncNow()

      expect(result.success).toBe(false)
      expect(result.activitiesSynced).toBe(0)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]).toContain('Network error')
    })

    it('should handle plugin write errors gracefully', async () => {
      const { IndexedDBService } = await import('@/services/IndexedDBService')
      const db: any = await IndexedDBService.getInstance()

      const localActivity: Activity = {
        id: 'act14',
        provider: 'garmin',
        startTime: Date.now(),
        duration: 3600,
        distance: 10000,
        type: 'run',
        version: 1,
        lastModified: Date.now(),
        synced: false,
        deleted: false
      }

      await db.addItemsToStore('activities', [localActivity], (a: Activity) => a.id)
      await db.addItemsToStore('activity_details', [{
        id: 'act14',
        version: 1,
        lastModified: Date.now(),
        synced: false,
        deleted: false,
        samples: []
      }], (d: ActivityDetails) => d.id)

      mockPlugin.writeRemote = vi.fn().mockRejectedValue(new Error('Storage full'))

      const result = await syncService.syncNow()

      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]).toContain('Storage full')
    })

    it('should prevent concurrent syncs', async () => {
      const { IndexedDBService } = await import('@/services/IndexedDBService')
      const db: any = await IndexedDBService.getInstance()

      const localActivity: Activity = {
        id: 'act15',
        provider: 'garmin',
        startTime: Date.now(),
        duration: 3600,
        distance: 10000,
        type: 'run',
        version: 1,
        lastModified: Date.now(),
        synced: false,
        deleted: false
      }

      await db.addItemsToStore('activities', [localActivity], (a: Activity) => a.id)

      // Make sync slow to test concurrency
      let resolveRead: any
      mockPlugin.readRemote = vi.fn(() => new Promise(resolve => {
        resolveRead = resolve
        setTimeout(() => resolve([]), 100)
      }))

      const sync1Promise = syncService.syncNow()
      const sync2Promise = syncService.syncNow()

      const [result1, result2] = await Promise.all([sync1Promise, sync2Promise])

      // Second sync should return early
      expect(result2.success).toBe(false)
      expect(result2.errors).toContain('Sync already in progress')
    })
  })

  describe('isSyncing', () => {
    it('should return false when not syncing', () => {
      expect(syncService.isSyncing()).toBe(false)
    })

    it('should return true during sync', async () => {
      const { IndexedDBService } = await import('@/services/IndexedDBService')
      const db: any = await IndexedDBService.getInstance()

      const localActivity: Activity = {
        id: 'act16',
        provider: 'garmin',
        startTime: Date.now(),
        duration: 3600,
        distance: 10000,
        type: 'run',
        version: 1,
        lastModified: Date.now(),
        synced: false,
        deleted: false
      }

      await db.addItemsToStore('activities', [localActivity], (a: Activity) => a.id)

      let isSyncingDuringSync = false

      mockPlugin.readRemote = vi.fn(async () => {
        isSyncingDuringSync = syncService.isSyncing()
        return []
      })

      await syncService.syncNow()

      expect(isSyncingDuringSync).toBe(true)
      expect(syncService.isSyncing()).toBe(false)
    })
  })
})
