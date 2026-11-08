import type { ExtensionPlugin } from '@/types/extension'

export default {
  id: 'activity-privacy',
  label: 'Activity Privacy Controls',
  slots: {
    'activity.top': [
      {
        id: 'privacy-toggle',
        component: async () => (await import('./PrivacyToggle.vue')).default,
        // A friend's outing is theirs to share: nothing to switch here.
        appliesTo: ctx => !!ctx.activity && !ctx.activity.provider?.startsWith('friend_')
      }
    ]
  }
} as ExtensionPlugin
