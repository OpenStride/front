import { Activity, ActivityDetails } from '@/types/activity';
import { IndexedDBService } from './IndexedDBService';
import type { IActivityService } from '@/types/plugin-context';

/**
 * Events emitted by ActivityService
 */
export interface ActivityServiceEvent {
    type: 'saved' | 'updated' | 'deleted';
    activity: Activity;
    details?: ActivityDetails;
}

/**
 * Unified CRUD service for activities with transactional writes,
 * versioning, and soft delete support.
 *
 * Replaces ActivityDBService with better data integrity guarantees.
 *
 * Emits events for aggregation and other reactive services:
 * - 'activity-changed': Fired after save/update/delete with { type, activity, details }
 *
 * Implements IActivityService for plugin dependency injection.
 */
export class ActivityService implements IActivityService {
    private static instance: ActivityService | null = null;
    private db: IndexedDBService | null = null;
    public emitter = new EventTarget();

    private constructor() { }

    public static async getInstance(): Promise<ActivityService> {
        if (!ActivityService.instance) {
            const service = new ActivityService();
            service.db = await IndexedDBService.getInstance();
            ActivityService.instance = service;
        }
        return ActivityService.instance;
    }

    /**
     * Save activity and details in a single atomic transaction
     * This ensures data consistency - both succeed or both fail
     */
    public async saveActivityWithDetails(activity: Activity, details: ActivityDetails): Promise<void> {
        if (!this.db || !(this.db as any).db) {
            throw new Error('IndexedDB not initialized');
        }

        // Ensure metadata fields are set
        const now = Date.now();
        const activityToSave: Activity = {
            ...activity,
            version: activity.version ?? 0,
            lastModified: now,
            synced: false,
            deleted: false
        };

        const detailsToSave: ActivityDetails = {
            ...details,
            version: details.version ?? 0,
            lastModified: now,
            synced: false,
            deleted: false
        };

        return new Promise((resolve, reject) => {
            const idb = (this.db as any).db as IDBDatabase;
            const tx = idb.transaction(['activities', 'activity_details'], 'readwrite');

            tx.objectStore('activities').put(activityToSave);
            tx.objectStore('activity_details').put(detailsToSave);

            tx.oncomplete = () => {
                // Emit dbChange events for both stores (backward compatibility)
                (this.db as any).emitter.dispatchEvent(new CustomEvent('dbChange', {
                    detail: { store: 'activities', key: activity.id }
                }));
                (this.db as any).emitter.dispatchEvent(new CustomEvent('dbChange', {
                    detail: { store: 'activity_details', key: details.id }
                }));

                // Emit activity-changed event for reactive services (e.g., AggregationService)
                this.emitter.dispatchEvent(new CustomEvent<ActivityServiceEvent>('activity-changed', {
                    detail: {
                        type: 'saved',
                        activity: activityToSave,
                        details: detailsToSave
                    }
                }));

                console.log(`[ActivityService] Saved activity ${activity.id} with details`);
                resolve();
            };

            tx.onerror = () => {
                console.error('[ActivityService] Transaction failed:', tx.error);
                reject(tx.error);
            };
        });
    }

    /**
     * Save multiple activities with details in bulk (atomic transaction)
     */
    public async saveActivitiesWithDetails(activities: Activity[], details: ActivityDetails[]): Promise<void> {
        if (activities.length !== details.length) {
            throw new Error('Activities and details arrays must have same length');
        }

        if (!this.db || !(this.db as any).db) {
            throw new Error('IndexedDB not initialized');
        }

        const now = Date.now();

        return new Promise((resolve, reject) => {
            const idb = (this.db as any).db as IDBDatabase;
            const tx = idb.transaction(['activities', 'activity_details'], 'readwrite');

            for (let i = 0; i < activities.length; i++) {
                const activityToSave: Activity = {
                    ...activities[i],
                    version: activities[i].version ?? 0,
                    lastModified: now,
                    synced: false,
                    deleted: false
                };

                const detailsToSave: ActivityDetails = {
                    ...details[i],
                    version: details[i].version ?? 0,
                    lastModified: now,
                    synced: false,
                    deleted: false
                };

                tx.objectStore('activities').put(activityToSave);
                tx.objectStore('activity_details').put(detailsToSave);
            }

            tx.oncomplete = () => {
                // Emit batch change event (backward compatibility)
                (this.db as any).emitter.dispatchEvent(new CustomEvent('dbChange', {
                    detail: { store: 'activities', key: '' }
                }));

                // Emit activity-changed event for each saved activity
                for (let i = 0; i < activities.length; i++) {
                    this.emitter.dispatchEvent(new CustomEvent<ActivityServiceEvent>('activity-changed', {
                        detail: {
                            type: 'saved',
                            activity: {
                                ...activities[i],
                                version: activities[i].version ?? 0,
                                lastModified: now,
                                synced: false,
                                deleted: false
                            },
                            details: {
                                ...details[i],
                                version: details[i].version ?? 0,
                                lastModified: now,
                                synced: false,
                                deleted: false
                            }
                        }
                    }));
                }

                console.log(`[ActivityService] Saved ${activities.length} activities with details`);
                resolve();
            };

            tx.onerror = () => {
                console.error('[ActivityService] Bulk save failed:', tx.error);
                reject(tx.error);
            };
        });
    }

