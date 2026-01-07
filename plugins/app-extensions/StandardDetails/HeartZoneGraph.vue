<template>
  <div class="bg-white rounded-lg shadow p-4">
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-xl font-semibold mb-5 flex items-center gap-2">
          <svg class="w-5 h-5 text-amber-500" fill="#b75e38" viewBox="0 0 24 24">
            <path d="M4 15h2a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1Zm6 4h2a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1Zm6-6h2a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1Zm6 8h2a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1Z"/>
          </svg>
          Zones de FC
        </h3>
        <div class="flex items-center gap-2">
        <label for="maxHrInput" class="text-sm text-gray-500">FCMax</label>
        <input
          id="maxHrInput"
          type="number"
          class="border px-2 py-1 rounded text-sm w-20"
          v-model.number="maxHeartRate"
          @change="saveMaxHeartRate"
        />
      </div>
    </div>

    <div v-if="hasData">
      <div v-for="(zone, index) in zones" :key="index" class="flex items-center gap-2 mb-2">
        
        <div class="flex-1">
          <div class="text-sm font-medium">
            Zone {{ zone.zone }} ({{ zone.label }})
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
    <p v-else class="text-gray-500 text-sm">Aucune donnée de fréquence cardiaque disponible.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Activity, ActivityDetails } from '@/types/activity'
import { getIndexedDBService } from '@/services/IndexedDBService'

const props = defineProps<{ data: { activity: Activity; details: ActivityDetails } }>()
const maxHeartRate = ref(190)
const dbKey = 'max_heart_rate'

onMounted(async () => {
  const db = await getIndexedDBService()
  const stored = await db.getData(dbKey)
  if (stored && typeof stored === 'number') maxHeartRate.value = stored
})

const saveMaxHeartRate = async () => {
  const db = await getIndexedDBService()
  await db.saveData(dbKey, maxHeartRate.value)
}

const heartSamples = computed(() =>
  props.data.details.samples?.filter(s => s.heartRate != null) ?? []
)

const hasData = computed(() => heartSamples.value.length > 0)

const zoneThresholds = [
  { zone: 5, min: 0.9, max: 1.1, color: '#b75e38', label: 'VO₂ Max' },
  { zone: 4, min: 0.8, max: 0.9, color: '#f49268', label: 'Seuil' },
  { zone: 3, min: 0.7, max: 0.8, color: '#00bbd3', label: 'Tempo' },
  { zone: 2, min: 0.6, max: 0.7, color: '#88aa00', label: 'Endurance' },
  { zone: 1, min: 0.5, max: 0.6, color: '#ffffff', label: 'Récup.' }
]

const zones = computed(() => {
  if (!props.data.details.samples?.length) return []

  const durationPerZone = Array(5).fill(0)  // secondes par zone
  let totalDuration = 0                     // toutes zones confondues

  const all = props.data.details.samples

  for (let i = 1; i < all.length; i++) {
    const prev = all[i - 1]
    const curr = all[i]

    const dt = curr.time - prev.time        // delta temps (s)
    if (dt <= 0) continue
    totalDuration += dt

    // on prend la FC du point "prev" (ou curr si absente)
    const hr = prev.heartRate ?? curr.heartRate
    if (hr == null) continue                // on ignore la plage sans FC

    const ratio = hr / maxHeartRate.value
    const idx = zoneThresholds.findIndex(z => ratio >= z.min && ratio < z.max)
    if (idx !== -1) durationPerZone[idx] += dt
  }

  // Construction des objets zone
  return zoneThresholds.map((thr, i) => {
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
.bg-white {
  background-color: white;
}
</style>
