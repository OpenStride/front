import { IndexedDBService } from './IndexedDBService';
import type { Friend } from '@/types/friend';
import type { Interaction } from '@/types/interaction';

/**
 * InteractionMigrationService
 *
 * Service for migrating interaction data when ID formats change.
 * Handles the transition from old friend_xxx (hash-based) IDs to
 * new user_xxx (stable) IDs.
 *
 * Problem:
 * - Old interactions were stored with activityOwnerId = friend_xxx (hash of URL)
 * - New system uses stable user_xxx IDs stored in friend.userId
 * - When syncing, we look up by user_xxx but data has friend_xxx
 *
 * Solution:
 * - Build mapping: old friendId (hash) -> new userId (stable)
 * - Update existing interactions with the correct activityOwnerId
 */

/**
 * Migrate interaction owner IDs from old friend_xxx format to new user_xxx format.
 * This function should be called once to fix existing data.
 *
 * @returns Object with migration statistics
 */
export async function migrateInteractionOwnerIds(): Promise<{
  updated: number;
  skipped: number;
  errors: string[];
}> {
  const db = await IndexedDBService.getInstance();
  const friends = await db.getAllData('friends') as Friend[];
  const interactions = await db.getAllData('interactions') as Interaction[];

  console.log(`[InteractionMigration] Starting migration...`);
  console.log(`[InteractionMigration] Found ${friends.length} friends and ${interactions.length} interactions`);

  // Build mapping: old friendId (hash) -> new userId (stable)
  const idMapping = new Map<string, string>();
  for (const friend of friends) {
    if (friend.userId) {
      // friend.id is the hash-based ID (friend_xxx or hash of URL)
      // friend.userId is the stable ID (user_xxx)
      idMapping.set(friend.id, friend.userId);
      console.log(`[InteractionMigration] Mapping: ${friend.id} -> ${friend.userId} (${friend.username})`);
    }
  }

  if (idMapping.size === 0) {
    console.log(`[InteractionMigration] No friends with stable userId found. Migration skipped.`);
    return { updated: 0, skipped: interactions.length, errors: [] };
  }

  // Update interactions with old activityOwnerId
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const updatedInteractions: Interaction[] = [];

  for (const interaction of interactions) {
    const newOwnerId = idMapping.get(interaction.activityOwnerId);

    if (newOwnerId && newOwnerId !== interaction.activityOwnerId) {
      // Found a mapping, update the interaction
      const updatedInteraction: Interaction = {
        ...interaction,
        activityOwnerId: newOwnerId
      };
      updatedInteractions.push(updatedInteraction);
      updated++;
      console.log(`[InteractionMigration] Updating interaction ${interaction.id}: ${interaction.activityOwnerId} -> ${newOwnerId}`);
    } else if (!newOwnerId && interaction.activityOwnerId.startsWith('friend_')) {
      // Old format but no mapping available
      console.warn(`[InteractionMigration] No mapping for ${interaction.activityOwnerId} (interaction ${interaction.id})`);
      skipped++;
    } else {
      // Already using new format or no migration needed
      skipped++;
    }
  }

  // Batch update all modified interactions
  if (updatedInteractions.length > 0) {
    try {
      await db.addItemsToStore('interactions', updatedInteractions, i => i.id);
      console.log(`[InteractionMigration] Saved ${updatedInteractions.length} updated interactions`);
    } catch (error) {
      const errorMsg = `Failed to save updated interactions: ${error}`;
      console.error(`[InteractionMigration] ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  console.log(`[InteractionMigration] Migration complete: ${updated} updated, ${skipped} skipped, ${errors.length} errors`);

  return { updated, skipped, errors };
}

/**
 * Check if migration is needed by looking for interactions with old ID format
 * that have a corresponding friend with a stable userId.
 */
export async function isMigrationNeeded(): Promise<boolean> {
  const db = await IndexedDBService.getInstance();
  const friends = await db.getAllData('friends') as Friend[];
  const interactions = await db.getAllData('interactions') as Interaction[];

  // Build set of old IDs that have new mappings
  const oldIdsWithMapping = new Set<string>();
  for (const friend of friends) {
    if (friend.userId) {
      oldIdsWithMapping.add(friend.id);
    }
  }

  // Check if any interaction uses an old ID that has a mapping
  for (const interaction of interactions) {
    if (oldIdsWithMapping.has(interaction.activityOwnerId)) {
      return true;
    }
  }

  return false;
}

/**
 * Debug helper: Log current state of IDs for troubleshooting
 */
export async function debugInteractionIds(): Promise<void> {
  const db = await IndexedDBService.getInstance();
  const friends = await db.getAllData('friends') as Friend[];
  const interactions = await db.getAllData('interactions') as Interaction[];
  const myUserId = await db.getData('myUserId');

  console.group('[InteractionMigration] Debug Info');
  console.log('My userId:', myUserId);

  console.log('\nFriends:');
  for (const friend of friends) {
    console.log(`  - ${friend.username}: id=${friend.id}, userId=${friend.userId || 'NOT SET'}`);
  }

  console.log('\nInteractions:');
  const groupedByOwner: Record<string, number> = {};
  for (const interaction of interactions) {
    groupedByOwner[interaction.activityOwnerId] = (groupedByOwner[interaction.activityOwnerId] || 0) + 1;
  }
  for (const [ownerId, count] of Object.entries(groupedByOwner)) {
    console.log(`  - ${ownerId}: ${count} interactions`);
  }

  console.groupEnd();
}
