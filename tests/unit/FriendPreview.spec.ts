import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Friend, PublicManifest } from '@/types/friend'

const friendsStore = new Map<string, Friend>()

const mocks = vi.hoisted(() => ({
  fetchManifest: vi.fn(),
  syncQuick: vi.fn(async () => ({ success: true, activitiesAdded: 0 }))
}))

vi.mock('@/services/IndexedDBService', () => ({
  IndexedDBService: {
    getInstance: async () => ({
      // A miss resolves undefined, like the real store
      getDataFromStore: async (_store: string, key: string) => friendsStore.get(key),
      addItemsToStore: async (_store: string, items: Friend[]) => {
        for (const item of items) friendsStore.set(item.id, item)
      }
    })
  }
}))

vi.mock('@/services/FriendSyncService', () => ({
  FriendSyncService: {
    getInstance: () => ({
      fetchManifest: mocks.fetchManifest,
      syncFriendActivitiesQuick: mocks.syncQuick
    })
  }
}))

const { FriendManagementService } = await import('@/services/FriendManagementService')

const MANIFEST: PublicManifest = {
  version: 1,
  lastModified: 1,
  profile: { userId: 'user_camille', username: 'Camille' },
  stats: { totalActivities: 128, totalDistance: 1_432_000, totalDuration: 360_000 },
  availableYears: []
}

const DRIVE_URL = 'https://drive.google.com/uc?id=ABC123&export=download'
const SHARE_URL = `https://openstride.org/add-friend?manifest=${encodeURIComponent(DRIVE_URL)}`

describe('friend preview', () => {
  const service = FriendManagementService.getInstance()

  beforeEach(() => {
    friendsStore.clear()
    vi.clearAllMocks()
    mocks.fetchManifest.mockResolvedValue(MANIFEST)
  })

  it('reads the profile without adding anyone', async () => {
    const result = await service.previewFriend(DRIVE_URL)

    expect(result?.manifest.profile.username).toBe('Camille')
    expect(friendsStore.size).toBe(0)
    expect(mocks.syncQuick).not.toHaveBeenCalled()
  })

  it('unwraps a share link to the manifest it points at', async () => {
    const result = await service.previewFriend(SHARE_URL)

    expect(result?.manifestUrl).toBe(DRIVE_URL)
    expect(mocks.fetchManifest).toHaveBeenCalledWith(DRIVE_URL)
  })

  it('reports an unknown profile as not yet added', async () => {
    // The store resolves undefined for a miss, so a `!== null` test would have
    // flagged every newcomer as already added
    const result = await service.previewFriend(DRIVE_URL)

    expect(result?.alreadyAdded).toBeNull()
  })

  it('reports a profile already in the list', async () => {
    await service.addFriendByUrl(DRIVE_URL)

    const result = await service.previewFriend(DRIVE_URL)

    expect(result?.alreadyAdded?.username).toBe('Camille')
  })

  it('returns null when the profile cannot be fetched', async () => {
    mocks.fetchManifest.mockResolvedValue(null)

    expect(await service.previewFriend(DRIVE_URL)).toBeNull()
  })

  it('rejects a share link whose manifest parameter is empty', async () => {
    expect(await service.previewFriend('https://openstride.org/add-friend?manifest=')).toBeNull()
    expect(mocks.fetchManifest).not.toHaveBeenCalled()
  })
})
