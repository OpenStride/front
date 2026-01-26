// plugins/data-providers/GarminProvider/client/GarminService.ts
import { getGarminSyncManager } from './GarminSyncManager'

/**
 * GarminRefresh - Called by DataProviderService.triggerRefresh()
 *
 * This is the entry point for the header refresh button.
 * It only does a daily refresh (last 7 days), not a full historical import.
 *
 * The initial import is handled separately by GarminSyncManager.startInitialImportAsync()
 * which is triggered after OAuth authentication in GarminSetup.vue.
 */
export async function GarminRefresh(): Promise<void> {
  const syncManager = getGarminSyncManager()
  await syncManager.dailyRefresh()
}
