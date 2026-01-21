import type { PluginContext } from '@/types/plugin-context';
import { getActivityService } from './ActivityService';
import { IndexedDBService } from './IndexedDBService';

/**
 * Factory function to create a PluginContext for dependency injection
 *
 * This is the main entry point for plugins to access core services.
 * Instead of importing services directly, plugins receive this context.
 *
 * Usage in plugin managers:
 * ```typescript
 * const context = await createPluginContext();
 * await plugin.refreshData(context);
 * ```
 */
export async function createPluginContext(): Promise<PluginContext> {
    const activityService = await getActivityService();
    const storageService = await IndexedDBService.getInstance();

    return {
        activity: activityService,
        storage: storageService
    };
}

/**
 * Singleton instance for performance
 * Reuse the same context across multiple plugin calls
 */
let cachedContext: PluginContext | null = null;

/**
 * Get or create a singleton PluginContext
 * More efficient than creating a new context for each plugin call
 */
export async function getPluginContext(): Promise<PluginContext> {
    if (!cachedContext) {
        cachedContext = await createPluginContext();
    }
    return cachedContext;
}

/**
 * Clear the cached context (useful for testing)
 */
export function clearPluginContext(): void {
    cachedContext = null;
}
