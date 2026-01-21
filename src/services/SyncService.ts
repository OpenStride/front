import { StoragePluginManager } from '@/services/StoragePluginManager';
import type { StoragePlugin } from '@/types/storage';
import { IndexedDBService } from '@/services/IndexedDBService';
import { getActivityService } from '@/services/ActivityService';
import { ToastService } from '@/services/ToastService';
import type { Activity, ActivityDetails } from '@/types/activity';

/**
 * SyncService - Explicit sync orchestration with conflict detection
 *
 * Replaces StorageService with:
 * - Manual sync (user-initiated, not automatic)
 * - Incremental sync (only unsynced activities)
 * - Conflict detection via version counter
 * - LWW resolution with user notification
 */
export class SyncService {
    private static instance: SyncService;
    private pluginManager = StoragePluginManager.getInstance();
    private syncing = false;

    private constructor() { }

    public static getInstance(): SyncService {
        if (!SyncService.instance) {
            SyncService.instance = new SyncService();
        }
        return SyncService.instance;
    }

    /**
     * Main entry point: Sync all stores with all enabled storage plugins
     */
    public async syncNow(): Promise<{ success: boolean; activitiesSynced: number; errors: string[] }> {
        if (this.syncing) {
            console.warn('[SyncService] Sync already in progress');
            ToastService.push('Synchronisation déjà en cours', { type: 'info', timeout: 2000 });
            return { success: false, activitiesSynced: 0, errors: ['Sync already in progress'] };
        }

        this.syncing = true;
        const errors: string[] = [];
        let totalSynced = 0;

        try {
            console.log('[SyncService] 🔄 Starting sync...');
            ToastService.push('Synchronisation...', { type: 'info', timeout: 1000 });

            const plugins = await this.pluginManager.getMyStoragePlugins();
            if (plugins.length === 0) {
                console.warn('[SyncService] No storage plugins enabled');
                ToastService.push('Aucun stockage distant configuré', { type: 'warning', timeout: 3000 });
                return { success: false, activitiesSynced: 0, errors: ['No plugins'] };
            }

            // Sync activities with each plugin
            for (const plugin of plugins) {
                try {
                    const result = await this.syncActivities(plugin);
                    totalSynced += result.activitiesSynced;
                    if (result.errors.length > 0) {
                        errors.push(...result.errors);
                    }
                } catch (error) {
                    const msg = `Error syncing with ${plugin.label}: ${error}`;
                    console.error('[SyncService]', msg);
                    errors.push(msg);
                }
            }

            // Success
            if (errors.length === 0) {
                console.log(`[SyncService] ✅ Sync complete: ${totalSynced} activities`);
                ToastService.push(
                    totalSynced > 0
                        ? `✅ ${totalSynced} activité(s) synchronisée(s)`
                        : '✅ Tout est à jour',
                    { type: 'success', timeout: 3000 }
                );
                return { success: true, activitiesSynced: totalSynced, errors: [] };
            } else {
                console.warn(`[SyncService] ⚠️ Sync completed with errors:`, errors);
                ToastService.push(
                    `⚠️ Synchronisation partielle (${errors.length} erreur(s))`,
                    { type: 'warning', timeout: 4000 }
                );
                return { success: false, activitiesSynced: totalSynced, errors };
            }

        } catch (error) {
            console.error('[SyncService] ❌ Sync failed:', error);
            ToastService.push('❌ Échec de la synchronisation', { type: 'error', timeout: 4000 });
            return { success: false, activitiesSynced: 0, errors: [String(error)] };
        } finally {
            this.syncing = false;
        }
    }

