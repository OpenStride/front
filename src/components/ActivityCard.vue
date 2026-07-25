<template>
  <article class="acard" data-test="activity-card">
    <div
      class="acard__click"
      role="link"
      tabindex="0"
      @click="showDetails"
      @keydown.enter="showDetails"
    >
      <!-- Héro : tracé GPS (ou placeholder grille) -->
      <div class="acard__hero">
        <MapPreview v-if="hasMap" class="acard__map" :polyline="activity.mapPolyline" theme="osm" />
        <div v-else class="acard__map acard__map--empty" aria-hidden="true"></div>

        <div v-if="friendUsername" class="acard__friend">
          <i class="fas fa-user" aria-hidden="true"></i>
          <span class="acard__friend-name">{{ friendUsername }}</span>
        </div>
        <div class="acard__datechip">{{ shortDate }}</div>
      </div>

      <div class="acard__body">
        <!-- Badge sport + intitulé + titre -->
        <div class="acard__head">
          <div class="acard__badge">
            <i :class="iconClass" aria-hidden="true"></i>
          </div>
          <div class="acard__headtext">
            <div class="acard__kicker">{{ formatSportType(activity.type) }}</div>
            <h3 class="acard__title">{{ activity.title || formatSportType(activity.type) }}</h3>
          </div>
        </div>

        <!-- Métriques clés -->
        <div class="acard__metrics">
          <div class="acard__metric">
            <span class="acard__label">{{ t('activityCard.distance', 'Distance') }}</span>
            <span class="acard__value">{{ distanceValue }}<small>km</small></span>
          </div>
          <div class="acard__metric">
            <span class="acard__label">{{ t('activityCard.time', 'Time') }}</span>
            <span class="acard__value">{{ formatDuration(activity.duration) }}</span>
          </div>
          <div class="acard__metric acard__metric--accent">
            <span class="acard__label">{{ primaryMetric.label }}</span>
            <span class="acard__value">
              {{ primaryMetric.value }}<small v-if="primaryMetric.unit">{{ primaryMetric.unit }}</small>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Interactions (friend and own activities) -->
    <InteractionBar
      v-if="canShowInteractions"
      :activity-id="interactionActivityId"
      :activity-owner-id="interactionOwnerId!"
      :show-warning="!!friendUsername"
      :is-mutual-friend="isMutualFriend"
      class="acard__interactions"
    />
  </article>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
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
const { t } = useI18n()

const pad = (n: number) => String(n).padStart(2, '0')

// Short date for the map chip: "Wed 04.03"
const shortDate = computed(() => {
  const ts = props.activity.startTime
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const wd = d.toLocaleDateString(undefined, { weekday: 'short' })
  return `${wd} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}`
})

// Compact mono duration: "38:52" or "1:52:14"
const formatDuration = (sec?: number) => {
  const s = Math.max(0, Math.round(sec ?? 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`
}

const distanceValue = computed(() => ((props.activity.distance ?? 0) / 1000).toFixed(2))

// Pace (min/km) for foot sports, speed (km/h) for cycling
const isCycling = computed(() => /cycl|bike|bik|velo|vélo|vtt|ride/i.test(props.activity.type || ''))

const primaryMetric = computed<{ label: string; value: string; unit: string }>(() => {
  const dist = props.activity.distance ?? 0
  const dur = props.activity.duration ?? 0
  if (isCycling.value) {
    const kmh = dur > 0 ? dist / 1000 / (dur / 3600) : 0
    return { label: t('activityCard.speed', 'Speed'), value: kmh > 0 ? kmh.toFixed(1) : '—', unit: 'km/h' }
  }
  if (!dist || !dur) return { label: t('activityCard.pace', 'Pace'), value: '—', unit: '' }
  const secPerKm = dur / (dist / 1000)
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return { label: t('activityCard.pace', 'Pace'), value: `${m}'${pad(s)}`, unit: '/km' }
})

const iconClass = computed(() => getSportIcon(props.activity.type))

const hasMap = computed(
  () => Array.isArray(props.activity.mapPolyline) && props.activity.mapPolyline.length > 1
)

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
    isMutualFriend.value = friend?.followsMe === true
  }
})

