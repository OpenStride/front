/**
 * Interaction types for likes and comments on friend activities
 */

export type InteractionType = 'like' | 'comment';

/**
 * Core interaction model stored in IndexedDB
 */
export interface Interaction {
  id: string;                     // composite: ${authorId}_${type}_${activityId}_${timestamp}
  type: InteractionType;

  // Activity reference
  activityOwnerId: string;        // friendId of activity author
  activityId: string;             // original activity ID

  // Author (the person who made the interaction)
  authorId: string;               // user ID (hash of publicUrl)
  authorUsername: string;         // username (denormalized for display)

  // Content
  text?: string;                  // required for comments, max 280 chars

  // Timestamps
  timestamp: number;              // creation time in ms
  lastModified: number;           // for sync tracking
}

/**
 * Entry format for interactions in annual JSON files (without author metadata)
 */
export interface InteractionEntry {
  type: InteractionType;
  activityId: string;
  authorId: string;
  authorUsername: string;
  text?: string;
  timestamp: number;
}

/**
 * Annual interaction file structure on remote storage
 * Grouped by activityOwnerId for O(1) lookup
 */
export interface InteractionYearFile {
  year: number;
  lastModified: number;
  interactions: {
    [activityOwnerId: string]: InteractionEntry[];
  };
}

/**
 * Summary for UI display (counters + preview)
 */
export interface InteractionSummary {
  activityId: string;
  likeCount: number;
  commentCount: number;
  hasLiked: boolean;              // current user has liked
  lastComment?: Interaction;      // most recent comment (for preview)
}

/**
 * Sync result for interaction operations
 */
export interface InteractionSyncResult {
  success: boolean;
  interactionsSynced: number;
  errors: string[];
}

/**
 * Events emitted by InteractionService
 */
export interface InteractionServiceEvent {
  type: 'interaction-added' | 'interaction-removed';
  interaction: Interaction;
  activityId: string;
}

/**
 * Events emitted by InteractionSyncService
 */
export interface InteractionSyncServiceEvent {
  type: 'sync-started' | 'sync-completed' | 'sync-failed';
  result?: InteractionSyncResult;
  error?: string;
}