    /**
     * Sync activities store with a specific plugin
     */
    private async syncActivities(plugin: StoragePlugin): Promise<{ activitiesSynced: number; errors: string[] }> {
        console.log(`[SyncService] Syncing activities with ${plugin.label}`);
        const errors: string[] = [];
        const activityService = await getActivityService();

        try {
            // 1. Get unsynced local activities
            const unsyncedActivities = await activityService.getUnsyncedActivities();
            console.log(`[SyncService] Found ${unsyncedActivities.length} unsynced activities`);

            // 2. Get remote activities
            const remoteActivities = await plugin.readRemote('activities') as Activity[];
            const remoteDetails = await plugin.readRemote('activity_details') as ActivityDetails[];

            // 3. Build maps for conflict detection
            const localMap = new Map<string, Activity>();
            for (const activity of unsyncedActivities) {
                localMap.set(activity.id, activity);
            }

            const remoteMap = new Map<string, Activity>();
            for (const activity of remoteActivities) {
                remoteMap.set(activity.id, activity);
            }

            // 4. Detect conflicts and prepare data
            const toPush: Activity[] = [];
            const toPull: Activity[] = [];
            const conflicts: Array<{ local: Activity; remote: Activity }> = [];

            for (const [id, local] of localMap.entries()) {
                const remote = remoteMap.get(id);

                if (!remote) {
                    // New local activity → push to remote
                    toPush.push(local);
                } else if (this.hasConflict(local, remote)) {
                    // Conflict detected
                    conflicts.push({ local, remote });
                } else if (local.version > remote.version) {
                    // Local is newer → push
                    toPush.push(local);
                }
            }

            // Check for new remote activities to pull
            for (const [id, remote] of remoteMap.entries()) {
                if (!localMap.has(id)) {
                    toPull.push(remote);
                }
            }

            console.log(`[SyncService] To push: ${toPush.length}, To pull: ${toPull.length}, Conflicts: ${conflicts.length}`);

            // 5. Resolve conflicts (LWW)
            for (const conflict of conflicts) {
                const winner = this.resolveConflict(conflict.local, conflict.remote);
                if (winner === conflict.local) {
                    toPush.push(conflict.local);
                } else {
                    toPull.push(conflict.remote);
                }
            }

            // 6. Pull new remote activities
            if (toPull.length > 0) {
                const db = await IndexedDBService.getInstance();
                for (const activity of toPull) {
                    // Ensure metadata
                    const activityToSave = {
                        ...activity,
                        synced: true  // Mark as synced since it came from remote
                    };
                    await db.addItemsToStore('activities', [activityToSave], (a: Activity) => a.id);
                }

                // Also pull corresponding details
                const detailsToPull = remoteDetails.filter(d => toPull.some(a => a.id === d.id));
                if (detailsToPull.length > 0) {
                    for (const details of detailsToPull) {
                        const detailsToSave = { ...details, synced: true };
                        await db.addItemsToStore('activity_details', [detailsToSave], (d: ActivityDetails) => d.id);
                    }
                }

                console.log(`[SyncService] Pulled ${toPull.length} activities from ${plugin.label}`);
            }

            // 7. Push local changes to remote
            if (toPush.length > 0) {
                // Merge with existing remote activities (keep ones we're not updating)
                const updatedRemoteActivities = [
                    ...remoteActivities.filter(r => !toPush.some(p => p.id === r.id)),
                    ...toPush
                ];

                await plugin.writeRemote('activities', updatedRemoteActivities);

                // Also push corresponding details
                const detailsToPush: ActivityDetails[] = [];
                for (const activity of toPush) {
                    const details = await activityService.getDetails(activity.id);
                    if (details) {
                        detailsToPush.push(details);
                    }
                }

                if (detailsToPush.length > 0) {
                    const updatedRemoteDetails = [
                        ...remoteDetails.filter(r => !detailsToPush.some(p => p.id === r.id)),
                        ...detailsToPush
                    ];
                    await plugin.writeRemote('activity_details', updatedRemoteDetails);
                }

                console.log(`[SyncService] Pushed ${toPush.length} activities to ${plugin.label}`);

                // Mark as synced locally
                const pushedIds = toPush.map(a => a.id);
                await activityService.markAsSynced(pushedIds);
            }

            return { activitiesSynced: toPush.length + toPull.length, errors };

        } catch (error) {
            const msg = `Failed to sync activities with ${plugin.label}: ${error}`;
            console.error('[SyncService]', msg);
            errors.push(msg);
            return { activitiesSynced: 0, errors };
        }
    }

    /**
     * Detect if there's a conflict between local and remote
     * Conflict = same version but different lastModified (both modified independently)
     */
    private hasConflict(local: Activity, remote: Activity): boolean {
        return local.version === remote.version && local.lastModified !== remote.lastModified;
    }

    /**
     * Resolve conflict using Last-Write-Wins
     * Returns the winner and shows notification to user
     */
    private resolveConflict(local: Activity, remote: Activity): Activity {
        const winner = local.lastModified > remote.lastModified ? local : remote;
        const loser = winner === local ? remote : local;

        console.warn(
            `[SyncService] ⚠️ Conflict detected for activity "${local.title || local.id}"`,
            `\nLocal: v${local.version} (${new Date(local.lastModified).toISOString()})`,
            `\nRemote: v${remote.version} (${new Date(remote.lastModified).toISOString()})`,
            `\nWinner: ${winner === local ? 'Local' : 'Remote'}`
        );

        ToastService.push(
            `⚠️ "${local.title || 'Activité'}" modifiée sur 2 appareils. Version la plus récente appliquée.`,
            { type: 'warning', timeout: 5000 }
        );

        return winner;
    }

    /**
     * Check if sync is currently in progress
     */
    public isSyncing(): boolean {
        return this.syncing;
    }
}

// Singleton factory
export function getSyncService(): SyncService {
    return SyncService.getInstance();
}
