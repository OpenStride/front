import type { ExtensionPlugin } from '@/types/extension'

export default {
  id: 'profile-sharing',
  label: 'Profile Sharing & Privacy',
  description: 'Manage sharing settings and publish your public profile',
  icon: 'fas fa-share-nodes',
  slots: {
    // Lives inside the friends tab rather than behind its own: publishing your
    // profile and following someone are the two halves of the same handshake,
    // and splitting them across tabs is why people followed friends who could
    // never see them back.
    'profile.friends': [() => import('./ProfileSharingTab.vue')]
  }
} as ExtensionPlugin
