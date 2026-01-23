import { IndexedDBService } from './IndexedDBService';
import type {
  Interaction,
  InteractionType,
  InteractionServiceEvent,
  InteractionSummary
} from '@/types/interaction';
import type { Friend } from '@/types/friend';

const COMMENT_MAX_LENGTH = 280;

/**
 * Service for managing local interactions (likes/comments) on friend activities.
 *
 * Responsibilities:
 * - CRUD operations for interactions in IndexedDB
 * - Validation (comment length, duplicate likes, ownership)
 * - Event emission for reactive UI updates
 *
 * Does NOT handle remote sync - see InteractionSyncService for that.
 */
export class InteractionService {
  private static instance: InteractionService;
  public emitter = new EventTarget();
  private publishDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {}

  public static getInstance(): InteractionService {
    if (!InteractionService.instance) {
      InteractionService.instance = new InteractionService();
    }
    return InteractionService.instance;
  }

  /**
   * Emit an interaction event for UI reactivity
   */
  private emitEvent(event: InteractionServiceEvent): void {
    this.emitter.dispatchEvent(
      new CustomEvent<InteractionServiceEvent>('interaction-event', { detail: event })
    );
  }

  /**
   * Get current user's stable ID.
   * The ID is generated ONCE on first publish and stored permanently.
   * Returns null if user hasn't published data yet.
   */
  public async getMyUserId(): Promise<string | null> {
    const db = await IndexedDBService.getInstance();

    // First check for stable stored ID (new approach)
    const storedUserId = await db.getData('myUserId');
    if (storedUserId) {
      return storedUserId;
    }

    // Fallback: check if user has published (legacy)
    const myPublicUrl = await db.getData('myPublicUrl');
    if (!myPublicUrl) {
      return null;
    }

    // Generate and store a stable ID (migration from old system)
    const newUserId = await this.generateAndStoreUserId();
    return newUserId;
  }

  /**
   * Generate a new stable user ID and store it permanently.
   * Called once on first publish or during migration.
   */
  public async generateAndStoreUserId(): Promise<string> {
    const db = await IndexedDBService.getInstance();

    // Check if already exists
    const existing = await db.getData('myUserId');
    if (existing) {
      return existing;
    }

    // Generate a random unique ID (not based on URL anymore)
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const hashHex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const userId = 'user_' + hashHex.substring(0, 12);

    // Store permanently
    await db.saveData('myUserId', userId);
    console.log('[InteractionService] Generated and stored stable userId:', userId);

    return userId;
  }

  /**
   * Get current user's username
   */
  public async getMyUsername(): Promise<string> {
    const db = await IndexedDBService.getInstance();
    return await db.getData('username') || 'Utilisateur';
  }

  /**
   * Generate a user ID from their public URL using SHA-256
   */
  private async generateUserId(publicUrl: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(publicUrl);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return 'friend_' + hashHex.substring(0, 12);
  }

  /**
   * Generate a unique interaction ID
   */
  private generateInteractionId(
    authorId: string,
    type: InteractionType,
    activityId: string,
    timestamp: number
  ): string {
    return `${authorId}_${type}_${activityId}_${timestamp}`;
  }

  // ========== MUTUAL FRIENDSHIP CHECK ==========

  /**
   * Check if the friendship with the activity owner is mutual
   * Returns true if the friend has us in their "following" list
   */
  public async isMutualFriend(friendUserId: string): Promise<boolean> {
    const db = await IndexedDBService.getInstance();
    const friends = await db.getAllData('friends') as Friend[];

    // Find the friend by their stable userId
    const friend = friends.find(f => f.userId === friendUserId);
    return friend?.followsMe === true;
  }

  // ========== AUTO-PUBLISH ==========

  /**
   * Trigger automatic publishing of interactions after a debounce period
   * Debounce prevents multiple rapid publishes when user likes several activities quickly
   */
  private triggerAutoPublish(): void {
    // Clear any existing timer
    if (this.publishDebounceTimer) {
      clearTimeout(this.publishDebounceTimer);
    }

    // Set new timer - publish after 2 seconds of inactivity
    this.publishDebounceTimer = setTimeout(async () => {
      try {
        // Dynamic import to avoid circular dependency
        const { getInteractionSyncService } = await import('./InteractionSyncService');
        const syncService = getInteractionSyncService();
        const result = await syncService.publishInteractions();

        if (result.success) {
          console.log(`[InteractionService] Auto-published ${result.interactionsSynced} interactions`);
        }
      } catch (error) {
        console.error('[InteractionService] Auto-publish failed:', error);
        // Silently fail - user can manually publish later via full publish
      }
    }, 2000);
  }

