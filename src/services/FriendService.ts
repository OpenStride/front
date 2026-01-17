import { IndexedDBService } from './IndexedDBService';
import { PublicDataService } from './PublicDataService';
import { PublicFileService } from './PublicFileService';
import type { Friend, PublicManifest, FriendSyncResult } from '@/types/friend';
import { ToastService } from './ToastService';
import { ShareUrlService } from './ShareUrlService';
import { GoogleDriveApiService } from './GoogleDriveApiService';

export class FriendService {
  private static instance: FriendService;

  private constructor() {}

  public static getInstance(): FriendService {
    if (!FriendService.instance) {
      FriendService.instance = new FriendService();
    }
    return FriendService.instance;
  }

  // ========== PUBLISHING METHODS (Phase 1) ==========

  /**
   * Publish user's public data to public file storage
   * Creates manifest.json + activities-YYYY.json files
   * Returns the manifest URL for sharing
   */
  public async publishPublicData(): Promise<string | null> {
    const uploadedFileIds: string[] = [];

    try {
      const publicDataService = PublicDataService.getInstance();
      const publicFileService = PublicFileService.getInstance();
      const db = await IndexedDBService.getInstance();

      // Generate all public data
      const { manifest, yearFiles } = await publicDataService.generateAllPublicData();

      if (yearFiles.size === 0) {
        ToastService.push('Aucune activité publique à partager', { type: 'warning', timeout: 4000 });
        return null;
      }

      // Upload year files and collect their URLs
      const yearUrls = new Map<number, string>();
      const uploadErrors: string[] = [];

      for (const [year, yearData] of yearFiles.entries()) {
        const filename = `activities-${year}.json`;
        const url = await publicFileService.writePublicFile(filename, yearData);

        if (!url) {
          uploadErrors.push(`${year}`);
          console.error(`[FriendService] Failed to upload ${filename}`);
        } else {
          yearUrls.set(year, url);

          // Track uploaded file ID for potential rollback
          const fileId = publicFileService.extractFileIdFromUrl(url);
          if (fileId) uploadedFileIds.push(fileId);
        }
      }

      // If any year file failed, rollback all uploads
      if (uploadErrors.length > 0) {
        console.error(`[FriendService] Failed to upload year files: ${uploadErrors.join(', ')}`);
        ToastService.push(
          `Échec de publication pour les années: ${uploadErrors.join(', ')}`,
          { type: 'error', timeout: 5000 }
        );

        // Rollback: delete uploaded files
        await this.rollbackUploadedFiles(publicFileService, uploadedFileIds);
        return null;
      }

      // Update manifest with actual file URLs
      for (const yearEntry of manifest.availableYears) {
        const url = yearUrls.get(yearEntry.year);
        if (url) {
          yearEntry.fileUrl = url;
        }
      }

      // Upload manifest
      const manifestUrl = await publicFileService.writePublicFile('manifest.json', manifest);

      if (!manifestUrl) {
        console.error('[FriendService] Failed to upload manifest');
        ToastService.push('Échec de publication du manifest', { type: 'error', timeout: 5000 });

        // Rollback: delete all uploaded year files
        await this.rollbackUploadedFiles(publicFileService, uploadedFileIds);
        return null;
      }

      // Wrap manifest URL in app share URL for better UX (deep linking)
      const shareUrl = ShareUrlService.wrapManifestUrl(manifestUrl);
      await db.saveData('myPublicUrl', shareUrl);

      ToastService.push('Données publiques publiées avec succès!', { type: 'success', timeout: 4000 });

      return shareUrl;
    } catch (error) {
      console.error('[FriendService] Error publishing public data:', error);
      ToastService.push('Erreur lors de la publication', { type: 'error', timeout: 5000 });

      // Rollback on unexpected error
      await this.rollbackUploadedFiles(
        PublicFileService.getInstance(),
        uploadedFileIds
      );
      return null;
    }
  }

