import type { ExtensionPlugin, SlotContext } from '@/types/extension'
import type { Sample } from '@/types/activity'

/** True when at least one sample carries a usable value for `field`. */
const hasSampleData = (ctx: SlotContext, field: keyof Sample): boolean => {
  const samples = ctx.details?.samples
  if (!samples?.length) return false
  return samples.some(s => {
    const v = s[field]
    return typeof v === 'number' && Number.isFinite(v)
  })
}

const hasMeasurement = (ctx: SlotContext, key: string): boolean =>
  ctx.details?.measurements?.[key] !== undefined

const StandardDetailsPlugin: ExtensionPlugin = {
  id: 'standard-details',
  label: 'Activity Details',
  description: 'Display heart rate, cadence, speed graphs and zones for each activity',
  icon: 'fas fa-heart-pulse',
  slots: {
    'activity.top': [
      {
        id: 'activity-top',
        component: async () => (await import('./ActivityTopBlock.vue')).default
      }
    ],
    // Each graph gates on the data it plots rather than on the sport: a pool
    // swim has no elevation, and that is the actual reason not to draw it.
    'activity.widgets': [
      {
        id: 'heart-rate',
        component: async () => (await import('./HeartRateGraph.vue')).default,
        appliesTo: ctx => hasSampleData(ctx, 'heartRate')
      },
      {
        id: 'heart-zones',
        component: async () => (await import('./HeartZoneGraph.vue')).default,
        appliesTo: ctx => hasSampleData(ctx, 'heartRate')
      },
      {
        id: 'speed',
        component: async () => (await import('./SpeedSampled.vue')).default,
        appliesTo: ctx => hasSampleData(ctx, 'speed') || hasSampleData(ctx, 'distance')
      },
      {
        id: 'cadence',
        component: async () => (await import('./CadenceGraph.vue')).default,
        appliesTo: ctx => hasSampleData(ctx, 'cadence')
      },
      {
        id: 'swim-summary',
        component: async () => (await import('./SwimSummary.vue')).default,
        appliesTo: ctx =>
          hasMeasurement(ctx, 'swim.swolf') ||
          hasMeasurement(ctx, 'swim.lengths') ||
          hasMeasurement(ctx, 'swim.poolLength')
      }
    ]
  }
}

export default StandardDetailsPlugin
