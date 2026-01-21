import type { ExtensionPlugin } from '@/types/extension'

const AggregatedDetailsPlugin: ExtensionPlugin = {
    id: 'aggregated-details',
    label: 'Aggregated Details',
    description: 'Show your personal bests and performance rankings across all activities',
    icon: 'fas fa-trophy',
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