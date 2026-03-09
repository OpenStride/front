import { PublicDataPublisher } from './PublicDataPublisher'
import { FriendSyncService } from './FriendSyncService'
import { FriendManagementService } from './FriendManagementService'
import type { Friend, FriendSyncResult, FriendServiceEvent } from '@/types/friend'

/**
 * FriendService — Thin facade delegating to focused services.
 *
 * Delegates to:
 * - PublicDataPublisher: publishing own public data
 * - FriendSyncService: fetching & syncing friend data
 * - FriendManagementService: friend CRUD & social graph
 *
 * Maintains backward compatibility: all existing callers work unchanged.
 */
export class FriendService {
  private static instance: FriendService
  public emitter = new EventTarget()
  private refreshRequestedListener: ((evt: Event) => void) | null = null

  private publisher = PublicDataPublisher.getInstance()
  private syncSvc = FriendSyncService.getInstance()
  private mgmt = FriendManagementService.getInstance()

  private constructor() {
    // Forward events from sub-services to this facade's emitter
    const forward = (event: Event) => {
      const ce = event as CustomEvent<FriendServiceEvent>
      this.emitter.dispatchEvent(
        new CustomEvent<FriendServiceEvent>('friend-event', { detail: ce.detail })
      )
    }
    this.publisher.emitter.addEventListener('friend-event', forward)
    this.syncSvc.emitter.addEventListener('friend-event', forward)
    this.mgmt.emitter.addEventListener('friend-event', forward)
  }

  public static getInstance(): FriendService {
    if (!FriendService.instance) {
      FriendService.instance = new FriendService()
    }
    return FriendService.instance
  }

  /**
   * Subscribe to window 'openstride:refresh-requested' events.
   * When fired, refreshes all friends and emits 'openstride:activities-refreshed' on completion.
   */
  startListening(): void {
    this.refreshRequestedListener = () => {
      this.refreshAllFriends()
        .then(() => {
          window.dispatchEvent(new Event('openstride:activities-refreshed'))
        })
        .catch(err => console.error('[FriendService] Refresh failed:', err))
    }
    window.addEventListener('openstride:refresh-requested', this.refreshRequestedListener)
    console.log('[FriendService] Started listening to refresh-requested events')
  }

  /**
   * Unsubscribe from window 'openstride:refresh-requested' events.
   */
  stopListening(): void {
    if (this.refreshRequestedListener) {
      window.removeEventListener('openstride:refresh-requested', this.refreshRequestedListener)
      this.refreshRequestedListener = null
      console.log('[FriendService] Stopped listening')
    }
  }

  // ========== PUBLISHING ==========

  public publishPublicData(): Promise<string | null> {
    return this.publisher.publishPublicData()
  }

  public getMyPublicUrl(): Promise<string | null> {
    return this.publisher.getMyPublicUrl()
  }

  public getMyManifestUrl(): Promise<string | null> {
    return this.publisher.getMyManifestUrl()
  }

  public hasPublishedData(): Promise<boolean> {
    return this.publisher.hasPublishedData()
  }

  // ========== FRIEND MANAGEMENT ==========

  public addFriendByUrl(publicUrl: string, customUsername?: string): Promise<Friend | null> {
    return this.mgmt.addFriendByUrl(publicUrl, customUsername)
  }

  public getAllFriends(): Promise<Friend[]> {
    return this.mgmt.getAllFriends()
  }

  public removeFriend(friendId: string): Promise<void> {
    return this.mgmt.removeFriend(friendId)
  }

  // ========== SYNC ==========

  public syncFriendActivitiesQuick(friendId: string, limit = 30): Promise<FriendSyncResult> {
    return this.syncSvc.syncFriendActivitiesQuick(friendId, limit)
  }

  public syncFriendActivitiesAll(friendId: string): Promise<FriendSyncResult> {
    return this.syncSvc.syncFriendActivitiesAll(friendId)
  }

  public deduplicateFriendActivities(): Promise<number> {
    return this.syncSvc.deduplicateFriendActivities()
  }

  public async refreshAllFriends(): Promise<FriendSyncResult[]> {
    const friends = await this.mgmt.getAllFriends()
    return this.syncSvc.refreshAllFriends(friends)
  }
}