const interactionActivityId = computed(() => {
  if (props.friendUsername) {
    return originalActivityId.value
  }
  return props.activity.id
})

const interactionOwnerId = computed(() => {
  if (props.friendUsername) {
    return friendStableUserId.value || friendId.value
  }
  return myUserId.value
})

const canShowInteractions = computed(() => {
  return interactionOwnerId.value !== null
})

const showDetails = () => {
  if (props.friendUsername) {
    const fa = props.activity as Activity & Partial<FriendActivity>
    const fId =
      fa.friendId ||
      (props.activity.provider?.startsWith('friend_') ? props.activity.provider.substring(7) : null)
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
</script>

<style scoped>
.acard {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-card);
  margin-bottom: 1.25rem;
  width: 100%;
  transition: box-shadow 0.18s ease, transform 0.18s ease;
}
.acard:hover {
  box-shadow: 0 14px 34px -18px rgba(30, 30, 46, 0.28);
}

.acard__click {
  cursor: pointer;
  display: block;
}
.acard__click:focus-visible {
  outline: 2px solid var(--color-green-500);
  outline-offset: -2px;
}

/* ── Hero ─────────────────────────────────────────── */
.acard__hero {
  position: relative;
  height: 186px;
  /* Contain the map/chip z-indexes so they never rise above the sticky header */
  isolation: isolate;
}
.acard__map {
  width: 100%;
  height: 100%;
}
.acard__map--empty {
  background: var(--surface-muted);
  background-image: repeating-linear-gradient(
      0deg,
      rgba(30, 30, 46, 0.05) 0 1px,
      transparent 1px 38px
    ),
    repeating-linear-gradient(90deg, rgba(30, 30, 46, 0.05) 0 1px, transparent 1px 38px);
}
.acard__datechip {
  position: absolute;
  right: 12px;
  top: 12px;
  z-index: 500;
  padding: 6px 11px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-muted);
  box-shadow: var(--shadow-card);
}
.acard__friend {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 11px;
  border-radius: var(--radius-pill);
  background: var(--color-green-500);
  color: var(--color-white);
  font-size: 12px;
  font-weight: 600;
  box-shadow: var(--shadow-card);
}
.acard__friend-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Body ─────────────────────────────────────────── */
.acard__body {
  padding: 16px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.acard__head {
  display: flex;
  align-items: center;
  gap: 13px;
}
.acard__badge {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  background: var(--color-green-50);
  border: 1px solid var(--color-green-200);
  display: grid;
  place-items: center;
  color: var(--color-green-700);
  font-size: 18px;
}
.acard__headtext {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.acard__kicker {
  font-family: var(--font-condensed);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.acard__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.1;
  color: var(--color-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Metrics ──────────────────────────────────────── */
.acard__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 28px;
}
.acard__metric {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.acard__label {
  font-family: var(--font-condensed);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.acard__value {
  font-family: var(--font-mono);
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--color-ink);
}
.acard__value small {
  font-size: 11px;
  font-weight: 500;
  margin-left: 3px;
  color: var(--text-faint);
}
.acard__metric--accent .acard__value {
  color: var(--color-green-600);
}
.acard__metric--accent .acard__label {
  color: var(--color-green-600);
}
.acard__metric--accent .acard__value small {
  color: var(--color-green-500);
}

/* ── Interactions ─────────────────────────────────── */
.acard__interactions {
  padding: 0 18px 14px;
  border-top: 1px solid var(--border-subtle);
  margin-top: -2px;
  padding-top: 12px;
}

@media (max-width: 640px) {
  .acard {
    border-radius: var(--radius-md);
  }
}
</style>
