import type { ProviderPlugin } from '@/types/provider'
import { Capacitor } from '@capacitor/core'

// One provider backed by the unified `capacitor-health` plugin. The native build
// is either iOS or Android, so the platform is fixed at module load — we pick the
// right label/icon accordingly. Hidden on web via available().
const platform = Capacitor.getPlatform()
const isAndroid = platform === 'android'

const icon = isAndroid
  ? new URL('../assets/health-connect.svg', import.meta.url).href
  : new URL('../assets/apple-health.svg', import.meta.url).href

const HealthProvider: ProviderPlugin = {
  id: 'health',
  label: isAndroid ? 'Health Connect' : 'Apple Health',
  icon,
  description: 'Import workouts from the device health store (iOS / Android)',
  setupComponent: async () => (await import('./HealthSetup.vue')).default,
  available: () => Capacitor.isNativePlatform() && (platform === 'ios' || platform === 'android')
}

export default HealthProvider