  // ========== LIKE OPERATIONS ==========

  /**
   * Add a like to a friend's activity
   */
  public async addLike(activityId: string, activityOwnerId: string): Promise<Interaction | null> {
    const db = await IndexedDBService.getInstance();

    // Get current user info
    const authorId = await this.getMyUserId();
    if (!authorId) {
      console.error('[InteractionService] Cannot add like: user not published');
      return null;
    }

    // Prevent liking own activities
    if (activityOwnerId === authorId) {
      console.warn('[InteractionService] Cannot like own activity');
      return null;
    }

    // Check mutual friendship
    if (!await this.isMutualFriend(activityOwnerId)) {
      console.warn('[InteractionService] Cannot like: not mutual friends');
      return null;
    }

    // Check if already liked
    if (await this.hasLiked(activityId, activityOwnerId)) {
      console.warn('[InteractionService] Already liked this activity');
      return null;
    }

    const authorUsername = await this.getMyUsername();
    const timestamp = Date.now();

    const interaction: Interaction = {
      id: this.generateInteractionId(authorId, 'like', activityId, timestamp),
      type: 'like',
      activityId,
      activityOwnerId,
      authorId,
      authorUsername,
      timestamp,
      lastModified: timestamp
    };

    await db.addItemsToStore('interactions', [interaction], i => i.id);

    this.emitEvent({
      type: 'interaction-added',
      interaction,
      activityId
    });

    // Auto-publish after adding like
    this.triggerAutoPublish();

    console.log(`[InteractionService] Like added on activity ${activityId} (mutual friend confirmed)`);
    return interaction;
  }

  /**
   * Remove a like from an activity
   */
  public async removeLike(activityId: string, activityOwnerId: string): Promise<void> {
    const db = await IndexedDBService.getInstance();
    const authorId = await this.getMyUserId();

    if (!authorId) {
      console.error('[InteractionService] Cannot remove like: user not published');
      return;
    }

    // Find my like on this activity
    const interactions = await this.getInteractionsForActivity(activityId, activityOwnerId);
    const myLike = interactions.find(i => i.type === 'like' && i.authorId === authorId);

    if (!myLike) {
      console.warn('[InteractionService] No like to remove');
      return;
    }

    await db.deleteFromStore('interactions', myLike.id);

    this.emitEvent({
      type: 'interaction-removed',
      interaction: myLike,
      activityId
    });

    // Auto-publish after removing like
    this.triggerAutoPublish();

    console.log(`[InteractionService] Like removed from activity ${activityId}`);
  }

  /**
   * Check if current user has liked an activity
   */
  public async hasLiked(activityId: string, activityOwnerId: string): Promise<boolean> {
    const authorId = await this.getMyUserId();
    if (!authorId) return false;

    const interactions = await this.getInteractionsForActivity(activityId, activityOwnerId);
    return interactions.some(i => i.type === 'like' && i.authorId === authorId);
  }

  // ========== COMMENT OPERATIONS ==========

  /**
   * Add a comment to a friend's activity
   */
  public async addComment(
    activityId: string,
    activityOwnerId: string,
    text: string
  ): Promise<Interaction | null> {
    const db = await IndexedDBService.getInstance();

    // Get current user info
    const authorId = await this.getMyUserId();
    if (!authorId) {
      console.error('[InteractionService] Cannot add comment: user not published');
      return null;
    }

    // Prevent commenting on own activities
    if (activityOwnerId === authorId) {
      console.warn('[InteractionService] Cannot comment on own activity');
      return null;
    }

    // Check mutual friendship
    if (!await this.isMutualFriend(activityOwnerId)) {
      console.warn('[InteractionService] Cannot comment: not mutual friends');
      return null;
    }

    // Validate and sanitize text
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      console.warn('[InteractionService] Empty comment rejected');
      return null;
    }

    if (trimmed.length > COMMENT_MAX_LENGTH) {
      console.warn(`[InteractionService] Comment exceeds ${COMMENT_MAX_LENGTH} chars`);
      return null;
    }

    // Sanitize HTML
    const sanitized = trimmed.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const authorUsername = await this.getMyUsername();
    const timestamp = Date.now();

