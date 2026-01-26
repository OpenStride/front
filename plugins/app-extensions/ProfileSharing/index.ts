import type { ExtensionPlugin } from '@/types/extension'

export default {
  id: 'profile-sharing',
  label: 'Profile Sharing & Privacy',
  description: 'Manage sharing settings and publish your public profile',
  icon: 'fas fa-share-nodes',
  slots: {
    'profile.tabs': [
      () => import('./ProfileSharingTab.vue')
    ]
  },
  // Metadata for profile tab
  tabMetadata: {
    tabId: 'sharing',
    tabLabelKey: 'profile.tabs.sharing',
    tabIcon: 'fas fa-share-nodes'
  }
} as ExtensionPlugin
