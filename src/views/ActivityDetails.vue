<template>
  <div class="activity-details">
    <div v-if="loading">Chargement...</div>
    <div v-else-if="activity">
      <div class="top-container">
        <component v-for="(comp, i) in topSlotComponents" :is="comp?.default || comp" :key="`top-${i}`" :data="activityData" />
      </div>

      <!-- Widgets Section (full width) -->
      <div class="widgets-container">
        <component v-for="(comp, i) in widgetSlotComponents" :is="comp?.default || comp" :key="`widget-${i}`" :data="activityData"
          class="w-full" />
      </div>
      <!-- End of Widgets Section -->
    </div>
    <div v-else>
      <p>Activité introuvable.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useSlotExtensions } from '@/composables/useSlotExtensions'
import { getActivityDBService } from '@/services/ActivityDBService'
import { Activity, ActivityDetails, Sample } from '@/types/activity'
import { ActivityAnalyzer} from '@/services/ActivityAnalyzer'

const { components: widgetSlotComponentsRaw } = useSlotExtensions('activity.widgets')
const { components: topSlotComponentsRaw } = useSlotExtensions('activity.top')

// Normalise modules dynamiques (module.default) → composant direct
const widgetSlotComponents = computed(() => widgetSlotComponentsRaw.value.map(c => (c as any).default || c) )
const topSlotComponents = computed(() => topSlotComponentsRaw.value.map(c => (c as any).default || c) )

const activityData = computed(() => ({
  activity: activity.value,
  details: activityDetails.value,
  samples: samples.value
}));

const route = useRoute()
const activity = ref<Activity | null>(null)
const activityDetails = ref<ActivityDetails | null>(null)
const samples = ref<Sample[]>([])
const loading = ref(true)

onMounted(async () => {
  const id = route.params.activityId as string
  const db = await getActivityDBService();
  activityDetails.value = await db.getDetails(id);
  const analyzer = new ActivityAnalyzer(activityDetails.value?.samples ?? [])
  activity.value = await db.getActivity(id);
  samples.value = analyzer.sampleAverageByDistance(500);
  loading.value = false
})

const formatDate = (timestamp: number) => new Date(timestamp * 1000).toLocaleDateString()
const formatDuration = (seconds: number) => `${Math.round(seconds / 60)} min`
const formatDistance = (meters: number) => `${(meters / 1000).toFixed(2)} km`

const formatSport = (sport: string): string => {
  const map: Record<string, string> = {
    RUNNING: 'Course à pied',
    CYCLING: 'Vélo',
    SWIMMING: 'Natation',
    HIKING: 'Randonnée',
    YOGA: 'Yoga'
  }
  return map[sport] || 'Activité'
}

const hasCoords = computed(() =>
  activity.value?.mapPolyline && activity.value.mapPolyline.length > 0
)
</script>

<style scoped>
.activity-details {
  padding: 0 0 1.5rem 0;
}

.map-preview {
  width: 100%;
  height: 240px;
  margin-top: 1rem;
}


.top-container {
  display: flex;
  flex-direction: column;
}

.widgets-container {
  margin-top: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.widgets-container :deep(.rounded-lg) {
  border-radius: 0 !important;
}
</style>
