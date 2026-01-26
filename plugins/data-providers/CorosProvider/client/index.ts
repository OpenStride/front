// plugins/providers/GarminProvider/client/index.ts
import type { ProviderPlugin } from '@/types/provider'

const GarminProvider: ProviderPlugin = {
    id: 'coros',
    label: 'Coros',
    setupComponent: async () => (await import('@plugins/data-providers/CorosProvider/client/CorosSetup.vue')).default,
    icon: new URL('../assets/logo.jpg', import.meta.url).href
}

export default GarminProvider
