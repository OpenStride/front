import type { Activity, ActivityDetails } from './activity';

/**
 * Plugin Context Interfaces for Dependency Injection
 *
 * These interfaces define the contract between plugins and core services.
 * Plugins should use these interfaces instead of importing services directly.
 *
 * Benefits:
 * - Decoupling: Plugins don't depend on concrete service implementations
 * - Testability: Easy to mock services in plugin tests
 * - Stability: Core service refactoring won't break plugins
 * - Type safety: TypeScript enforces the contract
 */

/**
 * Activity management interface for plugins
 *
 * This interface provides safe access to activity CRUD operations.
 * Use this instead of importing ActivityService directly.
 */
export interface IActivityService {
    /**
     * Save an activity with its details atomically
     * Both succeed or both fail - no partial writes
     */
    saveActivityWithDetails(activity: Activity, details: ActivityDetails): Promise<void>;

    /**
     * Save multiple activities with their details in batch
     * Faster than calling saveActivityWithDetails multiple times
     */
    saveActivitiesWithDetails(activities: Activity[], details: ActivityDetails[]): Promise<void>;

    /**
     * Get activity summary by ID
     * Returns undefined if activity doesn't exist
     */
    getActivity(id: string): Promise<Activity | undefined>;

    /**
     * Get all activity summaries
     * Returns array of Activity objects (without samples)
     */
    getAllActivities(): Promise<Activity[]>;

    /**
     * Get full activity details (including samples) by ID
     * Returns undefined if details don't exist
     */
    getDetails(id: string): Promise<ActivityDetails | undefined>;

    /**
     * Delete an activity (soft delete)
     * Sets deleted flag instead of removing from database
     */
    deleteActivity(id: string): Promise<void>;

    /**
     * Get activities that haven't been synced to remote storage
     * Used by sync plugins
     */
    getUnsyncedActivities(): Promise<Activity[]>;

    /**
     * Mark activities as synced after successful remote push
     * Used by storage plugins
     */
    markAsSynced(activityIds: string[]): Promise<void>;
}

/**
 * Storage interface for plugins
 *
 * This interface provides safe access to settings and plugin-specific storage.
 * Use this instead of importing IndexedDBService directly.
 */
export interface IStorageService {
    /**
     * Get a value from settings store
     * Returns undefined if key doesn't exist
     *
     * Example: await storage.getData('myPluginConfig')
     */
    getData<T = any>(key: string): Promise<T | undefined>;

    /**
     * Save a value to settings store
     * Overwrites existing value if key exists
     *
     * Example: await storage.saveData('myPluginConfig', { enabled: true })
     */
    saveData<T = any>(key: string, data: T): Promise<void>;

    /**
     * Delete a value from settings store
     *
     * Example: await storage.deleteData('myPluginConfig')
     */
    deleteData(key: string): Promise<void>;

    /**
     * Export all data from a specific store
     * Use with caution - can return large datasets
     *
     * Available stores: 'activities', 'activity_details', 'settings',
     * 'notifLogs', 'aggregatedData', 'friends', 'friend_activities'
     */
    exportDB(storeName: string): Promise<any[]>;

    /**
     * Add or update items in a specific store
     * Useful for bulk operations
     */
    addItemsToStore<T>(storeName: string, items: T[], keyFn: (item: T) => any): Promise<void>;
}

/**
 * Plugin Context - Injected into plugins
 *
 * This is the main dependency injection container for plugins.
 * Plugins receive this context and use it to interact with core services.
 *
 * Example usage in a plugin:
 *
 * ```typescript
 * export default {
 *   id: 'my-plugin',
 *   async refreshData(context: PluginContext) {
 *     const activities = await context.activity.getAllActivities();
 *     // ... process activities
 *     await context.activity.saveActivityWithDetails(activity, details);
 *   }
 * } as ProviderPlugin;
 * ```
 */
export interface PluginContext {
    /**
     * Activity service for CRUD operations on activities
     */
    activity: IActivityService;

    /**
     * Storage service for settings and plugin-specific data
     */
    storage: IStorageService;
}

/**
 * Factory function to create a PluginContext
 * Called by plugin managers to inject dependencies
 */
export type PluginContextFactory = () => Promise<PluginContext>;
