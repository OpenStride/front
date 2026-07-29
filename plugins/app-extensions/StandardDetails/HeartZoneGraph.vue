<template>
  <GraphCard :title="t('graphs.heartZones')" icon="fa-layer-group" accent="var(--color-orange-500)">
    <template #actions>
      <label for="maxHrInput">{{ t('graphs.maxHr') }}</label>
      <input
        id="maxHrInput"
        type="number"
        class="graph-input"
        v-model.number="maxHeartRate"
        @change="saveMaxHeartRate"
      />
    </template>

    <div v-if="hasData">
      <div v-for="(zone, index) in zones" :key="index" class="flex items-center gap-2 mb-2">
        <div class="flex-1">
          <div class="text-sm font-medium">
            {{ t('graphs.zone') }} {{ zone.zone }} ({{ zone.label }})
            <span class="text-gray-500 text-xs ml-2">
              [{{ zone.fcMin }}–{{ zone.fcMax }} bpm]
            </span>
          </div>
          <div class="relative h-4 bg-gray-100 rounded overflow-hidden">
            <div
              class="h-full rounded"
              :style="{ width: zone.percentage + '%', backgroundColor: zone.color }"
            ></div>
          </div>
        </div>
        <div class="text-sm text-gray-600 text-right w-28">
          {{ zone.duration }}
          <span class="text-xs">({{ zone.percentage.toFixed(1) }}%)</span>
        </div>
      </div>
    </div>
    <p v-else class="graph-empty">{{ t('graphs.noHeartRate') }}</p>
  </GraphCard>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, onMounted, ref } from 'vue'
import { Activity, ActivityDetails } from '@/types/activity'
import { usePluginContext } from '@/composables/usePluginContext'
import GraphCard from './GraphCard.vue'

const { t } = useI18n()

const cssVar = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

const props = defineProps<{ data: { activity: Activity; details: ActivityDetails } }>()
const { storage } = usePluginContext()
const maxHeartRate = ref(190)
const dbKey = 'max_heart_rate'

onMounted(async () => {
  const stored = await storage.getData(dbKey)
  if (stored && typeof stored === 'number') maxHeartRate.value = stored
})

const saveMaxHeartRate = async () => {
  await storage.saveData(dbKey, maxHeartRate.value)
}

const heartSamples = computed(
  () => props.data.details.samples?.filter(s => s.heartRate != null) ?? []
)

const hasData = computed(() => heartSamples.value.length > 0)

/**
 * Bands are fixed; their names are not. Computed rather than a module const so
 * the labels follow a language change instead of freezing whatever locale was
 * active when this module was first evaluated.
 */
const zoneThresholds = computed(() => [
  {
    zone: 5,
    min: 0.9,
    max: 1.1,
    color: cssVar('--color-orange-700', '#b75e38'),
    label: t('heartZones.vo2max')
  },
  {
    zone: 4,
    min: 0.8,
    max: 0.9,
    color: cssVar('--color-orange-300', '#f49268'),
    label: t('heartZones.threshold')
  },
  {
    zone: 3,
    min: 0.7,
    max: 0.8,
    color: cssVar('--color-cyan-500', '#00bbd3'),
    label: t('heartZones.tempo')
  },
  {
    zone: 2,
    min: 0.6,
    max: 0.7,
    color: cssVar('--color-green-500', '#88aa00'),
    label: t('heartZones.endurance')
  },
  {
    zone: 1,
    min: 0.5,
    max: 0.6,
    color: cssVar('--color-gray-100', '#f3f4f6'),
    label: t('heartZones.recovery')
  }
])

const zones = computed(() => {
  if (!props.data.details.samples?.length) return []

  const durationPerZone = Array(5).fill(0) // secondes par zone
  let totalDuration = 0 // toutes zones confondues

  const all = props.data.details.samples

  for (let i = 1; i < all.length; i++) {
    const prev = all[i - 1]
    const curr = all[i]

    const dt = curr.time - prev.time // delta temps (s)
    if (dt <= 0) continue
    totalDuration += dt

    // on prend la FC du point "prev" (ou curr si absente)
    const hr = prev.heartRate ?? curr.heartRate
    if (hr == null) continue // on ignore la plage sans FC

    const ratio = hr / maxHeartRate.value
    const idx = zoneThresholds.value.findIndex(z => ratio >= z.min && ratio < z.max)
    if (idx !== -1) durationPerZone[idx] += dt
  }

  // Construction des objets zone
  return zoneThresholds.value.map((thr, i) => {
    const seconds = durationPerZone[i]
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.round(seconds % 60)

    return {
      zone: thr.zone,
      color: thr.color,
      label: thr.label,
      percentage: totalDuration ? (seconds / totalDuration) * 100 : 0,
      duration:
        h > 0
          ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
          : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
      fcMin: Math.round(maxHeartRate.value * thr.min),
      fcMax: Math.round(maxHeartRate.value * thr.max)
    }
  })
})
</script>

<style scoped>
.graph-empty {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.graph-input {
  width: 5rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.85rem;
  color: var(--text-color);
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}
</style>
