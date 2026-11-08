// plugins/providers/GarminProvider/client/index.ts
import type { ProviderPlugin } from '@/types/provider'
import { GarminRefresh } from './GarminService'

const GarminProvider: ProviderPlugin = {
  id: 'garmin',
  label: 'Garmin',
  setupComponent: async () => (await import('./GarminSetup.vue')).default,
  icon: new URL('../assets/logo.png', import.meta.url).href,
  refreshData: GarminRefresh,
  // The address registered with Garmin: changing it means changing it there too
  routes: [
    {
      path: '/oauth/garmin/callback',
      name: 'GarminOAuthCallback',
      component: async () => (await import('./GarminOAuthCallback.vue')).default
    }
  ]
}

export default GarminProvider
