import { IndexedDBService } from './IndexedDBService'
import { ShareUrlService } from './ShareUrlService'
import { FriendSyncService } from './FriendSyncService'
import type { Friend, FriendActivity, FriendSyncResult, FriendServiceEvent } from '@/types/friend'

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
   * Add a friend by their public manifest URL
   */
  public async addFriendByUrl(publicUrl: string, customUsername?: string): Promise<Friend | null> {
    try {
      let manifestUrl = publicUrl
      if (ShareUrlService.isShareUrl(publicUrl)) {
        const unwrapped = ShareUrlService.unwrapManifestUrl(publicUrl)
        if (!unwrapped) {
          this.emitEvent({
            type: 'friend-error',
            message: 'URL de partage invalide',
            messageType: 'error'
          })
          return null
        }
        manifestUrl = unwrapped
      }

      const syncService = FriendSyncService.getInstance()
      const manifest = await syncService.fetchManifest(manifestUrl)
      if (!manifest) {
        this.emitEvent({
          type: 'friend-error',
          message: 'Impossible de charger le profil',
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
          message: "Erreur: collision d'identifiant",
          messageType: 'error'
        })
        return null
      }

      const existingFriend = await db.getDataFromStore('friends', friendId).catch(() => null)
      if (existingFriend) {
        this.emitEvent({
          type: 'friend-error',
          friend: existingFriend as Friend,
          message: 'Cet ami est déjà ajouté',
          messageType: 'warning'
        })
        return existingFriend as Friend
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
        message: `${friend.username} ajouté avec succès!`,
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
          message: `${syncResult.activitiesAdded} activités récentes synchronisées`,
          messageType: 'success'
        })
      }

      return friend
    } catch (error) {
      console.error('[FriendManagementService] Error adding friend:', error)
      this.emitEvent({
        type: 'friend-error',
        message: "Erreur lors de l'ajout",
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
        message: 'Ami supprimé',
        messageType: 'success'
      })

      // Notify that friends list changed (triggers re-publish of following list)
      window.dispatchEvent(new Event('openstride:friends-changed'))
    } catch (error) {
      console.error('[FriendManagementService] Error removing friend:', error)
      this.emitEvent({
        type: 'friend-error',
        message: 'Erreur lors de la suppression',
        messageType: 'error'
      })
    }
  }
}
