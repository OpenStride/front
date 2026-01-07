import type { ExtensionPlugin } from '@/types/extension'

const StandardDetailsPlugin: ExtensionPlugin = {
    id: 'standard-details',
    label: 'Activity Details',
    icon: 'fas fa-heart-pulse',
    slots: {
        'activity.top': [async () => (await import('./ActivityTopBlock.vue')).default],
        'activity.widgets': [
            async () => (await import('./HeartRateGraph.vue')).default,
            async () => (await import('./HeartZoneGraph.vue')).default,
            async () => (await import('./SpeedSampled.vue')).default,
            async () => (await import('./CadenceGraph.vue')).default,
            //async () => (await import('./SpeedPerKM.vue')).default
        ]
    }
}

export default StandardDetailsPlugin