import type { ExtensionPlugin } from '@/types/extension';
import { NotificationService } from './services/NotificationService';

// Initialize the notification service when the plugin is loaded
const notificationService = NotificationService.getInstance();
if (notificationService) {
    notificationService.initialize().then((success) => {
        if (success) {
            console.log('[Firebase Notifications Plugin] Initialized successfully');
        } else {
            console.warn('[Firebase Notifications Plugin] Initialization failed');
        }
    });
}

export default {
    id: 'firebase-notifications',
    label: 'Firebase Push Notifications',
    icon: 'fa-bell',
    slots: {
        'profile.settings': [
            () => import('./components/NotificationSettings.vue')
        ]
    }
} as ExtensionPlugin;
