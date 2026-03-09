import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createFriend,
  createPublicManifest,
  createYearActivities,
  createFriendActivity
} from '../fixtures/activities'

// ---------- Mocks ----------

// In-memory IndexedDB mock
class FakeDB {
  stores: Record<string, any[]> = {
    friends: [],
    friend_activities: [],
    settings: []
  }

  async getInstance() {
    return this
  }

  async getAllData<T = any>(store: string): Promise<T[]> {
    return [...(this.stores[store] || [])] as T[]
  }

  async getDataFromStore(store: string, key: string) {
    return (this.stores[store] || []).find((item: any) => item.id === key) || null
  }

  async addItemsToStore(store: string, items: any[], keyFn?: (item: any) => any) {
    const existing = this.stores[store] || []
    const extractor = keyFn || ((item: any) => item.id)
    for (const item of items) {
      const key = extractor(item)
      const idx = existing.findIndex((e: any) => extractor(e) === key)
      if (idx >= 0) existing[idx] = item
      else existing.push(item)
    }
    this.stores[store] = existing
  }

  async deleteFromStore(store: string, key: string) {
    this.stores[store] = (this.stores[store] || []).filter((i: any) => i.id !== key)
  }

  async deleteMultipleFromStore(store: string, keys: string[]) {
    const keySet = new Set(keys)
    this.stores[store] = (this.stores[store] || []).filter((i: any) => !keySet.has(i.id))
  }

  async saveData(key: string, value: any) {
    const settings = this.stores['settings'] || []
    const idx = settings.findIndex((i: any) => i.key === key)
    if (idx >= 0) settings[idx] = { key, value }
    else settings.push({ key, value })
    this.stores['settings'] = settings
  }

  async getData(key: string) {
    const item = this.stores['settings']?.find((i: any) => i.key === key)
    return item?.value ?? null
  }
}

const fakeDB = new FakeDB()

vi.mock('@/services/IndexedDBService', () => ({
  IndexedDBService: {
    getInstance: () => Promise.resolve(fakeDB)
  }
}))

// Mock PublicDataService
const mockGenerateAllPublicData = vi.fn()
vi.mock('@/services/PublicDataService', () => ({
  PublicDataService: {
    getInstance: () => ({
      generateAllPublicData: mockGenerateAllPublicData
    })
  }
}))

// Mock PublicFileService
const mockWritePublicFile = vi.fn()
const mockExtractFileId = vi.fn((url: string) => url.split('id=')[1]?.split('&')[0] || null)
const mockDeleteFile = vi.fn()
vi.mock('@/services/PublicFileService', () => ({
  PublicFileService: {
    getInstance: () => ({
      writePublicFile: mockWritePublicFile,
      extractFileIdFromUrl: mockExtractFileId,
      deleteFile: mockDeleteFile
    })
  }
}))

// Mock ShareUrlService
vi.mock('@/services/ShareUrlService', () => ({
  ShareUrlService: {
    wrapManifestUrl: (url: string) => `https://openstride.org/add-friend?url=${encodeURIComponent(url)}`,
    unwrapManifestUrl: (url: string) => {
      const match = url.match(/url=([^&]+)/)
      return match ? decodeURIComponent(match[1]) : null
    },
    isShareUrl: (url: string) => url.includes('add-friend?url=')
  }
}))

// Mock GoogleDriveApiService
const mockFetchJsonFromUrl = vi.fn()
vi.mock('@/services/GoogleDriveApiService', () => ({
  GoogleDriveApiService: {
    getInstance: () => ({
      isGoogleDriveUrl: (url: string) => url.includes('drive.google.com'),
      fetchJsonFromUrl: mockFetchJsonFromUrl
    })
  }
}))

// Mock InteractionSyncService
vi.mock('@/services/InteractionSyncService', () => ({
  getInteractionSyncService: () => ({
    publishInteractions: vi.fn().mockResolvedValue({ success: true, interactionsSynced: 0 }),
    getInteractionYearsForManifest: vi.fn().mockResolvedValue([]),
    syncAllFriendsInteractions: vi.fn().mockResolvedValue([])
  })
}))

// Mock InteractionService
vi.mock('@/services/InteractionService', () => ({
  getInteractionService: () => ({
    getMyUserId: vi.fn().mockResolvedValue('my-user-id')
  })
}))

// Mock crypto.subtle for generateFriendId
const mockDigest = vi.fn().mockResolvedValue(new Uint8Array(32).buffer)
vi.stubGlobal('crypto', {
  subtle: { digest: mockDigest }
})

import { FriendService } from '@/services/FriendService'

// ---------- Tests ----------

