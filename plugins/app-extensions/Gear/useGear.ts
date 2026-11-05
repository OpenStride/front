import { computed, onMounted, onUnmounted, ref } from 'vue'
import { usePluginContext } from '@/composables/usePluginContext'
import type { Activity } from '@/types/activity'
import type { Gear, GearKind } from '@/types/gear'
import { gearUsage, wearLevel, type GearUsage, type WearLevel } from '@/utils/gear'
import { formatCompactDuration } from '@/utils/duration'

export const KIND_ICON: Record<GearKind, string> = {
  shoes: 'fa-shoe-prints',
  bike: 'fa-bicycle',
  other: 'fa-toolbox'
}

/** The reader's gear, the activities that wear it, and the wear itself. */
export function useGear() {
  const ctx = usePluginContext()
  const gear = ref<Gear[]>([])
  const activities = ref<Activity[]>([])
  const loaded = ref(false)

  async function reload() {
    const [g, a] = await Promise.all([ctx.gear.list(), ctx.activity.getAllActivities()])
    gear.value = g
    activities.value = a
    loaded.value = true
  }

  let stop: (() => void) | undefined
  onMounted(() => {
    stop = ctx.gear.onChanged(reload)
    reload()
  })
  onUnmounted(() => stop?.())

  const usage = computed(() => gearUsage(activities.value, gear.value))

  function usageOf(g: Gear): GearUsage {
    return usage.value.get(g.id) ?? { distance: 0, duration: 0, count: 0, lastUsed: null }
  }

  function levelOf(g: Gear): WearLevel {
    return wearLevel(g, usage.value.get(g.id))
  }

  /** Whole units: wear is read in hundreds of km, not to the metre. */
  function distanceText(si: number): string {
    const { value, unit } = ctx.units.convert('distance', si)
    return `${Math.round(value)} ${unit}`
  }

  /** "512 km · 48 h": distance only when there is some, as a bike trainer has none. */
  function usageText(g: Gear): string {
    const u = usageOf(g)
    const parts: string[] = []
    if (u.distance > 0) parts.push(distanceText(u.distance))
    parts.push(formatCompactDuration(u.duration))
    return parts.join(' · ')
  }

  return { ctx, gear, activities, loaded, reload, usageOf, levelOf, usageText, distanceText }
}