  /**
   * Rollback uploaded files by deleting them
   */
  private async rollbackUploadedFiles(
    publicFileService: PublicFileService,
    fileIds: string[]
  ): Promise<void> {
    if (fileIds.length === 0) return;

    console.warn(`[FriendService] Rolling back ${fileIds.length} uploaded files`);

    for (const fileId of fileIds) {
      try {
        await publicFileService.deleteFile(fileId);
      } catch (error) {
        console.error(`[FriendService] Failed to delete file ${fileId} during rollback:`, error);
      }
    }
  }

  /**
   * Get current user's public manifest URL
   */
  public async getMyPublicUrl(): Promise<string | null> {
    const db = await IndexedDBService.getInstance();
    return await db.getData('myPublicUrl');
  }

  /**
   * Check if user has published public data
   */
  public async hasPublishedData(): Promise<boolean> {
    const url = await this.getMyPublicUrl();
    return url !== null && url !== undefined;
  }

  // ========== FRIEND MANAGEMENT METHODS (Phase 2) ==========

  /**
   * Generic fetch method for JSON data
   * Automatically uses GoogleDriveApiService for Google Drive URLs to bypass CORS
   */
  private async fetchJson<T>(url: string, errorContext: string): Promise<T | null> {
    try {
      const gdrive = GoogleDriveApiService.getInstance();

      // Use GoogleDriveApiService for Google Drive URLs (bypasses CORS)
      if (gdrive.isGoogleDriveUrl(url)) {
        console.log('[FriendService] Using GoogleDriveApiService for Google Drive URL');
        return await gdrive.fetchJsonFromUrl<T>(url);
      }

      // Standard fetch for other URLs
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        console.error(`[FriendService] ${errorContext}: ${response.status}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error(`[FriendService] ${errorContext}:`, error);
      return null;
    }
  }

  /**
   * Fetch friend's manifest from their public URL
   */
  private async fetchManifest(url: string): Promise<PublicManifest | null> {
    return this.fetchJson<PublicManifest>(url, 'Failed to fetch manifest');
  }

  /**
   * Fetch activities for a specific year
   */
  private async fetchYearActivities(url: string): Promise<any | null> {
    return this.fetchJson<any>(url, 'Failed to fetch year activities');
  }

  /**
   * Fetch the most recent N activities from a friend across all years
   * @param manifest Friend's public manifest
   * @param limit Number of recent activities to fetch (default: 30)
   * @returns Array of activities sorted by date (most recent first)
   */
  private async fetchRecentActivities(manifest: PublicManifest, limit: number = 30): Promise<any[]> {
    console.log(`[FriendService] Fetching ${limit} most recent activities`);

    const allActivities: any[] = [];

    // Sort years descending (most recent first: 2026, 2025, 2024...)
    const sortedYears = [...manifest.availableYears].sort((a, b) => b.year - a.year);

    for (const yearEntry of sortedYears) {
      if (allActivities.length >= limit) break;

      console.log(`[FriendService] Fetching year ${yearEntry.year} (${yearEntry.activityCount} activities)`);
      const yearData = await this.fetchYearActivities(yearEntry.fileUrl);

      if (yearData?.activities) {
        // Add year to each activity for tracking
        const activitiesWithYear = yearData.activities.map((activity: any) => ({
          ...activity,
          year: yearEntry.year
        }));

        allActivities.push(...activitiesWithYear);
      }

      // Stop if we have enough
      if (allActivities.length >= limit) {
        break;
      }
    }

    // Sort by date and take only the requested limit
    return allActivities
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, limit);
  }

  /**
   * Fetch ALL activities from a friend across all available years
   * @param manifest Friend's public manifest
   * @returns Array of all activities sorted by date (most recent first)
   */
  private async fetchAllActivities(manifest: PublicManifest): Promise<any[]> {
    console.log(`[FriendService] Fetching ALL activities from ${manifest.availableYears.length} years`);

    const allActivities: any[] = [];

    // Sort years descending for user feedback (shows recent first)
    const sortedYears = [...manifest.availableYears].sort((a, b) => b.year - a.year);

    for (const yearEntry of sortedYears) {
      console.log(`[FriendService] Fetching year ${yearEntry.year} (${yearEntry.activityCount} activities)`);

      const yearData = await this.fetchYearActivities(yearEntry.fileUrl);

      if (yearData?.activities) {
        const activitiesWithYear = yearData.activities.map((activity: any) => ({
          ...activity,
          year: yearEntry.year
        }));

        allActivities.push(...activitiesWithYear);
      }
    }

    // Sort by date descending
    return allActivities.sort((a, b) =>
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
  }

  /**
   * Generate a unique friend ID from their public URL using SHA-256
   */
  private async generateFriendId(publicUrl: string): Promise<string> {
    // Use Web Crypto API for robust hashing
    const encoder = new TextEncoder();
    const data = encoder.encode(publicUrl);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Take first 12 characters for a short but collision-resistant ID
    return 'friend_' + hashHex.substring(0, 12);
  }

  /**
   * Validate that friend ID is unique (no collision)
   */
  private async validateFriendIdUnique(friendId: string, publicUrl: string): Promise<boolean> {
    const db = await IndexedDBService.getInstance();
    const existingFriend = await db.getDataFromStore('friends', friendId).catch(() => null);

    if (!existingFriend) {
      return true; // No collision
    }

    // Check if it's the same friend (same URL)
    if (existingFriend.publicUrl === publicUrl) {
      return true; // Same friend, not a collision
    }

    // Different URL with same ID = collision
    console.error(`[FriendService] Hash collision detected for ${friendId}`);
    return false;
  }

  /**
   * Add a friend by their public manifest URL
   */
  public async addFriendByUrl(publicUrl: string, customUsername?: string): Promise<Friend | null> {
    try {
      // Support both share URLs and direct manifest URLs (backward compatibility)
      let manifestUrl = publicUrl;
      if (ShareUrlService.isShareUrl(publicUrl)) {
        const unwrapped = ShareUrlService.unwrapManifestUrl(publicUrl);
        if (!unwrapped) {
          ToastService.push('URL de partage invalide', { type: 'error', timeout: 4000 });
          return null;
        }
        manifestUrl = unwrapped;
        console.log('[FriendService] Unwrapped share URL to manifest URL');
      }

      // Fetch manifest to get profile info
      const manifest = await this.fetchManifest(manifestUrl);
      if (!manifest) {
        ToastService.push('Impossible de charger le profil', { type: 'error', timeout: 4000 });
        return null;
      }

      // Generate friend ID based on manifest URL (not share URL) for consistency
      // This ensures the same friend is recognized regardless of URL format
      const friendId = await this.generateFriendId(manifestUrl);
      const db = await IndexedDBService.getInstance();

      // Validate friend ID is unique (no collision)
      const isUnique = await this.validateFriendIdUnique(friendId, manifestUrl);
      if (!isUnique) {
        ToastService.push('Erreur: collision d\'identifiant', { type: 'error', timeout: 4000 });
        return null;
      }

      // Check if friend already exists
      const existingFriend = await db.getDataFromStore('friends', friendId).catch(() => null);
      if (existingFriend) {
        ToastService.push('Cet ami est déjà ajouté', { type: 'warning', timeout: 3000 });
        return existingFriend;
      }

      // Create Friend object
      // Store the original publicUrl (could be share URL or direct URL)
      const friend: Friend = {
        id: friendId,
        username: customUsername || manifest.profile.username,
        profilePhoto: manifest.profile.profilePhoto,
        bio: manifest.profile.bio,
        publicUrl: manifestUrl,  // Store manifest URL for consistency
        addedAt: Date.now(),
        lastFetched: Date.now(),
        lastModified: Date.now(),
        syncEnabled: true
      };

      // Save to IndexedDB
      await db.addItemsToStore('friends', [friend], (f) => f.id);

      ToastService.push(`${friend.username} ajouté avec succès!`, { type: 'success', timeout: 3000 });

      // Fetch recent activities immediately (quick sync)
      console.log('[FriendService] Quick syncing friend activities...');
      const syncResult = await this.syncFriendActivitiesQuick(friendId, 30);

      if (syncResult.success && syncResult.activitiesAdded > 0) {
        ToastService.push(
          `${syncResult.activitiesAdded} activités récentes synchronisées`,
          { type: 'success', timeout: 3000 }
        );
      }

      return friend;
    } catch (error) {
      console.error('[FriendService] Error adding friend:', error);
      ToastService.push('Erreur lors de l\'ajout', { type: 'error', timeout: 4000 });
      return null;
    }
  }

  /**
   * Get all friends
   */
  public async getAllFriends(): Promise<Friend[]> {
    const db = await IndexedDBService.getInstance();
    return await db.getAllData('friends');
  }

  /**
   * Remove a friend and their activities
   */
  public async removeFriend(friendId: string): Promise<void> {
    try {
      const db = await IndexedDBService.getInstance();

      // Remove friend
      await db.deleteFromStore('friends', friendId);

      // Remove friend's activities
      const allActivities = await db.getAllData('friend_activities');
      const friendActivities = allActivities.filter((a: any) => a.friendId === friendId);

      if (friendActivities.length > 0) {
        const activityKeys = friendActivities.map(a => a.id);
        await db.deleteMultipleFromStore('friend_activities', activityKeys);
      }

      ToastService.push('Ami supprimé', { type: 'success', timeout: 2000 });
    } catch (error) {
      console.error('[FriendService] Error removing friend:', error);
      ToastService.push('Erreur lors de la suppression', { type: 'error', timeout: 4000 });
    }
  }

  /**
   * Quick sync: Fetch recent activities from a friend (default: last 30)
   * @param friendId Friend's ID
   * @param limit Number of recent activities to sync (default: 30)
   * @returns Sync result with stats
   */
  public async syncFriendActivitiesQuick(
    friendId: string,
    limit: number = 30
  ): Promise<FriendSyncResult> {
    const startTime = performance.now();
    console.log(`[FriendService] Quick sync for friend ${friendId} (${limit} activities)`);

    const db = await IndexedDBService.getInstance();

    try {
      // Get friend info
      const friend: Friend = await db.getDataFromStore('friends', friendId);
      if (!friend) {
        return {
          friendId,
          success: false,
          error: 'Friend not found',
          activitiesAdded: 0,
          lastFetched: Date.now(),
          timestamp: Date.now()
        };
      }

      // Fetch manifest
      const manifest = await this.fetchManifest(friend.publicUrl);
      if (!manifest) {
        return {
          friendId,
          success: false,
          error: 'Failed to fetch manifest',
          activitiesAdded: 0,
          lastFetched: Date.now(),
          timestamp: Date.now()
        };
      }

      // Fetch recent activities (NEW METHOD)
      const recentActivities = await this.fetchRecentActivities(manifest, limit);

      // Get existing activities for deduplication
      const existingActivities = await db.getAllData('friend_activities');
      const existingIds = new Set(
        existingActivities
          .filter((a: any) => a.friendId === friendId)
          .map((a: any) => a.id)
      );

      // Transform to FriendActivity format
      const friendActivities = recentActivities.map((activity: any) => ({
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
      }));

      // Filter new activities
      const newActivities = friendActivities.filter(
        (activity: any) => !existingIds.has(activity.id)
      );

      // Store new activities
      let totalAdded = 0;
      if (newActivities.length > 0) {
        await db.addItemsToStore('friend_activities', newActivities, (a) => a.id);
        totalAdded = newActivities.length;
      }

      // Update friend's lastSyncTime
      friend.lastSyncTime = Date.now();
      friend.lastFetched = Date.now();
      await db.addItemsToStore('friends', [friend], (f) => f.id);

      const duration = performance.now() - startTime;
      console.log(`[FriendService] Quick sync completed: ${totalAdded} new activities (${duration.toFixed(0)}ms)`);

      return {
        friendId,
        success: true,
        activitiesAdded: totalAdded,
        lastFetched: Date.now(),
        timestamp: Date.now()
      };

    } catch (error) {
      console.error(`[FriendService] Error in quick sync for ${friendId}:`, error);
      return {
        friendId,
        success: false,
        error: String(error),
        activitiesAdded: 0,
        lastFetched: Date.now(),
        timestamp: Date.now()
      };
    }
  }

  /**
   * Full sync: Fetch ALL activities from a friend (all years)
   * @param friendId Friend's ID
   * @returns Sync result with stats
   */
  public async syncFriendActivitiesAll(friendId: string): Promise<FriendSyncResult> {
    const startTime = performance.now();
    console.log(`[FriendService] Full sync for friend ${friendId}`);

    const db = await IndexedDBService.getInstance();

    try {
      // Get friend info
      const friend: Friend = await db.getDataFromStore('friends', friendId);
      if (!friend) {
        return {
          friendId,
          success: false,
          error: 'Friend not found',
          activitiesAdded: 0,
          lastFetched: Date.now(),
          timestamp: Date.now()
        };
      }

      // Fetch manifest
      const manifest = await this.fetchManifest(friend.publicUrl);
      if (!manifest) {
        return {
          friendId,
          success: false,
          error: 'Failed to fetch manifest',
          activitiesAdded: 0,
          lastFetched: Date.now(),
          timestamp: Date.now()
        };
      }

      // Fetch ALL activities (NEW METHOD)
      const allActivities = await this.fetchAllActivities(manifest);

      // Get existing activities for deduplication
      const existingActivities = await db.getAllData('friend_activities');
      const existingIds = new Set(
        existingActivities
          .filter((a: any) => a.friendId === friendId)
          .map((a: any) => a.id)
      );

      // Transform to FriendActivity format
      const friendActivities = allActivities.map((activity: any) => ({
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
      }));

      // Filter new activities
      const newActivities = friendActivities.filter(
        (activity: any) => !existingIds.has(activity.id)
      );

      // Store new activities
      let totalAdded = 0;
      if (newActivities.length > 0) {
        await db.addItemsToStore('friend_activities', newActivities, (a) => a.id);
        totalAdded = newActivities.length;
      }

      // Update friend's lastSyncTime and mark as fully synced
      friend.lastSyncTime = Date.now();
      friend.lastFetched = Date.now();
      friend.fullySynced = true; // NEW FLAG
      await db.addItemsToStore('friends', [friend], (f) => f.id);

      const duration = performance.now() - startTime;
      console.log(`[FriendService] Full sync completed: ${totalAdded} new activities from ${allActivities.length} total (${duration.toFixed(0)}ms)`);

      return {
        friendId,
        success: true,
        activitiesAdded: totalAdded,
        totalActivities: allActivities.length,
        lastFetched: Date.now(),
        timestamp: Date.now()
      };

    } catch (error) {
      console.error(`[FriendService] Error in full sync for ${friendId}:`, error);
      return {
        friendId,
        success: false,
        error: String(error),
        activitiesAdded: 0,
        lastFetched: Date.now(),
        timestamp: Date.now()
      };
    }
  }

  /**
   * Refresh all friends' activities
   */
  public async refreshAllFriends(): Promise<FriendSyncResult[]> {
    const friends = await this.getAllFriends();
    const results: FriendSyncResult[] = [];

    for (const friend of friends) {
      if (friend.syncEnabled) {
        // Use quick sync (30 most recent activities)
        const result = await this.syncFriendActivitiesQuick(friend.id, 30);
        results.push(result);
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalActivities = results.reduce((sum, r) => sum + r.activitiesAdded, 0);

    if (successCount > 0) {
      ToastService.push(
        `${successCount} ami(s) synchronisé(s), ${totalActivities} activité(s)`,
        { type: 'success', timeout: 3000 }
      );
    }

    return results;
  }
}
