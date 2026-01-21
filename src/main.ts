import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { IndexedDBService } from './services/IndexedDBService';
import { aggregationService } from '@/services/AggregationService';
import { FriendService } from '@/services/FriendService';
import i18n, { getInitialLocale, setHtmlLang } from '@/locales';

import "@/assets/styles/global.css";
import 'leaflet/dist/leaflet.css';

async function bootstrap() {
    await IndexedDBService.getInstance();

    // Load user locale or detect from browser
    const locale = await getInitialLocale();
    i18n.global.locale.value = locale;
    setHtmlLang(locale);

    await aggregationService.loadConfigFromSettings();

    // Start event-driven aggregation (no O(n) scans!)
    await aggregationService.startListening();

    const app = createApp(App);
    app.use(router);
    app.use(i18n);
    app.mount('#app');

    // NOTE: Automatic backup removed - now using manual sync via SyncService
    // User triggers sync via the Refresh button in AppHeader
    // await setupBackupListener(1000);

    // Sync friends' activities on app start (non-blocking)
    try {
        const friendService = FriendService.getInstance();
        friendService.refreshAllFriends().catch(err => {
            console.warn('[bootstrap] Friend sync failed:', err);
        });
    } catch (err) {
        console.warn('[bootstrap] Friend service initialization failed:', err);
    }

    // NOTE: Old O(n) aggregation listener removed
    // AggregationService now listens to ActivityService events directly
    // No more getAllData() scans on every activity_details change
}

bootstrap();
