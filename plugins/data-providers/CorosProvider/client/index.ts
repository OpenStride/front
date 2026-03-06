import type { ProviderPlugin } from '@/types/provider'

const CorosProvider: ProviderPlugin = {
  id: 'coros',
  label: 'Coros',
  setupComponent: async () => (await import('./CorosSetup.vue')).default,
  icon: new URL('../assets/logo.jpg', import.meta.url).href
}

export default CorosProvider
