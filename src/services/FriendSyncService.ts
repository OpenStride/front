import { IndexedDBService } from './IndexedDBService'
import { GoogleDriveApiService } from './GoogleDriveApiService'
import { getInteractionService } from './InteractionService'
import { getInteractionSyncService } from './InteractionSyncService'
import type {
  Friend,
  FriendActivity,
  PublicManifest,
  PublicActivity,
  YearActivities,
  FriendSyncResult,
  FriendServiceEvent
} from '@/types/friend'

/**
 * Handles fetching and syncing friend data.
 * Extracted from FriendService (SRP).
 */
export class FriendSyncService {
  private static instance: FriendSyncService
  public emitter = new EventTarget()

  private constructor() {
    /* singleton */
  }

  public static getInstance(): FriendSyncService {
    if (!FriendSyncService.instance) {
      FriendSyncService.instance = new FriendSyncService()
    }
    return FriendSyncService.instance
  }

  private emitEvent(event: FriendServiceEvent): void {
    this.emitter.dispatchEvent(
      new CustomEvent<FriendServiceEvent>('friend-event', { detail: event })
    )
  }

  /**
   * Generic fetch method for JSON data
   */
  public async fetchJson<T>(url: string, errorContext: string): Promise<T | null> {
    try {
      const gdrive = GoogleDriveApiService.getInstance()

      if (gdrive.isGoogleDriveUrl(url)) {
        console.log('[FriendSyncService] Using GoogleDriveApiService for Google Drive URL')
        return await gdrive.fetchJsonFromUrl<T>(url)
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      })

      if (!response.ok) {
        console.error(`[FriendSyncService] ${errorContext}: ${response.status}`)
        return null
      }

      return await response.json()
    } catch (error) {
      console.error(`[FriendSyncService] ${errorContext}:`, error)
      return null
    }
  }

  public async fetchManifest(url: string): Promise<PublicManifest | null> {
    return this.fetchJson<PublicManifest>(url, 'Failed to fetch manifest')
  }

  private async fetchYearActivities(url: string): Promise<YearActivities | null> {
    return this.fetchJson<YearActivities>(url, 'Failed to fetch year activities')
  }

  /**
   * Check if a friend has us in their "following" list (mutual friendship)
   */
  public async checkMutualFriendship(
    friend: Friend,
    manifest: PublicManifest
  ): Promise<boolean> {
    const interactionService = getInteractionService()
    const myUserId = await interactionService.getMyUserId()

    if (!myUserId || !manifest.following) {
      return false
    }

    const followsMe = manifest.following.some(f => f.userId === myUserId)

    if (followsMe !== friend.followsMe) {
      const db = await IndexedDBService.getInstance()
      friend.followsMe = followsMe
      await db.addItemsToStore('friends', [friend], f => f.id)

      if (followsMe) {
        console.log(
          `[FriendSyncService] Mutual friendship discovered: ${friend.username} follows me back!`
        )
        this.emitEvent({
          type: 'mutual-friendship-discovered',
          friend,
          message: `${friend.username} vous suit maintenant !`,
          messageType: 'success'
        })
      }
    }

    return followsMe
  }

  /**
   * Fetch the most recent N activities from a friend
   */
  public async fetchRecentActivities(
    manifest: PublicManifest,
    limit = 30
  ): Promise<(PublicActivity & { year: number })[]> {
    const allActivities: (PublicActivity & { year: number })[] = []
    const sortedYears = [...manifest.availableYears].sort((a, b) => b.year - a.year)

    for (const yearEntry of sortedYears) {
      if (allActivities.length >= limit) break

      const yearData = await this.fetchYearActivities(yearEntry.fileUrl)
      if (yearData?.activities) {
        const activitiesWithYear = yearData.activities.map((activity: PublicActivity) => ({
          ...activity,
          year: yearEntry.year
        }))
        allActivities.push(...activitiesWithYear)
      }

      if (allActivities.length >= limit) break
    }

    return allActivities
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, limit)
  }

  /**
   * Fetch ALL activities from a friend across all available years
   */
  public async fetchAllActivities(
    manifest: PublicManifest
  ): Promise<(PublicActivity & { year: number })[]> {
    const allActivities: (PublicActivity & { year: number })[] = []
    const sortedYears = [...manifest.availableYears].sort((a, b) => b.year - a.year)

    for (const yearEntry of sortedYears) {
      const yearData = await this.fetchYearActivities(yearEntry.fileUrl)
      if (yearData?.activities) {
        const activitiesWithYear = yearData.activities.map((activity: PublicActivity) => ({
          ...activity,
          year: yearEntry.year
        }))
        allActivities.push(...activitiesWithYear)
      }
    }

    return allActivities.sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    )
  }

  /**
   * Get existing friend activity keys for deduplication
   */
  private async getExistingFriendActivityKeys(
    friendId: string
  ): Promise<{ ids: Set<string>; startTimes: Set<number> }> {
    const db = await IndexedDBService.getInstance()
    const allActivities = (await db.getAllData('friend_activities')) as FriendActivity[]
    const forFriend = allActivities.filter(a => a.friendId === friendId)
    return {
      ids: new Set(forFriend.map(a => a.id)),
      startTimes: new Set(forFriend.map(a => a.startTime))
    }
  }

  /**
   * Remove duplicate friend activities
   */
  public async deduplicateFriendActivities(): Promise<number> {
    const db = await IndexedDBService.getInstance()
    const all = (await db.getAllData('friend_activities')) as FriendActivity[]

    const seen = new Map<string, FriendActivity>()
    const toDelete: string[] = []

    for (const activity of all) {
      const key = `${activity.friendId}_${activity.startTime}`
      const existing = seen.get(key)
      if (existing) {
        if (activity.fetchedAt > existing.fetchedAt) {
          toDelete.push(existing.id)
          seen.set(key, activity)
        } else {
          toDelete.push(activity.id)
        }
      } else {
        seen.set(key, activity)
      }
    }

    if (toDelete.length > 0) {
      await db.deleteMultipleFromStore('friend_activities', toDelete)
    }
    return toDelete.length
  }

  /**
   * Quick sync: Fetch recent activities from a friend
   */
  public async syncFriendActivitiesQuick(friendId: string, limit = 30): Promise<FriendSyncResult> {
    const startTime = performance.now()
    const db = await IndexedDBService.getInstance()

    try {
      const friend = (await db.getDataFromStore('friends', friendId)) as Friend
      if (!friend) {
        return {
          friendId,
          success: false,
          error: 'Friend not found',
          activitiesAdded: 0,
          lastFetched: Date.now(),
          timestamp: Date.now()
        }
      }

      const manifest = await this.fetchManifest(friend.publicUrl)
      if (!manifest) {
        return {
          friendId,
          success: false,
          error: 'Failed to fetch manifest',
          activitiesAdded: 0,
          lastFetched: Date.now(),
          timestamp: Date.now()
        }
      }

      if (manifest.profile.userId && !friend.userId) {
        friend.userId = manifest.profile.userId
        await db.addItemsToStore('friends', [friend], f => f.id)
      }

      await this.checkMutualFriendship(friend, manifest)

      const recentActivities = await this.fetchRecentActivities(manifest, limit)
      const existing = await this.getExistingFriendActivityKeys(friendId)

      const friendActivities: FriendActivity[] = recentActivities.map(activity => ({
        id: `${friendId}_${activity.id}_${activity.year}`,
        friendId,
        friendUsername: friend.username,
        activityId: activity.id,
        year: activity.year,
        startTime: activity.startTime,
        duration: activity.duration,
        distance: activity.distance,
        type: activity.type,
        title: activity.title,
        mapPolyline: activity.mapPolyline,
        fetchedAt: Date.now(),
        lastModified: Date.now()
      }))

      const newActivities = friendActivities.filter(
        activity => !existing.ids.has(activity.id) && !existing.startTimes.has(activity.startTime)
      )

      let totalAdded = 0
      if (newActivities.length > 0) {
        await db.addItemsToStore('friend_activities', newActivities, a => a.id)
        totalAdded = newActivities.length
      }

      friend.lastSyncTime = Date.now()
      friend.lastFetched = Date.now()
      await db.addItemsToStore('friends', [friend], f => f.id)

      const duration = performance.now() - startTime
      console.log(
        `[FriendSyncService] Quick sync completed: ${totalAdded} new activities (${duration.toFixed(0)}ms)`
      )

      return {
        friendId,
        success: true,
        activitiesAdded: totalAdded,
        lastFetched: Date.now(),
        timestamp: Date.now()
      }
    } catch (error) {
      console.error(`[FriendSyncService] Error in quick sync for ${friendId}:`, error)
      return {
        friendId,
        success: false,
        error: String(error),
        activitiesAdded: 0,
        lastFetched: Date.now(),
        timestamp: Date.now()
      }
    }
  }

  /**
   * Full sync: Fetch ALL activities from a friend
   */
  public async syncFriendActivitiesAll(friendId: string): Promise<FriendSyncResult> {
    const startTime = performance.now()
    const db = await IndexedDBService.getInstance()

    try {
      const friend = (await db.getDataFromStore('friends', friendId)) as Friend
      if (!friend) {
        return {
          friendId,
          success: false,
          error: 'Friend not found',
          activitiesAdded: 0,
          lastFetched: Date.now(),
          timestamp: Date.now()
        }
      }

      const manifest = await this.fetchManifest(friend.publicUrl)
      if (!manifest) {
        return {
          friendId,
          success: false,
          error: 'Failed to fetch manifest',
          activitiesAdded: 0,
          lastFetched: Date.now(),
          timestamp: Date.now()
        }
      }

      if (manifest.profile.userId && !friend.userId) {
        friend.userId = manifest.profile.userId
        await db.addItemsToStore('friends', [friend], f => f.id)
      }

      await this.checkMutualFriendship(friend, manifest)

      const allActivities = await this.fetchAllActivities(manifest)
      const existing = await this.getExistingFriendActivityKeys(friendId)

      const friendActivities: FriendActivity[] = allActivities.map(activity => ({
        id: `${friendId}_${activity.id}_${activity.year}`,
        friendId,
        friendUsername: friend.username,
        activityId: activity.id,
        year: activity.year,
        startTime: activity.startTime,
        duration: activity.duration,
        distance: activity.distance,
        type: activity.type,
        title: activity.title,
        mapPolyline: activity.mapPolyline,
        fetchedAt: Date.now(),
        lastModified: Date.now()
      }))

      const newActivities = friendActivities.filter(
        activity => !existing.ids.has(activity.id) && !existing.startTimes.has(activity.startTime)
      )

      let totalAdded = 0
      if (newActivities.length > 0) {
        await db.addItemsToStore('friend_activities', newActivities, a => a.id)
        totalAdded = newActivities.length
      }

      friend.lastSyncTime = Date.now()
      friend.lastFetched = Date.now()
      friend.fullySynced = true
      await db.addItemsToStore('friends', [friend], f => f.id)

      const duration = performance.now() - startTime
      console.log(
        `[FriendSyncService] Full sync completed: ${totalAdded} new activities from ${allActivities.length} total (${duration.toFixed(0)}ms)`
      )

      return {
        friendId,
        success: true,
        activitiesAdded: totalAdded,
        totalActivities: allActivities.length,
        lastFetched: Date.now(),
        timestamp: Date.now()
      }
    } catch (error) {
      console.error(`[FriendSyncService] Error in full sync for ${friendId}:`, error)
      return {
        friendId,
        success: false,
        error: String(error),
        activitiesAdded: 0,
        lastFetched: Date.now(),
        timestamp: Date.now()
      }
    }
  }

  /**
   * Refresh all friends' activities and interactions
   */
  public async refreshAllFriends(friends: Friend[]): Promise<FriendSyncResult[]> {
    const removed = await this.deduplicateFriendActivities()
    if (removed > 0) {
      console.log(`[FriendSyncService] Cleaned up ${removed} duplicate friend activities`)
    }

    const results: FriendSyncResult[] = []

    for (const friend of friends) {
      if (friend.syncEnabled) {
        const result = await this.syncFriendActivitiesQuick(friend.id, 30)
        results.push(result)
      }
    }

    const interactionSyncService = getInteractionSyncService()
    const interactionResults = await interactionSyncService.syncAllFriendsInteractions()
    const totalInteractions = interactionResults.reduce((sum, r) => sum + r.interactionsSynced, 0)

    const successCount = results.filter(r => r.success).length
    const totalActivities = results.reduce((sum, r) => sum + r.activitiesAdded, 0)

    if (successCount > 0 || totalInteractions > 0) {
      let message = `${successCount} ami(s) synchronisé(s)`
      if (totalActivities > 0) {
        message += `, ${totalActivities} activité(s)`
      }
      if (totalInteractions > 0) {
        message += `, ${totalInteractions} interaction(s)`
      }

      this.emitEvent({
        type: 'refresh-completed',
        message,
        messageType: 'success'
      })
    }

    return results
  }
}
