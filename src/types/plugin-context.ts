import type { Activity, ActivityDetails, Sample } from './activity'
import type { Converted, Dimension, Formatted, UnitSystem } from './units'
import type { SegmentSample, ElevationProfile } from '@/services/ActivityAnalyzer'
import type {
  AggregationPeriod,
  AggregatedRecord,
  AggregationMetricDefinition
} from './aggregation'
import type { CustomAggregate } from './customAggregate'
import type { CustomAggregateInput } from '@/services/CustomAggregateService'
import type { CapabilityReport } from '@/composables/useSampleCapabilities'

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
  saveActivitiesWithDetails(
    activities: Activity[],
    details: ActivityDetails[],
    opts?: { fromSync?: boolean }
  ): Promise<void>

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
}

/**
 * Extended storage interface exposed to plugins via PluginContext.
 * Includes high-level operations that require StorageService (not just IndexedDB).
 */
export interface IPluginStorageService extends IStorageService {
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
  rebuildAll(activities: Activity[], detailsMap: Map<string, ActivityDetails | null>): Promise<void>
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
  /** False when no enabled storage provider can host public files — publishing would fail */
  canPublish(): Promise<boolean>
  isAutoPublishEnabled(): Promise<boolean>
  setAutoPublish(enabled: boolean): Promise<void>
  /**
   * What a friend actually receives, so a screen can state it instead of
   * implying it. `publishedAt` is null when the profile predates the
   * timestamp — unknown, not never.
   */
  getPublicSummary(): Promise<{ activityCount: number; publishedAt: number | null }>
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
    sampleAverageByDistance(stepMeters: number): SegmentSample[]
    sampleBySlopeChange(minDistanceMeters: number): SegmentSample[]
    sampleByLaps(laps: { time: number }[]): SegmentSample[]
    /** Metres climbed and descended, noise-filtered. */
    elevationChange(): { ascent: number; descent: number }
    /** Shape of the course, so widgets can decide whether grade is worth showing */
    elevationProfile(): ElevationProfile
  }
}

/**
 * Sync interface for plugins
 *
 * Allows plugins to trigger sync without importing SyncService directly.
 */
export interface ISyncService {
  /**
   * Trigger a sync. Pass `{ force: true }` to bypass the remote-change-token
   * optimization and force a full remote read + reconcile (deep menu action).
   */
  syncNow(opts?: { force?: boolean }): Promise<void>
}

/** What a provider reports once it has finished pulling. */
export interface ProviderImportEvent {
  providerId: string
  providerLabel: string
  timestamp: number
}

/**
 * Data-provider events for plugins
 *
 * A plugin that reacts to imports — notifications, badges, a sync indicator —
 * needs to know when one happened, and that was the one thing the context did
 * not offer. The plugin that needed it reached for `DataProviderService`
 * directly and typed the payload from memory, inventing a `count` and an
 * `activities` array the event never carried.
 */
export interface IDataProviderEvents {
  /** Subscribe to completed imports; call the returned function to stop. */
  onActivitiesImported(handler: (event: ProviderImportEvent) => void): () => void
}

/**
 * Unit formatting interface for plugins
 *
 * Values are stored in SI everywhere; this converts them to the user's unit
 * system at display time. Plugins must not convert by hand — most of the app's
 * charts and stats live in plugins, so hardcoding metric there would leave half
 * the UI ignoring the preference.
 */
export interface IUnitsService {
  /** Current preference — read it to redraw canvas charts when it changes. */
  system: UnitSystem
  /** `pace` and `pace100` take seconds per metre (`duration / distance`). */
  format(dimension: Dimension, si: number): Formatted
  /** Same conversion as `format`, as a number — for chart axes and series. */
  convert(dimension: Dimension, si: number): Converted
  /**
   * The inverse: a number the user typed, in their units, back to SI.
   *
   * Required wherever a quantity *enters* the app. "50" in a goal field means
   * 50 km to one reader and 50 mi to another; storing it unconverted makes the
   * stored value depend on a display preference.
   */
  toSI(dimension: Dimension, value: number): number
}

/**
 * The aggregates a user defined, and what their library can support.
 *
 * Separate from `IAggregationService`, which reads the *results*: a rolled-up
 * period record reads the same whether it came from a built-in metric or from
 * one of these, and a consumer of figures should not have to tell them apart.
 * This one is for the screen that writes the definitions, which is a different
 * job and a much smaller audience.
 */
export interface ICustomAggregateService {
  /** Live definitions, deleted ones excluded. */
  list(): Promise<CustomAggregate[]>
  create(input: CustomAggregateInput): Promise<CustomAggregate>
  update(id: string, patch: Partial<CustomAggregateInput>): Promise<CustomAggregate | null>
  /** Soft delete: the definition stops computing and the deletion syncs. */
  remove(id: string): Promise<boolean>
  /**
   * What the indexed activities can actually be asked about, optionally scoped
   * to one sport.
   *
   * The reason an editor can be built at all: which fields exist depends on
   * what the user's own activities recorded, so offering a fixed list would
   * invite a filter on a channel nobody ever measured.
   */
  capabilities(sport?: string): Promise<CapabilityReport>
  /** Subscribe to definition changes; returns the unsubscribe. */
  onChanged(handler: (ids: string[]) => void): () => void
}

/**
 * Plugin Context - Injected into plugins
 *
 * This is the main dependency injection container for plugins.
 * Plugins receive this context and use it to interact with core services.
 */
export interface PluginContext {
  activity: IActivityService
  storage: IPluginStorageService
  notifications: INotificationService
  plugins: IPluginManager
  aggregation: IAggregationService
  aggregates: ICustomAggregateService
  friends: IFriendService
  analyzer: IAnalyzerFactory
  sync: ISyncService
  units: IUnitsService
  providers: IDataProviderEvents
}

/**
 * Factory function to create a PluginContext
 * Called by plugin managers to inject dependencies
 */
export type PluginContextFactory = () => Promise<PluginContext>
