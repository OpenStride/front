import { IndexedDBService } from './IndexedDBService'
import { ShareUrlService } from './ShareUrlService'
import { FriendSyncService } from './FriendSyncService'
import type { Friend, FriendActivity, FriendServiceEvent, PublicManifest } from '@/types/friend'

/**
 * Handles Friend CRUD and social graph operations.
 * Extracted from FriendService (SRP).
 */
export class FriendManagementService {
  private static instance: FriendManagementService
  public emitter = new EventTarget()

  private constructor() {
    /* singleton */
  }

  public static getInstance(): FriendManagementService {
    if (!FriendManagementService.instance) {
      FriendManagementService.instance = new FriendManagementService()
    }
    return FriendManagementService.instance
  }

  private emitEvent(event: FriendServiceEvent): void {
    this.emitter.dispatchEvent(
      new CustomEvent<FriendServiceEvent>('friend-event', { detail: event })
    )
  }

  /**
   * Generate a unique friend ID from their public URL using SHA-256
   */
  private async generateFriendId(publicUrl: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(publicUrl)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    return 'friend_' + hashHex.substring(0, 12)
  }

  /**
   * Validate that friend ID is unique (no collision)
   */
  private async validateFriendIdUnique(friendId: string, publicUrl: string): Promise<boolean> {
    const db = await IndexedDBService.getInstance()
    const existingFriend = await db.getDataFromStore('friends', friendId).catch(() => null)

    if (!existingFriend) return true
    if ((existingFriend as Friend).publicUrl === publicUrl) return true

    console.error(`[FriendManagementService] Hash collision detected for ${friendId}`)
    return false
  }

  /**
   * Resolve a scanned or pasted URL to the manifest it points at.
   * Accepts both the app share link and a direct manifest URL.
   */
  public resolveManifestUrl(publicUrl: string): string | null {
    if (!ShareUrlService.isShareUrl(publicUrl)) return publicUrl
    return ShareUrlService.unwrapManifestUrl(publicUrl)
  }

  /**
   * Read someone's public profile without adding them.
   *
   * Adding a friend writes to the device and republishes the following list, so
   * the user gets to see who they are about to follow first.
   */
  public async previewFriend(publicUrl: string): Promise<{
    manifestUrl: string
    manifest: PublicManifest
    alreadyAdded: Friend | null
    movedFrom: Friend | null
  } | null> {
    const manifestUrl = this.resolveManifestUrl(publicUrl)
    if (!manifestUrl) return null

    const manifest = await FriendSyncService.getInstance().fetchManifest(manifestUrl)
    if (!manifest) return null

    const friendId = await this.generateFriendId(manifestUrl)
    const db = await IndexedDBService.getInstance()
    // A miss resolves to undefined, not null — normalise so callers can compare
    const existing = (await db.getDataFromStore('friends', friendId).catch(() => null)) as
      | Friend
      | null
      | undefined

    return {
      manifestUrl,
      manifest,
      alreadyAdded: existing ?? null,
      movedFrom: existing ? null : await this.findByUserId(manifest.profile.userId, manifestUrl)
    }
  }

  /**
   * Find a friend we already follow who now publishes at a different URL.
   *
   * The local key is a hash of the manifest URL, so someone who republishes
   * from another Drive account looks like a stranger: you would end up
   * following them twice, with the first entry frozen forever. Their `userId`
   * is stable across moves, so use it to recognise them.
   */
  private async findByUserId(userId?: string, exceptUrl?: string): Promise<Friend | null> {
    if (!userId) return null

    const friends = await this.getAllFriends()
    return friends.find(f => f.userId === userId && f.publicUrl !== exceptUrl) ?? null
  }

