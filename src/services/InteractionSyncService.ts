import { IndexedDBService } from './IndexedDBService';
import { PublicFileService } from './PublicFileService';
import { getInteractionService } from './InteractionService';
import { GoogleDriveApiService } from './GoogleDriveApiService';
import { ShareUrlService } from './ShareUrlService';
import type { Friend, PublicManifest } from '@/types/friend';
import type {
  Interaction,
  InteractionYearFile,
  InteractionEntry,
  InteractionSyncResult,
  InteractionSyncServiceEvent
} from '@/types/interaction';

/**
 * Service for syncing interactions with remote storage.
 *
 * Responsibilities:
 * - Publish user's interactions to public storage (interactions-YYYY.json)
 * - Fetch interactions from friends' public storage
 * - Update manifest with availableInteractionYears
 *
 * Uses PublicFileService as abstraction layer for storage operations.
 */
export class InteractionSyncService {
  private static instance: InteractionSyncService;
  public emitter = new EventTarget();

  private constructor() {}

  public static getInstance(): InteractionSyncService {
    if (!InteractionSyncService.instance) {
      InteractionSyncService.instance = new InteractionSyncService();
    }
    return InteractionSyncService.instance;
  }

  /**
   * Emit a sync event
   */
  private emitEvent(event: InteractionSyncServiceEvent): void {
    this.emitter.dispatchEvent(
      new CustomEvent<InteractionSyncServiceEvent>('interaction-sync-event', { detail: event })
    );
  }

  // ========== PUBLISHING ==========

  /**
   * Publish user's interactions to public storage
   * Creates/updates interactions-YYYY.json files
   */
  public async publishInteractions(): Promise<InteractionSyncResult> {
    const publicFileService = PublicFileService.getInstance();
    const interactionService = getInteractionService();
    const uploadedFileIds: string[] = [];
    const errors: string[] = [];

    this.emitEvent({ type: 'sync-started' });

    try {
      // Check if public file support is available
      if (!await publicFileService.hasPublicFileSupport()) {
        const result: InteractionSyncResult = {
          success: false,
          interactionsSynced: 0,
          errors: ['No storage plugin with public file support enabled']
        };
        this.emitEvent({ type: 'sync-failed', error: result.errors[0] });
        return result;
      }

      // Get interactions grouped by year
      const yearMap = await interactionService.getMyInteractionsByYear();

      if (yearMap.size === 0) {
        console.log('[InteractionSyncService] No interactions to publish');
        const result: InteractionSyncResult = {
          success: true,
          interactionsSynced: 0,
          errors: []
        };
        this.emitEvent({ type: 'sync-completed', result });
        return result;
      }

      // Generate and upload year files
      const yearUrls = new Map<number, string>();
      let totalInteractions = 0;

      for (const [year, interactions] of yearMap) {
        const yearFile = this.buildInteractionYearFile(year, interactions);
        const filename = `interactions-${year}.json`;

        const url = await publicFileService.writePublicFile(filename, yearFile);

        if (!url) {
          errors.push(`Failed to upload ${filename}`);
          console.error(`[InteractionSyncService] Failed to upload ${filename}`);
        } else {
          yearUrls.set(year, url);
          totalInteractions += interactions.length;

          // Track file ID for potential rollback
          const fileId = publicFileService.extractFileIdFromUrl(url);
          if (fileId) uploadedFileIds.push(fileId);
        }
      }

      // If any upload failed, don't update manifest
      if (errors.length > 0) {
        const result: InteractionSyncResult = {
          success: false,
          interactionsSynced: 0,
          errors
        };
        this.emitEvent({ type: 'sync-failed', error: errors.join(', ') });
        return result;
      }

      console.log(`[InteractionSyncService] Published ${totalInteractions} interactions across ${yearUrls.size} year files`);

      const result: InteractionSyncResult = {
        success: true,
        interactionsSynced: totalInteractions,
        errors: []
      };
      this.emitEvent({ type: 'sync-completed', result });
      return result;

    } catch (error) {
      console.error('[InteractionSyncService] Error publishing interactions:', error);
      const result: InteractionSyncResult = {
        success: false,
        interactionsSynced: 0,
        errors: [String(error)]
      };
      this.emitEvent({ type: 'sync-failed', error: String(error) });
      return result;
    }
  }

  /**
   * Build the InteractionYearFile structure grouped by activityOwnerId
   */
  private buildInteractionYearFile(year: number, interactions: Interaction[]): InteractionYearFile {
    const grouped: { [activityOwnerId: string]: InteractionEntry[] } = {};

    for (const interaction of interactions) {
      if (!grouped[interaction.activityOwnerId]) {
        grouped[interaction.activityOwnerId] = [];
      }

      grouped[interaction.activityOwnerId].push({
        type: interaction.type,
        activityId: interaction.activityId,
        authorId: interaction.authorId,
        authorUsername: interaction.authorUsername,
        text: interaction.text,
        timestamp: interaction.timestamp
      });
    }

    return {
      year,
      lastModified: Date.now(),
      interactions: grouped
    };
  }

  /**
   * Get interaction years data for manifest update
   * Called by FriendService.publishPublicData()
   */
  public async getInteractionYearsForManifest(): Promise<Array<{ year: number; fileUrl: string; lastModified: number }>> {
    const publicFileService = PublicFileService.getInstance();
    const interactionService = getInteractionService();

    const yearMap = await interactionService.getMyInteractionsByYear();
    const result: Array<{ year: number; fileUrl: string; lastModified: number }> = [];

    for (const year of yearMap.keys()) {
      const url = await publicFileService.getPublicFileUrl(`interactions-${year}.json`);
      if (url) {
        result.push({
          year,
          fileUrl: url,
          lastModified: Date.now()
        });
      }
    }

    return result.sort((a, b) => b.year - a.year);
  }