    /**
     * Update activity fields (increments version, updates timestamp)
     */
    public async updateActivity(id: string, updates: Partial<Activity>): Promise<void> {
        const activity = await this.getActivity(id);
        if (!activity) {
            throw new Error(`Activity ${id} not found`);
        }

        const updatedActivity: Activity = {
            ...activity,
            ...updates,
            id: activity.id,  // Prevent ID change
            version: activity.version + 1,
            lastModified: Date.now(),
            synced: false
        };

        await (this.db as any).addItemsToStore('activities', [updatedActivity], (a: Activity) => a.id);

        // Emit dbChange event (backward compatibility)
        (this.db as any).emitter.dispatchEvent(new CustomEvent('dbChange', {
            detail: { store: 'activities', key: id }
        }));

        // Emit activity-changed event
        const details = await this.getDetails(id);
        this.emitter.dispatchEvent(new CustomEvent<ActivityServiceEvent>('activity-changed', {
            detail: {
                type: 'updated',
                activity: updatedActivity,
                details: details || undefined
            }
        }));

        console.log(`[ActivityService] Updated activity ${id} (version ${updatedActivity.version})`);
    }

    /**
     * Soft delete activity (sets deleted flag instead of removing)
     */
    public async deleteActivity(id: string): Promise<void> {
        const activity = await this.getActivity(id);
        if (!activity) {
            throw new Error(`Activity ${id} not found`);
        }

        const deletedActivity: Activity = {
            ...activity,
            version: activity.version + 1,
            lastModified: Date.now(),
            deleted: true,
            synced: false
        };

        await (this.db as any).addItemsToStore('activities', [deletedActivity], (a: Activity) => a.id);

        // Emit dbChange event (backward compatibility)
        (this.db as any).emitter.dispatchEvent(new CustomEvent('dbChange', {
            detail: { store: 'activities', key: id }
        }));

        // Emit activity-changed event
        const details = await this.getDetails(id);
        this.emitter.dispatchEvent(new CustomEvent<ActivityServiceEvent>('activity-changed', {
            detail: {
                type: 'deleted',
                activity: deletedActivity,
                details: details || undefined
            }
        }));

        console.log(`[ActivityService] Soft deleted activity ${id}`);
    }

    /**
     * Get activities with optional filters
     */
    public async getActivities(params: {
        offset?: number;
        limit?: number;
        includeDeleted?: boolean;
    } = {}): Promise<Activity[]> {
        const { offset = 0, limit = 10, includeDeleted = false } = params;

        const all = await (this.db as any).getAllData('activities') as Activity[];

        let filtered = all;
        if (!includeDeleted) {
            filtered = all.filter(a => !a.deleted);
        }

        return filtered
            .sort((a, b) => b.startTime - a.startTime)
            .slice(offset, offset + limit);
    }

    /**
     * Get single activity by ID
     */
    public async getActivity(id: string): Promise<Activity | undefined> {
        const result = await (this.db as any).getDataFromStore('activities', id) as Activity | null;
        return result ?? undefined;
    }

    /**
     * Get all activities (excluding deleted)
     * Used by plugins via IActivityService interface
     */
    public async getAllActivities(): Promise<Activity[]> {
        const all = await (this.db as any).getAllData('activities') as Activity[];
        return all.filter(a => !a.deleted).sort((a, b) => b.startTime - a.startTime);
    }

    /**
     * Get activity details by ID
     */
    public async getDetails(id: string): Promise<ActivityDetails | undefined> {
        const result = await (this.db as any).getDataFromStore('activity_details', id) as ActivityDetails | null;
        return result ?? undefined;
    }

    /**
     * Mark activities as synced
     */
    public async markAsSynced(activityIds: string[]): Promise<void> {
        if (!this.db || !(this.db as any).db) {
            throw new Error('IndexedDB not initialized');
        }

        return new Promise((resolve, reject) => {
            const idb = (this.db as any).db as IDBDatabase;
            const tx = idb.transaction(['activities', 'activity_details'], 'readwrite');

            for (const id of activityIds) {
                const activityReq = tx.objectStore('activities').get(id);
                activityReq.onsuccess = () => {
                    const activity = activityReq.result;
                    if (activity) {
                        activity.synced = true;
                        tx.objectStore('activities').put(activity);
                    }
                };

                const detailsReq = tx.objectStore('activity_details').get(id);
                detailsReq.onsuccess = () => {
                    const details = detailsReq.result;
                    if (details) {
                        details.synced = true;
                        tx.objectStore('activity_details').put(details);
                    }
                };
            }

            tx.oncomplete = () => {
                console.log(`[ActivityService] Marked ${activityIds.length} activities as synced`);
                resolve();
            };

            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Get unsynced activities (for incremental sync)
     */
    public async getUnsyncedActivities(): Promise<Activity[]> {
        const all = await (this.db as any).getAllData('activities') as Activity[];
        return all.filter(a => !a.synced && !a.deleted);
    }
}

// Singleton factory
let instance: ActivityService | null = null;

export async function getActivityService(): Promise<ActivityService> {
    if (!instance) {
        instance = await ActivityService.getInstance();
    }
    return instance;
}
