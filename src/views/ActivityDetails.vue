<template>
  <div class="activity-details">
    <div v-if="loading">Chargement...</div>
    <div v-else-if="activity">
      <!-- Friend activity banner -->
      <div v-if="isFriendActivity" class="friend-banner">
        <i class="fas fa-user-friends" aria-hidden="true"></i>
        <span>Activité de <strong>{{ friendUsername }}</strong></span>
      </div>

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
import { getActivityService } from '@/services/ActivityService'
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
const isFriendActivity = ref(false)
const friendUsername = ref('')

onMounted(async () => {
  const id = route.params.activityId as string
  const source = route.query.source as string
  const friendId = route.query.friendId as string
  const activityService = await getActivityService();

  if (source === 'friend' && friendId) {
    // Load from friend_activities store
    const friendActivity = await activityService.getFriendActivity(friendId, id);
    if (friendActivity) {
      // Adapt structure for display
      activity.value = {
        id: friendActivity.activityId,
        startTime: friendActivity.startTime,
        duration: friendActivity.duration,
        distance: friendActivity.distance,
        type: friendActivity.type,
        title: friendActivity.title,
        mapPolyline: friendActivity.mapPolyline,
        provider: `friend_${friendActivity.friendId}`
      } as Activity;

      // No full details for friend activities (no samples available)
      activityDetails.value = {
        id: friendActivity.activityId,
        startTime: friendActivity.startTime,
        duration: friendActivity.duration,
        distance: friendActivity.distance,
        type: friendActivity.type,
        title: friendActivity.title,
        mapPolyline: friendActivity.mapPolyline,
        samples: [],  // No samples for friends
        laps: []
      } as ActivityDetails;

      isFriendActivity.value = true;
      friendUsername.value = friendActivity.friendUsername;
    }
  } else {
    // Load from my activities (current behavior)
    activityDetails.value = await activityService.getDetails(id);
    activity.value = await activityService.getActivity(id);
  }

  // Continue with analysis if samples are available
  if (activityDetails.value?.samples?.length) {
    const analyzer = new ActivityAnalyzer(activityDetails.value.samples);
    samples.value = analyzer.sampleAverageByDistance(500);
  }

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

.friend-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: linear-gradient(135deg, var(--color-green-500) 0%, var(--color-green-600) 100%);
  color: white;
  padding: 0.75rem 1rem;
  font-size: 0.9rem;
}

.friend-banner i {
  font-size: 1.1rem;
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
