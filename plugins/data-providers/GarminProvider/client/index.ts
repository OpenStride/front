// plugins/providers/GarminProvider/client/index.ts
import type { ProviderPlugin } from '@/types/provider'
import { GarminRefresh } from './GarminService'

const GarminProvider: ProviderPlugin = {
    id: 'garmin',
    label: 'Garmin',
    setupComponent: async () => (await import('./GarminSetup.vue')).default,
    icon: new URL('../assets/logo.png', import.meta.url).href,
    refreshData: GarminRefresh,
}

export default GarminProvider
