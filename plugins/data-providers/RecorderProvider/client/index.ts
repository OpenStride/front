import type { ProviderPlugin } from '@/types/provider'
import { Capacitor } from '@capacitor/core'

// Native-only GPS activity recorder (records a run/ride on-device via background
// geolocation). Hidden on web via available().
const RecorderProvider: ProviderPlugin = {
  id: 'recorder',
  label: 'Record activity',
  icon: new URL('../assets/logo.svg', import.meta.url).href,
  description: 'Record a run or ride with GPS on your phone',
  setupComponent: async () => (await import('./RecorderSetup.vue')).default,
  available: () => Capacitor.isNativePlatform()
}

export default RecorderProvider
