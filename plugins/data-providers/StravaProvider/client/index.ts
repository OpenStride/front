import type { ProviderPlugin } from '@/types/provider'
import { getStravaSyncManager } from './StravaSyncManager'

const StravaProvider: ProviderPlugin = {
  id: 'strava',
  label: 'Strava',
  setupComponent: async () => (await import('./StravaSetup.vue')).default,
  icon: new URL('../assets/logo.svg', import.meta.url).href,
  refreshData: () => getStravaSyncManager().dailyRefresh()
}

export default StravaProvider
