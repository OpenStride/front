// plugins/data-providers/GarminProvider/client/GarminService.ts
import { getGarminSyncManager } from './GarminSyncManager'
import { getSyncState, getTokens } from './storage'

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

/**
 * At app start: carry on a first import a closed tab interrupted. The months
 * already fetched are kept in the sync state, so it resumes where it stopped.
 */
export async function GarminResume(): Promise<void> {
  if (!(await getTokens())) return
  if ((await getSyncState()).initialImportDone) return
  await getGarminSyncManager().startInitialImportAsync()
}
