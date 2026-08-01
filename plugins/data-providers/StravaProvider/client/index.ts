import type { ProviderPlugin } from '@/types/provider'

// Strava is a ZIP-export importer, not an API integration (the Strava API terms
// are incompatible with OpenStride's local-first model). The user imports their
// own data archive; there is no background refresh.
const StravaProvider: ProviderPlugin = {
  id: 'strava',
  label: 'Strava',
  setupComponent: async () => (await import('./StravaSetup.vue')).default,
  icon: new URL('../assets/logo.svg', import.meta.url).href
}

export default StravaProvider
