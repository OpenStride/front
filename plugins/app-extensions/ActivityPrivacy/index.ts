import type { ExtensionPlugin } from '@/types/extension';

export default {
  id: 'activity-privacy',
  label: 'Activity Privacy Controls',
  slots: {
    'activity.top': [
      () => import('@plugins/app-extensions/ActivityPrivacy/PrivacyToggle.vue')
    ]
  }
} as ExtensionPlugin;
