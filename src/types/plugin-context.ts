import type { Activity, ActivityDetails, Sample } from './activity'
import type {
  AggregationPeriod,
  AggregatedRecord,
  AggregationMetricDefinition
} from './aggregation'

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
  saveActivityWithDetails(activity: Activity, details: ActivityDetails): Promise<void>

  /**
   * Save multiple activities with their details in batch
   * Faster than calling saveActivityWithDetails multiple times
   */
  saveActivitiesWithDetails(activities: Activity[], details: ActivityDetails[]): Promise<void>

  /**
   * Get activity summary by ID
   * Returns undefined if activity doesn't exist
   */
  getActivity(id: string): Promise<Activity | undefined>

  /**
   * Get all activity summaries
   * Returns array of Activity objects (without samples)
   */
  getAllActivities(): Promise<Activity[]>

  /**
   * Get full activity details (including samples) by ID
   * Returns undefined if details don't exist
   */
  getDetails(id: string): Promise<ActivityDetails | undefined>

  /**
   * Delete an activity (soft delete)
   * Sets deleted flag instead of removing from database
   */
  deleteActivity(id: string): Promise<void>

  /**
   * Get activities that haven't been synced to remote storage
   * Used by sync plugins
   */
  getUnsyncedActivities(): Promise<Activity[]>

  /**
   * Mark activities as synced after successful remote push
   * Used by storage plugins
   */
  markAsSynced(activityIds: string[]): Promise<void>
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
  getData<T = unknown>(key: string): Promise<T | null | undefined>

  /**
   * Save a value to settings store
   * Overwrites existing value if key exists
   *
   * Example: await storage.saveData('myPluginConfig', { enabled: true })
   */
  saveData<T = unknown>(key: string, data: T): Promise<void>

  /**
   * Delete a value from settings store
   *
   * Example: await storage.deleteData('myPluginConfig')
   */
  deleteData(key: string): Promise<void>

  /**
   * Export all data from a specific store
   * Use with caution - can return large datasets
   *
   * Available stores: 'activities', 'activity_details', 'settings',
   * 'notifLogs', 'aggregatedData', 'friends', 'friend_activities'
   */
  exportDB(storeName: string): Promise<unknown[]>

  /**
   * Add or update items in a specific store
   * Useful for bulk operations
   */
  addItemsToStore<T>(storeName: string, items: T[], keyFn: (item: T) => IDBValidKey): Promise<void>

  /**
   * Import data one-way from remote storage to local IndexedDB
   * Used after authentication to hydrate a fresh database
   */
  importFromRemote(stores?: string[]): Promise<void>
}

/**
 * Notification interface for plugins
 *
 * Replaces direct ToastService calls. Plugins emit notifications,
 * the core UI layer handles rendering.
 */
export interface INotificationService {
  notify(
    message: string,
    opts?: { type?: 'success' | 'error' | 'info' | 'warning'; timeout?: number }
  ): void
}

/**
 * Plugin manager interface for plugins
 *
 * Allows plugins to check or enable other plugins without
 * importing concrete PluginManager classes.
 */
export interface IPluginManager {
  isPluginActive(pluginId: string): Promise<boolean>
  enablePlugin(pluginId: string): Promise<void>
}

/**
 * Read-only aggregation interface for plugins
 *
 * Provides access to pre-computed aggregated data.
 */
export interface IAggregationService {
  getAggregated(metricId: string, periodType: AggregationPeriod): Promise<AggregatedRecord[]>
  listMetrics(): AggregationMetricDefinition[]
  rebuildAll(
    activities: Record<string, unknown>[],
    detailsMap: Map<string, Record<string, unknown> | null>
  ): Promise<void>
  loadConfigFromSettings(): Promise<void>
  subscribe(
    cb: (ev: { metricId: string; periodType: AggregationPeriod; periodKey: string }) => void
  ): () => void
}

/**
 * Friend / public data interface for plugins
 *
 * Allows plugins to publish public data and query friend info
 * without importing FriendService directly.
 */
export interface IFriendService {
  publishPublicData(): Promise<string | null>
  getMyManifestUrl(): Promise<string | null>
  getMyPublicUrl(): Promise<string | null>
  onEvent(event: string, handler: (...args: unknown[]) => void): void
  offEvent(event: string, handler: (...args: unknown[]) => void): void
}

/**
 * Activity analyzer factory for plugins
 *
 * Wraps ActivityAnalyzer creation so plugins don't import the class directly.
 */
export interface IAnalyzerFactory {
  create(samples: Sample[]): {
    bestSegments(
      targets: number[]
    ): Record<
      number,
      { sample: Sample; duration: number; startIdx: number; endIdx: number } | null | undefined
    >
    sampleAverageByDistance(stepMeters: number): Sample[]
    sampleBySlopeChange(minDistanceMeters: number): Sample[]
    sampleByLaps(laps: { time: number }[]): Sample[]
  }
}

/**
 * Sync interface for plugins
 *
 * Allows plugins to trigger sync without importing SyncService directly.
 */
export interface ISyncService {
  syncNow(): Promise<void>
}

/**
 * Plugin Context - Injected into plugins
 *
 * This is the main dependency injection container for plugins.
 * Plugins receive this context and use it to interact with core services.
 */
export interface PluginContext {
  activity: IActivityService
  storage: IStorageService
  notifications: INotificationService
  plugins: IPluginManager
  aggregation: IAggregationService
  friends: IFriendService
  analyzer: IAnalyzerFactory
  sync: ISyncService
}

/**
 * Factory function to create a PluginContext
 * Called by plugin managers to inject dependencies
 */
export type PluginContextFactory = () => Promise<PluginContext>
