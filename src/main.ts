import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { IndexedDBService } from './services/IndexedDBService';
import { StorageService } from '@/services/StorageService';
import { setupBackupListener } from '@/services/StorageListener';
import { aggregationService } from '@/services/AggregationService';
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
    const app = createApp(App);
    app.use(router);
    app.use(i18n);
    app.mount('#app');

    await setupBackupListener(1000);

        // Listen to new activity details insertions to feed aggregations (simplistic: triggers on any dbChange of activity_details)
        const db = await IndexedDBService.getInstance();
        db.emitter.addEventListener('dbChange', async (evt: Event) => {
            const e = evt as CustomEvent<{ store:string; key:string }>; 
            if (e.detail.store === 'activity_details') {
                try {
                    const allActs = await db.getAllData('activities');
                    const lastDetails = await db.getAllData('activity_details');
                    // Build a map id->details for quick lookup (here naive each trigger; can optimize later)
                    const detailsMap = new Map<string, any>();
                        for (const d of lastDetails) { if (d && d.id) detailsMap.set(d.id, d); }
                    // Only aggregate last added detail(s) ? For sprint1 do full scan could be heavy; instead attempt to find diff later.
                    // Here: just aggregate for the most recent N added items (simplify by aggregating all for now if needed)
                    // To avoid duplicates, service sums cumulatively across existing aggregatedData.
                    const recent = lastDetails.slice(-5); // heuristic small set
                    for (const det of recent) {
                        const act = allActs.find((a:any) => a.id === det.id);
                        if (act) await aggregationService.addActivityForAggregation(act, det);
                    }
                } catch (err) { console.warn('[bootstrap][aggregation] error', err); }
            }
        });

}

bootstrap();
