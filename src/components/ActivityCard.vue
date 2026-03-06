<template>
  <div class="activity-card" data-test="activity-card">
    <div class="map-container">
      <MapPreview v-if="hasMap" class="map-top" :polyline="activity.mapPolyline" theme="osm" />
      <!-- Friend Badge -->
      <div v-if="friendUsername" class="friend-badge">
        <i class="fas fa-user friend-icon" aria-hidden="true"></i>
        <span class="friend-name">{{ friendUsername }}</span>
      </div>
    </div>
    <div class="card-content">
      <!-- header inchangé -->
      <div class="activity-card-header">
        <div class="icon-label">
          <h3 class="text-xl font-bold mb-6 flex items-center gap-2">
            <i :class="iconClass" class="text-[1.5rem] activity-icon" aria-hidden="true"></i>
            {{ activity.title || formatSportType(activity.type) }}
          </h3>
        </div>
        <div class="right-side">
          <span class="date">{{ formatDate(activity.startTime) }}</span>
          <button class="menu-button" @click="toggleMenu" aria-label="Menu actions">⋮</button>
        </div>
      </div>

      <!-- grille simplifiée -->
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm text-gray-700 mt-4">
        <div class="flex items-center gap-2">
          <i class="fas fa-ruler-horizontal text-lg text-gray-600" aria-hidden="true"></i>
          <span>{{ formatDistance(activity.distance) }}</span>
        </div>
        <div class="flex items-center gap-2">
          <i class="fas fa-stopwatch text-lg text-gray-600" aria-hidden="true"></i>
          <span>{{ formatDuration(activity.duration) }}</span>
        </div>
        <div class="flex items-center gap-2">
          <i class="fas fa-tachometer-alt text-lg text-gray-600" aria-hidden="true"></i>
          <span>{{ formatPace(activity.distance, activity.duration) }}</span>
        </div>
        <div class="flex items-center gap-2">
          <i class="fas fa-calendar-alt text-lg text-gray-600" aria-hidden="true"></i>
          <span>{{ formatDate(activity.startTime) }}</span>
        </div>
      </div>

      <!-- Interactions (friend and own activities) -->
      <InteractionBar
        v-if="canShowInteractions"
        :activity-id="interactionActivityId"
        :activity-owner-id="interactionOwnerId!"
        :show-warning="!!friendUsername"
        :is-mutual-friend="isMutualFriend"
        class="card-interactions"
      />

      <!-- footer inchangé -->
      <div class="footer">
        <button @click="showDetails" class="details-button">Voir détails →</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import MapPreview from './MapPreview.vue'
import InteractionBar from './InteractionBar.vue'
import router from '@/router'
import { Activity } from '@/types/activity'
import { getInteractionService } from '@/services/InteractionService'
import { IndexedDBService } from '@/services/IndexedDBService'
import type { Friend, FriendActivity } from '@/types/friend'
import { formatSportType, getSportIcon } from '@/utils/sportLabels'

const props = defineProps<{
  activity: Activity
  friendUsername?: string
}>()
const showMenu = ref(false)

// formatage date en français
const formatDate = (ts: number) =>
  new Date(ts * 1000).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })

// formatage durée hh mm ss ou mm ss
const formatDuration = (sec: number) => {
  if (sec > 3600) {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    return `${h}h ${m}m ${s}s`
  }
  const m = Math.floor(sec / 60)
  return `${m}m ${sec % 60}s`
}

// formatage distance en km
const formatDistance = (m: number) => `${(m / 1000).toFixed(2)} km`

// calcul du pace (min/km) à partir de distance (m) et durée (s)
const formatPace = (distanceMeters: number, durationSec: number) => {
  if (!distanceMeters || !durationSec) return '-'
  const secPerKm = durationSec / (distanceMeters / 1000)
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}'${s.toString().padStart(2, '0')}" /km`
}

const iconClass = computed(() => getSportIcon(props.activity.type))

// Extract friendId for interactions
const friendId = computed(() => {
  if (!props.friendUsername) return null
  const friendActivity = props.activity as Activity & Partial<FriendActivity>
  return (
    friendActivity.friendId ||
    (props.activity.provider?.startsWith('friend_') ? props.activity.provider.substring(7) : null)
  )
})