describe('FriendService', () => {
  let service: FriendService

  beforeEach(() => {
    vi.clearAllMocks()
    fakeDB.stores = {
      friends: [],
      friend_activities: [],
      settings: []
    }
    ;(FriendService as any).instance = undefined
    service = FriendService.getInstance()
  })

  // ============================
  // publishPublicData
  // ============================
  describe('publishPublicData', () => {
    it('publishes manifest + year files and returns share URL', async () => {
      const manifest = createPublicManifest()
      const yearFiles = new Map([[2026, createYearActivities(2026, 5)]])

      mockGenerateAllPublicData.mockResolvedValue({ manifest, yearFiles })
      mockWritePublicFile
        .mockResolvedValueOnce('https://drive.google.com/uc?id=year-2026&export=download')
        .mockResolvedValueOnce('https://drive.google.com/uc?id=manifest-1&export=download')

      const url = await service.publishPublicData()

      expect(url).toContain('add-friend?url=')
      expect(mockWritePublicFile).toHaveBeenCalledTimes(2) // 1 year + manifest
      expect(mockWritePublicFile).toHaveBeenCalledWith('activities-2026.json', expect.any(Object))
      expect(mockWritePublicFile).toHaveBeenCalledWith('manifest.json', expect.any(Object))
    })

    it('rolls back uploaded files when a year file upload fails', async () => {
      const manifest = createPublicManifest()
      const yearFiles = new Map([
        [2025, createYearActivities(2025, 3)],
        [2026, createYearActivities(2026, 5)]
      ])

      mockGenerateAllPublicData.mockResolvedValue({ manifest, yearFiles })
      mockWritePublicFile
        .mockResolvedValueOnce('https://drive.google.com/uc?id=year-2025&export=download')
        .mockResolvedValueOnce(null) // 2026 fails

      const events: any[] = []
      service.emitter.addEventListener('friend-event', (e: Event) =>
        events.push((e as CustomEvent).detail)
      )

      const url = await service.publishPublicData()

      expect(url).toBeNull()
      expect(mockDeleteFile).toHaveBeenCalled() // rollback
      expect(events.some((e) => e.type === 'publish-error')).toBe(true)
    })

    it('rolls back when manifest upload fails', async () => {
      const manifest = createPublicManifest()
      const yearFiles = new Map([[2026, createYearActivities(2026)]])

      mockGenerateAllPublicData.mockResolvedValue({ manifest, yearFiles })
      mockWritePublicFile
        .mockResolvedValueOnce('https://drive.google.com/uc?id=year-2026&export=download')
        .mockResolvedValueOnce(null) // manifest fails

      const url = await service.publishPublicData()

      expect(url).toBeNull()
      expect(mockDeleteFile).toHaveBeenCalled()
    })

    it('emits publish-completed event on success', async () => {
      const manifest = createPublicManifest({ availableYears: [] })
      mockGenerateAllPublicData.mockResolvedValue({ manifest, yearFiles: new Map() })
      mockWritePublicFile.mockResolvedValue('https://drive.google.com/uc?id=m&export=download')

      const events: any[] = []
      service.emitter.addEventListener('friend-event', (e: Event) =>
        events.push((e as CustomEvent).detail)
      )

      await service.publishPublicData()

      expect(events.some((e) => e.type === 'publish-completed')).toBe(true)
    })
  })

  // ============================
  // addFriendByUrl
  // ============================
  describe('addFriendByUrl', () => {
    it('adds a friend from a manifest URL', async () => {
      const manifest = createPublicManifest({
        profile: { username: 'Alice', bio: 'Runner', userId: 'alice-id' }
      })
      // fetchManifest uses fetchJson which uses GoogleDriveApiService
      mockFetchJsonFromUrl.mockResolvedValue(manifest)

      const friend = await service.addFriendByUrl(
        'https://drive.google.com/uc?id=manifest-alice&export=download'
      )

      expect(friend).not.toBeNull()
      expect(friend!.username).toBe('Alice')
      expect(fakeDB.stores.friends).toHaveLength(1)
    })

    it('returns existing friend if already added', async () => {
      // The hash of all-zeros produces 'friend_000000000000'
      const existingFriend = createFriend({ id: 'friend_000000000000', username: 'Bob' })
      // Also set publicUrl to the same manifest URL so collision check passes
      existingFriend.publicUrl = 'https://drive.google.com/uc?id=manifest-bob&export=download'
      fakeDB.stores.friends = [existingFriend]

      // Mock crypto to produce all-zeros hash → 'friend_000000000000'
      mockDigest.mockResolvedValueOnce(new Uint8Array(32).buffer)

      const manifest = createPublicManifest({ profile: { username: 'Bob', bio: '' } })
      mockFetchJsonFromUrl.mockResolvedValue(manifest)

      const events: any[] = []
      service.emitter.addEventListener('friend-event', (e: Event) =>
        events.push((e as CustomEvent).detail)
      )

      const friend = await service.addFriendByUrl(
        'https://drive.google.com/uc?id=manifest-bob&export=download'
      )

      expect(friend).not.toBeNull()
      expect(friend!.username).toBe('Bob')
      expect(events.some((e) => e.type === 'friend-error' && e.message.includes('déjà ajouté'))).toBe(
        true
      )
    })

    it('emits error when manifest cannot be fetched', async () => {
      mockFetchJsonFromUrl.mockResolvedValue(null)

      const events: any[] = []
      service.emitter.addEventListener('friend-event', (e: Event) =>
        events.push((e as CustomEvent).detail)
      )

      const friend = await service.addFriendByUrl(
        'https://drive.google.com/uc?id=bad&export=download'
      )

      expect(friend).toBeNull()
      expect(events.some((e) => e.type === 'friend-error')).toBe(true)
    })

    it('unwraps share URLs before fetching manifest', async () => {
      const manifest = createPublicManifest({
        profile: { username: 'Carol', bio: '', userId: 'carol-id' }
      })
      mockFetchJsonFromUrl.mockResolvedValue(manifest)

      const shareUrl =
        'https://openstride.org/add-friend?url=' +
        encodeURIComponent('https://drive.google.com/uc?id=manifest-carol&export=download')

      const friend = await service.addFriendByUrl(shareUrl)

      expect(friend).not.toBeNull()
      expect(friend!.username).toBe('Carol')
    })
  })

  // ============================
  // removeFriend
  // ============================
  describe('removeFriend', () => {
    it('removes friend and their activities', async () => {
      fakeDB.stores.friends = [createFriend({ id: 'f1' })]
      fakeDB.stores.friend_activities = [
        createFriendActivity('f1', 'a1', { id: 'f1_a1_2026' }),
        createFriendActivity('f1', 'a2', { id: 'f1_a2_2026' }),
        createFriendActivity('f2', 'a3', { id: 'f2_a3_2026' }) // other friend
      ]

      await service.removeFriend('f1')

      expect(fakeDB.stores.friends).toHaveLength(0)
      // Only f2's activity remains
      expect(fakeDB.stores.friend_activities).toHaveLength(1)
      expect(fakeDB.stores.friend_activities[0].id).toBe('f2_a3_2026')
    })

    it('emits friend-removed event', async () => {
      fakeDB.stores.friends = [createFriend({ id: 'f1' })]

      const events: any[] = []
      service.emitter.addEventListener('friend-event', (e: Event) =>
        events.push((e as CustomEvent).detail)
      )

      await service.removeFriend('f1')

      expect(events.some((e) => e.type === 'friend-removed')).toBe(true)
    })
  })

  // ============================
  // syncFriendActivitiesQuick
  // ============================
  describe('syncFriendActivitiesQuick', () => {
    it('fetches recent activities from friend manifest and stores them', async () => {
      const friend = createFriend({ id: 'f1', publicUrl: 'https://drive.google.com/uc?id=m1' })
      fakeDB.stores.friends = [friend]

      const manifest = createPublicManifest({
        profile: { username: 'Alice', bio: '', userId: 'alice-id' }
      })
      const yearData = createYearActivities(2026, 3)

      mockFetchJsonFromUrl
        .mockResolvedValueOnce(manifest) // fetchManifest
        .mockResolvedValueOnce(yearData) // fetchYearActivities (2026)
        .mockResolvedValueOnce(createYearActivities(2025, 2)) // fetchYearActivities (2025)

      const result = await service.syncFriendActivitiesQuick('f1', 30)

      expect(result.success).toBe(true)
      expect(result.activitiesAdded).toBe(5) // 3 from 2026 + 2 from 2025
      expect(fakeDB.stores.friend_activities).toHaveLength(5)
    })

    it('deduplicates activities already in store', async () => {
      const friend = createFriend({ id: 'f1', publicUrl: 'https://drive.google.com/uc?id=m1' })
      fakeDB.stores.friends = [friend]

      // Pre-existing activity with same startTime
      const existingActivity = createFriendActivity('f1', 'activity-1', {
        id: 'f1_activity-1_2026',
        startTime: new Date(2026, 0, 1).getTime()
      })
      fakeDB.stores.friend_activities = [existingActivity]

      const manifest = createPublicManifest({
        profile: { username: 'Alice', bio: '', userId: 'alice-id' }
      })
      const yearData = createYearActivities(2026, 3) // includes activity with startTime Jan 1

      mockFetchJsonFromUrl
        .mockResolvedValueOnce(manifest)
        .mockResolvedValueOnce(yearData)
        .mockResolvedValueOnce({ activities: [] })

      const result = await service.syncFriendActivitiesQuick('f1', 30)

      // 1 was duplicate (same startTime), 2 are new
      expect(result.activitiesAdded).toBe(2)
    })

    it('returns error when friend not found', async () => {
      const result = await service.syncFriendActivitiesQuick('nonexistent', 30)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Friend not found')
    })

    it('returns error when manifest fetch fails', async () => {
      fakeDB.stores.friends = [createFriend({ id: 'f1', publicUrl: 'https://drive.google.com/bad' })]
      mockFetchJsonFromUrl.mockResolvedValue(null)

      const result = await service.syncFriendActivitiesQuick('f1', 30)

      expect(result.success).toBe(false)
      expect(result.error).toContain('manifest')
    })
  })

  // ============================
  // deduplicateFriendActivities
  // ============================
  describe('deduplicateFriendActivities', () => {
    it('removes duplicates keeping most recent fetchedAt', async () => {
      fakeDB.stores.friend_activities = [
        createFriendActivity('f1', 'a1', {
          id: 'f1_a1_old',
          startTime: 1000,
          fetchedAt: 100
        }),
        createFriendActivity('f1', 'a2', {
          id: 'f1_a1_new',
          startTime: 1000,
          fetchedAt: 200
        }),
        createFriendActivity('f1', 'a3', {
          id: 'f1_a3_unique',
          startTime: 2000,
          fetchedAt: 100
        })
      ]

      const removed = await service.deduplicateFriendActivities()

      expect(removed).toBe(1)
      expect(fakeDB.stores.friend_activities).toHaveLength(2)
    })

    it('returns 0 when no duplicates exist', async () => {
      fakeDB.stores.friend_activities = [
        createFriendActivity('f1', 'a1', { id: 'f1_a1', startTime: 1000 }),
        createFriendActivity('f1', 'a2', { id: 'f1_a2', startTime: 2000 })
      ]

      const removed = await service.deduplicateFriendActivities()

      expect(removed).toBe(0)
    })
  })

  // ============================
  // refreshAllFriends
  // ============================
  describe('refreshAllFriends', () => {
    it('syncs only friends with syncEnabled=true', async () => {
      fakeDB.stores.friends = [
        createFriend({ id: 'f1', syncEnabled: true, publicUrl: 'https://drive.google.com/uc?id=m1' }),
        createFriend({ id: 'f2', syncEnabled: false, publicUrl: 'https://drive.google.com/uc?id=m2' })
      ]

      const manifest = createPublicManifest({
        profile: { username: 'X', bio: '', userId: 'x' }
      })
      mockFetchJsonFromUrl
        .mockResolvedValueOnce(manifest)
        .mockResolvedValue({ activities: [] })

      const results = await service.refreshAllFriends()

      // Only f1 should be synced
      expect(results).toHaveLength(1)
      expect(results[0].friendId).toBe('f1')
    })

    it('emits refresh-completed event with summary', async () => {
      fakeDB.stores.friends = [
        createFriend({ id: 'f1', syncEnabled: true, publicUrl: 'https://drive.google.com/uc?id=m1' })
      ]

      const manifest = createPublicManifest({
        profile: { username: 'Alice', bio: '', userId: 'alice' },
        availableYears: []
      })
      mockFetchJsonFromUrl.mockResolvedValue(manifest)

      const events: any[] = []
      service.emitter.addEventListener('friend-event', (e: Event) =>
        events.push((e as CustomEvent).detail)
      )

      await service.refreshAllFriends()

      expect(events.some((e) => e.type === 'refresh-completed')).toBe(true)
    })

    it('returns empty array when no friends exist', async () => {
      const results = await service.refreshAllFriends()

      expect(results).toEqual([])
    })
  })

  // ============================
  // getMyPublicUrl
  // ============================
  describe('getMyPublicUrl', () => {
    it('returns wrapped share URL from stored manifest URL', async () => {
      fakeDB.stores.settings = [
        { key: 'myPublicUrl', value: 'https://drive.google.com/uc?id=abc&export=download' }
      ]

      const url = await service.getMyPublicUrl()

      expect(url).toContain('add-friend?url=')
      expect(url).toContain('drive.google.com')
    })

    it('returns null when no URL is stored', async () => {
      const url = await service.getMyPublicUrl()

      expect(url).toBeNull()
    })

    it('handles legacy share URLs by unwrapping and re-wrapping', async () => {
      const legacyShareUrl =
        'https://openstride.org/add-friend?url=' +
        encodeURIComponent('https://drive.google.com/uc?id=abc&export=download')

      fakeDB.stores.settings = [{ key: 'myPublicUrl', value: legacyShareUrl }]

      const url = await service.getMyPublicUrl()

      expect(url).toContain('add-friend?url=')
      // Should have migrated: stored value should now be the raw manifest URL
      const stored = fakeDB.stores.settings.find((s) => s.key === 'myPublicUrl')
      expect(stored?.value).not.toContain('add-friend')
    })
  })
})
