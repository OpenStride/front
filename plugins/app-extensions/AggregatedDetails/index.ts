import type { ExtensionPlugin } from '@/types/extension'

const AggregatedDetailsPlugin: ExtensionPlugin = {
    id: 'aggregated-details',
    label: 'Aggregated Details',
    icon: 'fas fa-heart-pulse',
    slots: {
        'activity.widgets': [
            async () => (await import('./ActivityBests.vue')).default
        ],
        'activity.top': [

            //async () => (await import('./SpeedPerKM.vue')).default
        ]
    }
}

export default AggregatedDetailsPlugin