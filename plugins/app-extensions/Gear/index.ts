import type { ExtensionPlugin } from '@/types/extension'

/**
 * Gear: which shoes or bike an outing used, and how worn they are.
 *
 * The choice lives on the activity itself (`gearIds`), so it syncs with it;
 * without a choice, the gear that was the sport's default on that date applies.
 */
export default {
  id: 'gear',
  label: 'Gear',
  description: 'Track the wear of your shoes and bikes, outing by outing',
  icon: 'fas fa-shoe-prints',
  slots: {
    'profile.tabs': [() => import('./GearTab.vue')],
    'activity.top': [
      {
        id: 'activity-gear',
        component: async () => (await import('./ActivityGear.vue')).default,
        // A friend's outing is theirs: no gear of ours to put on it.
        appliesTo: ctx => !!ctx.activity && !ctx.activity.provider?.startsWith('friend_')
      }
    ]
  },
  tabMetadata: {
    tabId: 'gear',
    tabLabelKey: 'profile.tabs.gear',
    tabIcon: 'fas fa-shoe-prints'
  }
} as ExtensionPlugin
