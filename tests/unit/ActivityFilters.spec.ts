import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ActivityService } from '@/services/ActivityService'
import { createActivity, createActivityDetails } from '../fixtures/activities'

// Mock IndexedDBService — same pattern as ActivityService.spec.ts
vi.mock('@/services/IndexedDBService', () => {
  class FakeDB {
    public db: any
    private stores: Record<string, any[]> = {
      activities: [],
      activity_details: []
    }
    public emitter = new EventTarget()

    constructor() {
      this.db = {
        transaction: (storeNames: string[], mode: IDBTransactionMode) => {
          return this.getMockTransaction(storeNames, mode)
        }
      }
    }

    getIDB() {
      return this.db
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

    reset() {
      this.stores = {
        activities: [],
        activity_details: []
      }
    }

    getMockTransaction(storeNames: string[], _mode: IDBTransactionMode) {
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
            const storeData = this.stores[name] || []
            const existing = storeData.findIndex((i: any) => i.id === item.id)
            if (existing >= 0) {
              storeData[existing] = item
            } else {
              storeData.push(item)
            }
            this.stores[name] = storeData
          }),
          get: vi.fn((id: string) => {
            pendingOps++
            const storeData = this.stores[name] || []
            const item = storeData.find((i: any) => i.id === id)
            const req = {
              result: item,
              onsuccess: null as any
            }
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

      setTimeout(() => checkComplete(tx), 1)

      return tx
    }
  }

  return {
    IndexedDBService: FakeDB
  }
})

describe('ActivityService - Filters', () => {
  let service: ActivityService
  let db: any

  beforeEach(async () => {
    ;(ActivityService as any).instance = null
    service = await ActivityService.getInstance()
    db = (service as any).db
    db.reset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  async function seedActivities() {
    const activities = [
      createActivity({
        id: '1',
        title: 'Morning Run',
        type: 'run',
        distance: 5000,
        startTime: new Date('2026-01-15T08:00:00Z').getTime()
      }),
      createActivity({
        id: '2',
        title: 'Evening Bike Ride',
        type: 'bike',
        distance: 25000,
        startTime: new Date('2026-01-14T18:00:00Z').getTime()
      }),
      createActivity({
        id: '3',
        title: 'Long Run',
        type: 'run',
        distance: 15000,
        startTime: new Date('2026-01-13T07:00:00Z').getTime()
      }),
      createActivity({
        id: '4',
        title: 'Quick Swim',
        type: 'swim',
        distance: 1500,
        startTime: new Date('2026-01-12T12:00:00Z').getTime()
      }),
      createActivity({
        id: '5',
        title: 'Hill Hike',
        type: 'hike',
        distance: 8000,
        startTime: new Date('2026-01-11T09:00:00Z').getTime()
      })
    ]
    const details = activities.map(a => createActivityDetails(a.id))
    await service.saveActivitiesWithDetails(activities, details)
  }

  describe('text filter', () => {
    it('should filter by title text (case insensitive)', async () => {
      await seedActivities()
      const results = await service.getActivities({
        limit: 20,
        filters: { text: 'run' }
      })
      expect(results).toHaveLength(2)
      expect(results.every(a => a.title?.toLowerCase().includes('run'))).toBe(true)
    })

    it('should return empty when no title matches', async () => {
      await seedActivities()
      const results = await service.getActivities({
        limit: 20,
        filters: { text: 'yoga session' }
      })
      expect(results).toHaveLength(0)
    })
  })

  describe('sport type filter', () => {
    it('should filter by sport type', async () => {
      await seedActivities()
      const results = await service.getActivities({
        limit: 20,
        filters: { sportType: 'run' }
      })
      expect(results).toHaveLength(2)
      expect(results.every(a => a.type === 'run')).toBe(true)
    })

    it('should be case insensitive', async () => {
      await seedActivities()
      const results = await service.getActivities({
        limit: 20,
        filters: { sportType: 'RUN' }
      })
      expect(results).toHaveLength(2)
    })
  })

  describe('distance filter', () => {
    it('should filter by minimum distance', async () => {
      await seedActivities()
      const results = await service.getActivities({
        limit: 20,
        filters: { distanceMin: 10000 }
      })
      expect(results).toHaveLength(2)
      expect(results.every(a => a.distance >= 10000)).toBe(true)
    })

    it('should filter by maximum distance', async () => {
      await seedActivities()
      const results = await service.getActivities({
        limit: 20,
        filters: { distanceMax: 5000 }
      })
      expect(results).toHaveLength(2)
      expect(results.every(a => a.distance <= 5000)).toBe(true)
    })

    it('should filter by distance range', async () => {
      await seedActivities()
      const results = await service.getActivities({
        limit: 20,
        filters: { distanceMin: 5000, distanceMax: 15000 }
      })
      expect(results).toHaveLength(3)
      expect(results.every(a => a.distance >= 5000 && a.distance <= 15000)).toBe(true)
    })
  })

  describe('combined filters', () => {
    it('should combine text and sport type filters (AND)', async () => {
      await seedActivities()
      const results = await service.getActivities({
        limit: 20,
        filters: { text: 'morning', sportType: 'run' }
      })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('1')
    })

    it('should combine sport type and distance filters', async () => {
      await seedActivities()
      const results = await service.getActivities({
        limit: 20,
        filters: { sportType: 'run', distanceMin: 10000 }
      })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('3')
    })
  })

  describe('countActivities', () => {
    it('should return total count without filters', async () => {
      await seedActivities()
      const count = await service.countActivities()
      expect(count).toBe(5)
    })

    it('should return filtered count', async () => {
      await seedActivities()
      const count = await service.countActivities({ sportType: 'run' })
      expect(count).toBe(2)
    })
  })

  describe('filters with pagination', () => {
    it('should paginate filtered results', async () => {
      await seedActivities()
      const page1 = await service.getActivities({
        offset: 0,
        limit: 1,
        filters: { sportType: 'run' }
      })
      const page2 = await service.getActivities({
        offset: 1,
        limit: 1,
        filters: { sportType: 'run' }
      })
      expect(page1).toHaveLength(1)
      expect(page2).toHaveLength(1)
      expect(page1[0].id).not.toBe(page2[0].id)
    })
  })

  describe('empty filters', () => {
    it('should return all activities when filters are empty', async () => {
      await seedActivities()
      const results = await service.getActivities({
        limit: 20,
        filters: {}
      })
      expect(results).toHaveLength(5)
    })

    it('should return all activities when filters is undefined', async () => {
      await seedActivities()
      const results = await service.getActivities({ limit: 20 })
      expect(results).toHaveLength(5)
    })
  })

  describe('date filter', () => {
    // A local instant, the way `fromDayKey` builds one from the panel.
    const day = (iso: string, bound: 'start' | 'end' = 'start') => {
      const [y, m, d] = iso.split('-').map(Number)
      return bound === 'start'
        ? new Date(y, m - 1, d, 0, 0, 0, 0).getTime()
        : new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
    }

    it('keeps activities from a date onwards', async () => {
      await seedActivities()
      const results = await service.getActivities({
        limit: 20,
        filters: { dateFrom: day('2026-01-14') }
      })
      expect(results.map(a => a.id).sort()).toEqual(['1', '2'])
    })

    it('keeps activities up to a date', async () => {
      await seedActivities()
      const results = await service.getActivities({
        limit: 20,
        filters: { dateTo: day('2026-01-12', 'end') }
      })
      expect(results.map(a => a.id).sort()).toEqual(['4', '5'])
    })

    // The bound lands on the edge of the day, so a one-day range is not empty.
    it('keeps a single day inclusive at both ends', async () => {
      await seedActivities()
      const results = await service.getActivities({
        limit: 20,
        filters: { dateFrom: day('2026-01-13'), dateTo: day('2026-01-13', 'end') }
      })
      expect(results.map(a => a.id)).toEqual(['3'])
    })

    // Providers disagree on the unit; an activity stored in seconds would sit
    // in 1970 and fall out of every range.
    it('reads a timestamp stored in seconds', async () => {
      const seconds = Math.floor(new Date('2026-01-15T08:00:00Z').getTime() / 1000)
      const activity = createActivity({ id: 'sec', startTime: seconds })
      await service.saveActivitiesWithDetails([activity], [createActivityDetails('sec')])

      const results = await service.getActivities({
        limit: 20,
        filters: { dateFrom: day('2026-01-01') }
      })
      expect(results.map(a => a.id)).toContain('sec')
    })
  })

  describe('duration filter', () => {
    async function seedDurations() {
      const activities = [
        createActivity({ id: 'short', duration: 600, type: 'swimming' }),
        createActivity({ id: 'medium', duration: 3600, type: 'running' }),
        createActivity({ id: 'long', duration: 14400, type: 'cycling' })
      ]
      await service.saveActivitiesWithDetails(
        activities,
        activities.map(a => createActivityDetails(a.id))
      )
    }

    it('filters by minimum duration', async () => {
      await seedDurations()
      const results = await service.getActivities({ limit: 20, filters: { durationMin: 3600 } })
      expect(results.map(a => a.id).sort()).toEqual(['long', 'medium'])
    })

    it('filters by maximum duration', async () => {
      await seedDurations()
      const results = await service.getActivities({ limit: 20, filters: { durationMax: 3600 } })
      expect(results.map(a => a.id).sort()).toEqual(['medium', 'short'])
    })

    // The point of the range: a pool set carries no distance, so duration is
    // the only volume it can be narrowed by.
    it('narrows a sport that has no distance', async () => {
      const swim = createActivity({ id: 'pool', type: 'swimming', distance: 0, duration: 2700 })
      await service.saveActivitiesWithDetails([swim], [createActivityDetails('pool')])

      const results = await service.getActivities({
        limit: 20,
        filters: { sportType: 'swimming', durationMin: 1800 }
      })
      expect(results.map(a => a.id)).toEqual(['pool'])
    })

    it('counts the same set it returns', async () => {
      await seedDurations()
      expect(await service.countActivities({ durationMin: 3600 })).toBe(2)
    })
  })

  describe('getFilterFacets', () => {
    it('lists each sport present once', async () => {
      await seedActivities()
      const { sports } = await service.getFilterFacets()
      expect(sports.sort()).toEqual(['bike', 'hike', 'run', 'swim'])
    })

    // Legacy activities carry raw provider strings, so the chips would
    // otherwise offer "RUNNING" and "running" as two separate sports.
    it('folds provider casing into one entry', async () => {
      const activities = [
        createActivity({ id: 'a', type: 'RUNNING' }),
        createActivity({ id: 'b', type: 'running' })
      ]
      await service.saveActivitiesWithDetails(
        activities,
        activities.map(a => createActivityDetails(a.id))
      )
      expect((await service.getFilterFacets()).sports).toEqual(['running'])
    })

    it('ignores deleted activities', async () => {
      await seedActivities()
      await service.deleteActivity('2') // the only bike ride
      expect((await service.getFilterFacets()).sports.sort()).toEqual(['hike', 'run', 'swim'])
    })

    it('reports a distance to narrow when the library holds one', async () => {
      await seedActivities()
      expect((await service.getFilterFacets()).hasDistance).toBe(true)
    })

    // A pool-and-gym library has nothing for a distance range to ask about.
    it('reports none when nothing was measured in distance', async () => {
      const activities = [
        createActivity({ id: 'pool', type: 'swimming', distance: 0 }),
        createActivity({ id: 'gym', type: 'strength', distance: 0 })
      ]
      await service.saveActivitiesWithDetails(
        activities,
        activities.map(a => createActivityDetails(a.id))
      )
      expect((await service.getFilterFacets()).hasDistance).toBe(false)
    })
  })
})
