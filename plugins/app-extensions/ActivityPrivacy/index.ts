import type { ExtensionPlugin } from '@/types/extension';

export default {
  id: 'activity-privacy',
  label: 'Activity Privacy Controls',
  slots: {
    'activity.top': [
      () => import('./PrivacyToggle.vue')
    ]
  }
} as ExtensionPlugin;
