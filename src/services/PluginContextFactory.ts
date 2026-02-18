import type { PluginContext } from '@/types/plugin-context'
import { getActivityService } from './ActivityService'
import { IndexedDBService } from './IndexedDBService'
import { ToastService } from './ToastService'
import { aggregationService } from './AggregationService'
import { FriendService } from './FriendService'
import { ActivityAnalyzer } from './ActivityAnalyzer'
import { DataProviderPluginManager } from './DataProviderPluginManager'
import { StoragePluginManager } from './StoragePluginManager'

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
    storage: storageService,

    notifications: {
      notify(message, opts) {
        ToastService.push(message, opts)
      }
    },

    plugins: {
      async isPluginActive(pluginId: string) {
        const dpManager = DataProviderPluginManager.getInstance()
        const spManager = StoragePluginManager.getInstance()
        const dpPlugins = await dpManager.getEnabledPlugins()
        const spPlugins = await spManager.getEnabledPlugins()
        return dpPlugins.some(p => p.id === pluginId) || spPlugins.some(p => p.id === pluginId)
      },
      async enablePlugin(pluginId: string) {
        const dpManager = DataProviderPluginManager.getInstance()
        const spManager = StoragePluginManager.getInstance()
        // Try data provider first, then storage
        try {
          await dpManager.enablePlugin(pluginId)
        } catch {
          await spManager.enablePlugin(pluginId)
        }
      }
    },

    aggregation: {
      getAggregated: (metricId, periodType) =>
        aggregationService.getAggregated(metricId, periodType),
      listMetrics: () => aggregationService.listMetrics()
    },

    friends: {
      publishPublicData: () => FriendService.getInstance().publishPublicData(),
      getMyManifestUrl: () => FriendService.getInstance().getMyManifestUrl()
    },

    analyzer: {
      create(samples) {
        return new ActivityAnalyzer(samples)
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
