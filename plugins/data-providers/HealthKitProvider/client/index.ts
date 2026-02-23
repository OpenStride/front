import type { ProviderPlugin } from '@/types/provider'
import { Capacitor } from '@capacitor/core'

const HealthKitProvider: ProviderPlugin = {
  id: 'healthkit',
  label: 'Apple Health',
  icon: 'fa-brands fa-apple',
  description: 'Import workouts from Apple Health (iOS only)',
  setupComponent: async () => (await import('./HealthKitSetup.vue')).default,
  available: () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

export default HealthKitProvider