  /**
   * Add a friend by their public manifest URL
   */
  public async addFriendByUrl(publicUrl: string, customUsername?: string): Promise<Friend | null> {
    try {
      const resolved = this.resolveManifestUrl(publicUrl)
      if (!resolved) {
        this.emitEvent({
          type: 'friend-error',
          messageKey: 'friendEvents.invalidShareUrl',
          messageType: 'error'
        })
        return null
      }
      const manifestUrl = resolved

      const syncService = FriendSyncService.getInstance()
      const manifest = await syncService.fetchManifest(manifestUrl)
      if (!manifest) {
        this.emitEvent({
          type: 'friend-error',
          messageKey: 'friendEvents.profileUnreachable',
          messageType: 'error'
        })
        return null
      }

      const friendId = await this.generateFriendId(manifestUrl)
      const db = await IndexedDBService.getInstance()

      const isUnique = await this.validateFriendIdUnique(friendId, manifestUrl)
      if (!isUnique) {
        this.emitEvent({
          type: 'friend-error',
          messageKey: 'friendEvents.idCollision',
          messageType: 'error'
        })
        return null
      }

      const existingFriend = await db.getDataFromStore('friends', friendId).catch(() => null)
      if (existingFriend) {
        this.emitEvent({
          type: 'friend-error',
          friend: existingFriend as Friend,
          messageKey: 'friendEvents.alreadyAdded',
          messageType: 'warning'
        })
        return existingFriend as Friend
      }

      // Same person, new publishing location: move the record we already have
      // instead of creating a second, competing entry
      const moved = await this.findByUserId(manifest.profile.userId, manifestUrl)
      if (moved) {
        const updated: Friend = {
          ...moved,
          publicUrl: manifestUrl,
          username: customUsername || manifest.profile.username,
          profilePhoto: manifest.profile.profilePhoto,
          bio: manifest.profile.bio,
          lastModified: Date.now()
        }
        await db.addItemsToStore('friends', [updated], f => f.id)

        this.emitEvent({
          type: 'friend-updated',
          friend: updated,
          messageKey: 'friendEvents.profileMoved',
          messageParams: { name: updated.username },
          messageType: 'success'
        })

        await syncService.syncFriendActivitiesQuick(updated.id, 30)
        return updated
      }

      const friend: Friend = {
        id: friendId,
        userId: manifest.profile.userId,
        username: customUsername || manifest.profile.username,
        profilePhoto: manifest.profile.profilePhoto,
        bio: manifest.profile.bio,
        publicUrl: manifestUrl,
        addedAt: Date.now(),
        lastFetched: Date.now(),
        lastModified: Date.now(),
        syncEnabled: true
      }

      await db.addItemsToStore('friends', [friend], f => f.id)

      this.emitEvent({
        type: 'friend-added',
        friend,
        messageKey: 'friendEvents.friendAdded',
        messageParams: { name: friend.username },
        messageType: 'success'
      })

      // Notify that friends list changed (triggers re-publish of following list)
      window.dispatchEvent(new Event('openstride:friends-changed'))

      // Quick sync activities
      const syncResult = await syncService.syncFriendActivitiesQuick(friendId, 30)

      if (syncResult.success && syncResult.activitiesAdded > 0) {
        this.emitEvent({
          type: 'sync-completed',
          friend,
          syncResult,
          messageKey: 'friendEvents.recentActivitiesSynced',
          messageCount: syncResult.activitiesAdded,
          messageType: 'success'
        })
      }

      return friend
    } catch (error) {
      console.error('[FriendManagementService] Error adding friend:', error)
      this.emitEvent({
        type: 'friend-error',
        messageKey: 'friendEvents.addFailed',
        messageType: 'error'
      })
      return null
    }
  }

  /**
   * Get all friends
   */
  public async getAllFriends(): Promise<Friend[]> {
    const db = await IndexedDBService.getInstance()
    return (await db.getAllData('friends')) as Friend[]
  }

  /**
   * Remove a friend and their activities
   */
  public async removeFriend(friendId: string): Promise<void> {
    try {
      const db = await IndexedDBService.getInstance()

      await db.deleteFromStore('friends', friendId)

      const allActivities = (await db.getAllData('friend_activities')) as FriendActivity[]
      const friendActivities = allActivities.filter(a => a.friendId === friendId)

      if (friendActivities.length > 0) {
        const activityKeys = friendActivities.map(a => a.id)
        await db.deleteMultipleFromStore('friend_activities', activityKeys)
      }

      this.emitEvent({
        type: 'friend-removed',
        messageKey: 'friendEvents.friendRemoved',
        messageType: 'success'
      })

      // Notify that friends list changed (triggers re-publish of following list)
      window.dispatchEvent(new Event('openstride:friends-changed'))
    } catch (error) {
      console.error('[FriendManagementService] Error removing friend:', error)
      this.emitEvent({
        type: 'friend-error',
        messageKey: 'friendEvents.removeFailed',
        messageType: 'error'
      })
    }
  }
}
