import type { ExtensionPlugin } from '@/types/extension';
import { NotificationService } from './services/NotificationService';

/**
 * Firebase Push Notifications Plugin
 *
 * IMPORTANT: Lazy initialization pattern
 * - Service is NOT initialized when module loads
 * - Initialization happens when user first accesses settings
 * - Prevents wasted resources if plugin is installed but not configured
 */

let initialized = false;

async function ensureInitialized(): Promise<void> {
    if (initialized) return;

    const notificationService = NotificationService.getInstance();
    if (notificationService) {
        const success = await notificationService.initialize();
        if (success) {
            console.log('[Firebase Notifications Plugin] Initialized successfully');
            initialized = true;
        } else {
            console.warn('[Firebase Notifications Plugin] Initialization failed');
        }
    }
}

export default {
    id: 'firebase-notifications',
    label: 'Firebase Push Notifications',
    description: 'Push notifications when new activities are imported from data providers',
    icon: 'fas fa-bell',

    // Setup component with lazy initialization
    async setupComponent() {
        // Initialize service when user clicks to configure
        await ensureInitialized();
        return import('./components/NotificationSettings.vue');
    },

    slots: {
        'profile.settings': [
            async () => {
                // Also initialize when settings widget loads
                await ensureInitialized();
                return (await import('./components/NotificationSettings.vue')).default;
            }
        ]
    }
} as ExtensionPlugin;