  // ========== FETCHING ==========

  /**
   * Fetch interactions from a friend's public storage
   * @param friendId Friend whose interactions to fetch
   * @returns Number of interactions synced
   */
  public async syncFriendInteractions(friendId: string): Promise<InteractionSyncResult> {
    const db = await IndexedDBService.getInstance();
    const interactionService = getInteractionService();

    try {
      // Get friend info
      const friend = await db.getDataFromStore('friends', friendId) as Friend | null;
      if (!friend) {
        return {
          success: false,
          interactionsSynced: 0,
          errors: ['Friend not found']
        };
      }

      // Fetch friend's manifest
      const manifest = await this.fetchManifest(friend.publicUrl);
      if (!manifest) {
        return {
          success: false,
          interactionsSynced: 0,
          errors: ['Failed to fetch manifest']
        };
      }

      // Check if manifest has interaction years
      if (!manifest.availableInteractionYears || manifest.availableInteractionYears.length === 0) {
        console.log(`[InteractionSyncService] Friend ${friendId} has no interactions published`);
        return {
          success: true,
          interactionsSynced: 0,
          errors: []
        };
      }

      // Get my user ID to filter interactions on my activities
      const myUserId = await interactionService.getMyUserId();
      if (!myUserId) {
        return {
          success: false,
          interactionsSynced: 0,
          errors: ['User not published yet']
        };
      }

      let totalSynced = 0;

      // Fetch each year's interactions
      for (const yearEntry of manifest.availableInteractionYears) {
        const yearData = await this.fetchInteractionYearFile(yearEntry.fileUrl);
        if (!yearData) continue;

        // Debug logs for ID mismatch investigation
        console.log('[InteractionSyncService] Looking for interactions keyed by myUserId:', myUserId);
        console.log('[InteractionSyncService] Available keys in yearData.interactions:', Object.keys(yearData.interactions));

        // Extract interactions that concern me (on my activities)
        const myInteractions = yearData.interactions[myUserId];
        if (!myInteractions || myInteractions.length === 0) continue;

        // Convert to full Interaction objects
        const interactions: Interaction[] = myInteractions.map(entry => ({
          id: `${entry.authorId}_${entry.type}_${entry.activityId}_${entry.timestamp}`,
          type: entry.type,
          activityId: entry.activityId,
          activityOwnerId: myUserId,
          authorId: entry.authorId,
          authorUsername: entry.authorUsername,
          text: entry.text,
          timestamp: entry.timestamp,
          lastModified: Date.now()
        }));

        // Store in IndexedDB
        await interactionService.storeRemoteInteractions(interactions);
        totalSynced += interactions.length;
      }

      console.log(`[InteractionSyncService] Synced ${totalSynced} interactions from friend ${friendId}`);

      return {
        success: true,
        interactionsSynced: totalSynced,
        errors: []
      };

    } catch (error) {
      console.error(`[InteractionSyncService] Error syncing friend ${friendId} interactions:`, error);
      return {
        success: false,
        interactionsSynced: 0,
        errors: [String(error)]
      };
    }
  }

  /**
   * Sync interactions from all friends
   */
  public async syncAllFriendsInteractions(): Promise<InteractionSyncResult[]> {
    const db = await IndexedDBService.getInstance();
    const friends = await db.getAllData('friends') as Friend[];
    const results: InteractionSyncResult[] = [];

    for (const friend of friends) {
      if (friend.syncEnabled !== false) {
        const result = await this.syncFriendInteractions(friend.id);
        results.push(result);
      }
    }

    const totalSynced = results.reduce((sum, r) => sum + r.interactionsSynced, 0);
    console.log(`[InteractionSyncService] Synced ${totalSynced} interactions from ${results.length} friends`);

    return results;
  }

  // ========== HELPERS ==========

  /**
   * Fetch JSON from URL, using GoogleDriveApiService for Google Drive URLs
   */
  private async fetchJson<T>(url: string): Promise<T | null> {
    try {
      const gdrive = GoogleDriveApiService.getInstance();

      // Use GoogleDriveApiService for Google Drive URLs (bypasses CORS)
      if (gdrive.isGoogleDriveUrl(url)) {
        return await gdrive.fetchJsonFromUrl<T>(url);
      }

      // Standard fetch for other URLs
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        console.error(`[InteractionSyncService] Fetch failed: ${response.status}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('[InteractionSyncService] Fetch error:', error);
      return null;
    }
  }

  /**
   * Fetch a friend's manifest
   * Handles both direct Google Drive URLs and wrapped share URLs
   */
  private async fetchManifest(url: string): Promise<PublicManifest | null> {
    // Unwrap share URL if needed (e.g., /add-friend?manifest=... → direct URL)
    let manifestUrl = url;
    if (ShareUrlService.isShareUrl(url)) {
      const unwrapped = ShareUrlService.unwrapManifestUrl(url);
      if (unwrapped) {
        console.log('[InteractionSyncService] Unwrapped share URL to:', unwrapped);
        manifestUrl = unwrapped;
      }
    }
    return this.fetchJson<PublicManifest>(manifestUrl);
  }

  /**
   * Fetch an interaction year file
   */
  private async fetchInteractionYearFile(url: string): Promise<InteractionYearFile | null> {
    return this.fetchJson<InteractionYearFile>(url);
  }
}

// Singleton factory
export function getInteractionSyncService(): InteractionSyncService {
  return InteractionSyncService.getInstance();
}