// Get original activity ID (for friend activities)
const originalActivityId = computed(() => {
  const friendActivity = props.activity as Activity & Partial<FriendActivity>
  return friendActivity.activityId || props.activity.id
})

// ========== InteractionBar support for both friend and own activities ==========
const myUserId = ref<string | null>(null)
const friendStableUserId = ref<string | null>(null)
const isMutualFriend = ref<boolean>(false)

onMounted(async () => {
  const interactionService = getInteractionService()
  myUserId.value = await interactionService.getMyUserId()

  // Load friend's stable userId and mutual friendship status if this is a friend activity
  if (props.friendUsername && friendId.value) {
    const db = await IndexedDBService.getInstance()
    const friend = (await db.getDataFromStore('friends', friendId.value)) as Friend | null
    if (friend?.userId) {
      friendStableUserId.value = friend.userId
    }
    // Set mutual friendship status
    isMutualFriend.value = friend?.followsMe === true
  }
})

// Activity ID for interactions
const interactionActivityId = computed(() => {
  if (props.friendUsername) {
    return originalActivityId.value
  }
  return props.activity.id
})

// Owner of the activity (prefer stable userId, fallback to URL-based friendId)
const interactionOwnerId = computed(() => {
  if (props.friendUsername) {
    // Use stable userId if available, fallback to URL-based friendId for backwards compat
    return friendStableUserId.value || friendId.value
  }
  return myUserId.value // My own activity
})

// Show InteractionBar only if we have a valid owner
const canShowInteractions = computed(() => {
  return interactionOwnerId.value !== null
})

// présence de carte
const hasMap = computed(
  () => Array.isArray(props.activity.mapPolyline) && props.activity.mapPolyline.length > 1
)

const showDetails = () => {
  if (props.friendUsername) {
    const fa = props.activity as Activity & Partial<FriendActivity>
    const fId =
      fa.friendId ||
      (props.activity.provider?.startsWith('friend_')
        ? props.activity.provider.substring(7)
        : null)
    const activityId = fa.activityId || props.activity.id

    if (fId && activityId) {
      router.push({
        name: 'ActivityDetails',
        params: { activityId },
        query: { source: 'friend', friendId: fId }
      })
    } else {
      console.error(
        '[ActivityCard] Cannot navigate to friend activity: missing friendId or activityId',
        { friendId: fId, activityId, activity: props.activity }
      )
    }
  } else {
    router.push({ name: 'ActivityDetails', params: { activityId: props.activity.id } })
  }
}

const toggleMenu = () => {
  showMenu.value = !showMenu.value
}
</script>

<style scoped>
.activity-card {
  background: var(--color-white);
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  margin-bottom: 1.5rem;
  width: 100%;
}

.map-container {
  position: relative;
  width: 100%;
}

.map-top {
  width: 100%;
  height: 240px;
}

.friend-badge {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  background: linear-gradient(135deg, var(--color-green-500) 0%, var(--color-green-600) 100%);
  color: var(--color-white);
  padding: 0.375rem 0.75rem;
  border-radius: 1rem;
  font-size: 0.75rem;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(136, 170, 0, 0.3);
  z-index: 10;
}

.friend-icon {
  font-size: 0.875rem;
}

.friend-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-content {
  padding: 1rem;
}

.activity-card-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 0.5rem;
}

.icon-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.icon {
  font-size: 1.2rem;
}

.activity-icon {
  color: var(--color-green-500);
}

.right-side {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.date {
  font-size: 0.85rem;
  color: var(--color-gray-400);
}

.menu-button {
  background: none;
  border: none;
  font-size: 1.3rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  color: var(--color-gray-400);
}

.details {
  font-size: 0.9rem;
  color: var(--color-gray-700);
  margin-top: 0.75rem;
}

.footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 1rem;
}

.details-button {
  background: var(--color-gray-100);
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background 0.2s ease;
}

.details-button:hover {
  background: var(--color-gray-200);
}

.card-interactions {
  margin-top: 0.75rem;
}

/* Full-width sur mobile */
@media (max-width: 640px) {
  .activity-card {
    border-radius: 0;
    width: 100vw;
  }

  .card-content {
    padding: 1rem;
  }
}
</style>
