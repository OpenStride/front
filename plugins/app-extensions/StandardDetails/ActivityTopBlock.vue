<template>
  <div v-if="polyline">
    <MapPreview
      v-if="polyline.length"
      class="map-top"
      :polyline="polyline"
      :canzoom="true"
      theme="osm"
    />
  </div>
  <div v-if="activity && details" class="bg-white w-full p-4 shadow rounded-lg">
    <h2 class="text-2xl font-bold mb-6 flex items-center gap-2">
      <i :class="iconClass" class="text-[1.5rem]" style="color:#88aa00;"></i>
      {{ activity.title || formatSport(activity.type) }}
    </h2>

    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 text-sm text-gray-700">
      <div class="flex items-center gap-2">
        <i class="fas fa-ruler-horizontal text-lg text-gray-600"></i>
        <span>{{ formatDistance(activity.distance) }}</span>
      </div>
      <div class="flex items-center gap-2">
        <i class="fas fa-mountain text-lg text-gray-600"></i>
        <span>{{ formatElevation(details.stats?.totalAscent ?? 0) }}</span>
      </div>
      <div class="flex items-center gap-2">
        <i class="fas fa-stopwatch text-lg text-gray-600"></i>
        <span>{{ formatDuration(activity.duration) }}</span>
      </div>
      <div class="flex items-center gap-2">
        <i class="fas fa-tachometer-alt text-lg text-gray-600"></i>
        <span>{{ formatPace(details.stats?.averageSpeed ?? 0) }}</span>
      </div>
      <div class="flex items-center gap-2">
        <i class="fas fa-fire text-lg text-gray-600"></i>
        <span>{{ details.stats?.calories ?? 0 }} kcal</span>
      </div>
      <div class="flex items-center gap-2">
        <i class="fas fa-calendar-alt text-lg text-gray-600"></i>
        <span>{{ formatDate(activity.startTime) }}</span>
      </div>
    </div>
  </div>
</template>


<script setup lang="ts">
import { computed } from 'vue'
import MapPreview from '@/components/MapPreview.vue';
import {Activity, ActivityDetails} from '@/types/activity';
const props = defineProps<{ data: { activity: Activity; details: ActivityDetails } }>()

const activity = computed(() => props.data.activity)
const details = computed(() => props.data.details)

const polyline = computed(() => {
  if (!details.value || !details.value.samples || details.value.samples.length === 0) return []

  return details.value.samples
    .filter(s => typeof s.lat === 'number' && typeof s.lng === 'number')
    .map(s => [s.lat, s.lng] as [number, number])
})

const formatDistance = (meters?: number) => `${((meters ?? 0) / 1000).toFixed(2)} km`
const formatElevation = (m?: number) => `${Math.round(m || 0)} m`
const formatDuration = (seconds?: number) => {
  const secValue = seconds ?? 0
  if (secValue > 3600) {
    const hours = Math.floor(secValue / 3600)
    const min = Math.floor((secValue % 3600) / 60)
    const sec = secValue % 60
    return `${hours}h ${min}m ${sec}s`
  }
  const min = Math.floor(secValue / 60)
  return `${min}m ${secValue % 60}s`
}
const formatPace = (metersPerSecond?: number) => {
  if (!metersPerSecond || metersPerSecond <= 0) return '—'
  const paceInMinPerKm = 1000 / metersPerSecond / 60
  const min = Math.floor(paceInMinPerKm)
  const sec = Math.round((paceInMinPerKm - min) * 60)
  return `${min}:${String(sec).padStart(2, '0')} min/km`
}
const formatDate = (timestamp?: number) => {
  if (!timestamp) return 'N/A';
  return new Date(timestamp * 1000).toLocaleString()
}

const faIcons: Record<string, string> = {
  RUNNING : 'fas fa-person-running',
  RUN : 'fas fa-person-running',
  CYCLING : 'fas fa-person-biking',
  SWIMMING: 'fas fa-person-swimming',
  HIKING  : 'fas fa-person-hiking',
  YOGA    : 'fas fa-person-praying'   // choisis l’icône qui te convient
}

const iconClass = computed(() =>
  faIcons[activity.value.type?.toUpperCase() as string] ?? 'fas fa-medal'
)

const formatSport = (sport: string): string => {
  const map: Record<string, string> = {
    RUNNING: 'Course à pied',
    RUN: 'Course à pied',
    CYCLING: 'Vélo',
    SWIMMING: 'Natation',
    HIKING: 'Randonnée',
    YOGA: 'Yoga'
  }
  return map[sport] || 'Activité'
}
</script>

<style scoped>
.bg-white {
  background-color: white;
}

.map-top {
  width: 100%;
  height: 240px;
  padding: 0;
  margin: 0;
}
</style>