    const interaction: Interaction = {
      id: this.generateInteractionId(authorId, 'comment', activityId, timestamp),
      type: 'comment',
      activityId,
      activityOwnerId,
      authorId,
      authorUsername,
      text: sanitized,
      timestamp,
      lastModified: timestamp
    };

    await db.addItemsToStore('interactions', [interaction], i => i.id);

    this.emitEvent({
      type: 'interaction-added',
      interaction,
      activityId
    });

    // Auto-publish after adding comment
    this.triggerAutoPublish();

    console.log(`[InteractionService] Comment added on activity ${activityId} (mutual friend confirmed)`);
    return interaction;
  }

  /**
   * Delete a comment (only own comments)
   */
  public async deleteComment(interactionId: string): Promise<void> {
    const db = await IndexedDBService.getInstance();
    const authorId = await this.getMyUserId();

    if (!authorId) {
      console.error('[InteractionService] Cannot delete comment: user not published');
      return;
    }

    // Get the interaction
    const interaction = await db.getDataFromStore('interactions', interactionId) as Interaction | null;

    if (!interaction) {
      console.warn('[InteractionService] Comment not found');
      return;
    }

    // Check ownership
    if (interaction.authorId !== authorId) {
      console.warn('[InteractionService] Cannot delete other user\'s comment');
      return;
    }

    await db.deleteFromStore('interactions', interactionId);

    this.emitEvent({
      type: 'interaction-removed',
      interaction,
      activityId: interaction.activityId
    });

    console.log(`[InteractionService] Comment ${interactionId} deleted`);
  }

  // ========== QUERY OPERATIONS ==========

  /**
   * Get all interactions for a specific activity
   */
  public async getInteractionsForActivity(
    activityId: string,
    activityOwnerId: string
  ): Promise<Interaction[]> {
    const db = await IndexedDBService.getInstance();
    const all = await db.getAllData('interactions') as Interaction[];

    return all
      .filter(i => i.activityId === activityId && i.activityOwnerId === activityOwnerId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get interaction summary for UI display
   */
  public async getInteractionSummary(
    activityId: string,
    activityOwnerId: string
  ): Promise<InteractionSummary> {
    const interactions = await this.getInteractionsForActivity(activityId, activityOwnerId);
    const authorId = await this.getMyUserId();

    const likes = interactions.filter(i => i.type === 'like');
    const comments = interactions.filter(i => i.type === 'comment');

    return {
      activityId,
      likeCount: likes.length,
      commentCount: comments.length,
      hasLiked: authorId ? likes.some(l => l.authorId === authorId) : false,
      lastComment: comments.length > 0 ? comments[0] : undefined
    };
  }

  /**
   * Get all my interactions (for publishing)
   */
  public async getMyInteractions(): Promise<Interaction[]> {
    const db = await IndexedDBService.getInstance();
    const authorId = await this.getMyUserId();

    if (!authorId) return [];

    const all = await db.getAllData('interactions') as Interaction[];
    return all.filter(i => i.authorId === authorId);
  }

  /**
   * Get my interactions grouped by year (for publishing to annual files)
   */
  public async getMyInteractionsByYear(): Promise<Map<number, Interaction[]>> {
    const myInteractions = await this.getMyInteractions();
    const yearMap = new Map<number, Interaction[]>();

    for (const interaction of myInteractions) {
      const year = new Date(interaction.timestamp).getFullYear();
      if (!yearMap.has(year)) {
        yearMap.set(year, []);
      }
      yearMap.get(year)!.push(interaction);
    }

    return yearMap;
  }

  /**
   * Store interactions fetched from a friend's public data
   */
  public async storeRemoteInteractions(interactions: Interaction[]): Promise<void> {
    if (interactions.length === 0) return;

    const db = await IndexedDBService.getInstance();
    await db.addItemsToStore('interactions', interactions, i => i.id);

    console.log(`[InteractionService] Stored ${interactions.length} remote interactions`);
  }

  /**
   * Get all interactions on my activities (from friends)
   * Used to display likes/comments others left on my activities
   */
  public async getInteractionsOnMyActivities(): Promise<Interaction[]> {
    const db = await IndexedDBService.getInstance();
    const myUserId = await this.getMyUserId();

    if (!myUserId) return [];

    const all = await db.getAllData('interactions') as Interaction[];
    return all.filter(i => i.activityOwnerId === myUserId);
  }
}

// Singleton factory
export function getInteractionService(): InteractionService {
  return InteractionService.getInstance();
}
