import type { ProviderPlugin } from '@/types/provider'
import { Capacitor } from '@capacitor/core'

const HealthConnectProvider: ProviderPlugin = {
  id: 'health-connect',
  label: 'Health Connect',
  icon: 'fa-solid fa-heart-pulse',
  description: 'Import workouts from Health Connect (Android only)',
  setupComponent: async () => (await import('./HealthConnectSetup.vue')).default,
  available: () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export default HealthConnectProvider
