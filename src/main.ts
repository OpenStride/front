import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { IndexedDBService } from './services/IndexedDBService'
import { aggregationService } from '@/services/AggregationService'
import { getPWAUpdateService } from '@/services/PWAUpdateService'
import { getPublicDataListener } from '@/services/PublicDataListener'
import { getMigrationService } from '@/services/MigrationService'
import { migrations } from '@/migrations'
import i18n, { getInitialLocale, setHtmlLang } from '@/locales'

import '@/assets/styles/global.css'
import 'leaflet/dist/leaflet.css'

async function bootstrap() {
  // 1. Initialize IndexedDB
  const db = await IndexedDBService.getInstance()

  // 2. Check and run migrations
  const storedVersion = await db.getData('app_version')
  const currentVersion = storedVersion?.version || '0.0.0'
  const newVersion = __APP_VERSION__

  if (currentVersion !== newVersion) {
    console.log(`[Bootstrap] Version change: ${currentVersion} → ${newVersion}`)

    const migrationService = getMigrationService()

    // Register all migrations
    migrations.forEach(m => migrationService.register(m))

    try {
      // Run pending migrations
      await migrationService.runMigrations(currentVersion, newVersion)

      // Update stored version
      await db.saveData('app_version', {
        version: newVersion,
        buildTime: __BUILD_TIME__,
        installedAt: storedVersion?.installedAt || Date.now(),
        lastUpdateCheck: Date.now()
      })

      console.log(`[Bootstrap] ✅ Migrated to ${newVersion}`)
    } catch (error) {
      console.error('[Bootstrap] ❌ Migration failed:', error)
      // Continue anyway (graceful degradation)
    }
  } else {
    console.log(`[Bootstrap] Version ${currentVersion} - no migrations needed`)
  }

  // 3. Load user locale or detect from browser
  const locale = await getInitialLocale()
  i18n.global.locale.value = locale
  setHtmlLang(locale)

  await aggregationService.loadConfigFromSettings()

  // Start event-driven aggregation (no O(n) scans!)
  await aggregationService.startListening()

  // Start public data auto-publish listener (if enabled)
  const publicDataListener = getPublicDataListener()
  await publicDataListener.startListening()

  // 4. Initialize PWA update service
  const pwaUpdateService = getPWAUpdateService()
  await pwaUpdateService.initialize()

  // 5. Create and mount Vue app
  const app = createApp(App)
  app.use(router)
  app.use(i18n)
  app.mount('#app')

  // NOTE: Automatic backup removed - now using manual sync via SyncService
  // User triggers sync via the Refresh button in AppHeader
  // await setupBackupListener(1000);

  // NOTE: Friend sync disabled on app start to avoid Google API rate limiting
  // User can manually trigger sync via the Refresh button in AppHeader
  // If you want to re-enable auto-sync, add a time-based check to avoid too frequent syncs
  // Example: only sync if last sync was > 5 minutes ago
  /*
    try {
        const friendService = FriendService.getInstance();
        friendService.refreshAllFriends().catch(err => {
            console.warn('[bootstrap] Friend sync failed:', err);
        });
    } catch (err) {
        console.warn('[bootstrap] Friend service initialization failed:', err);
    }
    */

  // NOTE: Old O(n) aggregation listener removed
  // AggregationService now listens to ActivityService events directly
  // No more getAllData() scans on every activity_details change
}

bootstrap()
