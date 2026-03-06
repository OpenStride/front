import type { PluginContext } from '@/types/plugin-context'
import { getActivityService } from './ActivityService'
import { IndexedDBService } from './IndexedDBService'
import { ToastService } from './ToastService'
import { aggregationService } from './AggregationService'
import { FriendService } from './FriendService'
import { ActivityAnalyzer } from './ActivityAnalyzer'
import { DataProviderPluginManager } from './DataProviderPluginManager'
import { StoragePluginManager } from './StoragePluginManager'
import { AppExtensionPluginManager } from './AppExtensionPluginManager'
import { StorageService } from './StorageService'
import { SyncService } from './SyncService'

/**
 * Factory function to create a PluginContext for dependency injection
 *
 * This is the main entry point for plugins to access core services.
 * Instead of importing services directly, plugins receive this context.
 */
export async function createPluginContext(): Promise<PluginContext> {
  const activityService = await getActivityService()
  const storageService = await IndexedDBService.getInstance()

  return {
    activity: activityService,
    storage: {
      getData: <T = unknown>(key: string) => storageService.getData(key) as Promise<T | null | undefined>,
      saveData: (key, data) => storageService.saveData(key, data),
      deleteData: key => storageService.deleteData(key),
      exportDB: storeName => storageService.exportDB(storeName),
      addItemsToStore: (storeName, items, keyFn) =>
        storageService.addItemsToStore(storeName, items, keyFn),
      importFromRemote: stores => StorageService.getInstance().importFromRemote(stores)
    },

    notifications: {
      notify(message, opts) {
        ToastService.push(message, opts)
      }
    },

    plugins: {
      async isPluginActive(pluginId: string) {
        const dpManager = DataProviderPluginManager.getInstance()
        const spManager = StoragePluginManager.getInstance()
        const aeManager = AppExtensionPluginManager.getInstance()
        const dpPlugins = await dpManager.getEnabledPlugins()
        const spPlugins = await spManager.getEnabledPlugins()
        const aePlugins = await aeManager.getEnabledPlugins()
        return (
          dpPlugins.some(p => p.id === pluginId) ||
          spPlugins.some(p => p.id === pluginId) ||
          aePlugins.some(p => p.id === pluginId)
        )
      },
      async enablePlugin(pluginId: string) {
        const dpManager = DataProviderPluginManager.getInstance()
        const spManager = StoragePluginManager.getInstance()
        const aeManager = AppExtensionPluginManager.getInstance()
        // Try data provider first, then storage, then app extension
        try {
          await dpManager.enablePlugin(pluginId)
        } catch {
          try {
            await spManager.enablePlugin(pluginId)
          } catch {
            await aeManager.enablePlugin(pluginId)
          }
        }
      }
    },

    aggregation: {
      getAggregated: (metricId, periodType) =>
        aggregationService.getAggregated(metricId, periodType),
      listMetrics: () => aggregationService.listMetrics(),
      rebuildAll: (activities, detailsMap) => aggregationService.rebuildAll(activities, detailsMap),
      loadConfigFromSettings: () => aggregationService.loadConfigFromSettings(),
      subscribe: cb => aggregationService.subscribe(cb)
    },

    friends: {
      publishPublicData: () => FriendService.getInstance().publishPublicData(),
      getMyManifestUrl: () => FriendService.getInstance().getMyManifestUrl(),
      getMyPublicUrl: () => FriendService.getInstance().getMyPublicUrl(),
      onEvent: (event, handler) =>
        FriendService.getInstance().emitter.addEventListener(event, handler as EventListener),
      offEvent: (event, handler) =>
        FriendService.getInstance().emitter.removeEventListener(event, handler as EventListener)
    },

    analyzer: {
      create(samples) {
        return new ActivityAnalyzer(samples)
      }
    },

    sync: {
      syncNow: async () => {
        await SyncService.getInstance().syncNow()
      }
    }
  }
}

/**
 * Singleton instance for performance
 * Reuse the same context across multiple plugin calls
 */
let cachedContext: PluginContext | null = null

/**
 * Get or create a singleton PluginContext
 * More efficient than creating a new context for each plugin call
 */
export async function getPluginContext(): Promise<PluginContext> {
  if (!cachedContext) {
    cachedContext = await createPluginContext()
  }
  return cachedContext
}

/**
 * Clear the cached context (useful for testing)
 */
export function clearPluginContext(): void {
  cachedContext = null
}
