import type { ExtensionPlugin } from '@/types/extension'

const StandardDetailsPlugin: ExtensionPlugin = {
    id: 'standard-details',
    label: 'Activity Details',
    description: 'Display heart rate, cadence, speed graphs and zones for each activity',
    icon: 'fas fa-heart-pulse',
    slots: {
        'activity.top': [async () => (await import('@plugins/app-extensions/StandardDetails/ActivityTopBlock.vue')).default],
        'activity.widgets': [
            async () => (await import('@plugins/app-extensions/StandardDetails/HeartRateGraph.vue')).default,
            async () => (await import('@plugins/app-extensions/StandardDetails/HeartZoneGraph.vue')).default,
            async () => (await import('@plugins/app-extensions/StandardDetails/SpeedSampled.vue')).default,
            async () => (await import('@plugins/app-extensions/StandardDetails/CadenceGraph.vue')).default,
            //async () => (await import('./SpeedPerKM.vue')).default
        ]
    }
}

export default StandardDetailsPlugin