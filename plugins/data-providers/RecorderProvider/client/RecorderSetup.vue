<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="recorder">
    <!-- Sport picker (idle only) -->
    <div v-if="phase === 'idle'" class="pick">
      <p class="intro">{{ t('providers.recorder.intro') }}</p>
      <label class="lbl">{{ t('providers.recorder.chooseSport') }}</label>
      <div class="sports">
        <button
          v-for="s in sports"
          :key="s"
          class="chip"
          :class="{ 'chip--on': sport === s }"
          @click="sport = s"
        >
          <i :class="getSportIcon(s)" aria-hidden="true"></i> {{ formatSportType(s) }}
        </button>
      </div>
      <button class="btn btn--go" @click="start">
        <i class="fas fa-play" aria-hidden="true"></i> {{ t('providers.recorder.start') }}
      </button>
    </div>

    <!-- Live recording -->
    <div v-else class="live">
      <MapPreview v-if="track.length" :polyline="track" :canzoom="true" theme="osm" class="map" />
      <div v-else class="map map--waiting">
        <i class="fas fa-satellite-dish fa-beat" aria-hidden="true"></i>
        <span>{{ waitingLabel }}</span>
      </div>

      <div class="hud">
        <div class="stat">
          <span class="stat__v">{{ formatClock(stats.duration) }}</span>
          <span class="stat__l">{{ t('providers.recorder.statDuration') }}</span>
        </div>
        <div class="stat">
          <span class="stat__v"
            >{{ distance.value }}<small>{{ distance.unit }}</small></span
          >
          <span class="stat__l">{{ t('providers.recorder.statDistance') }}</span>
        </div>
        <div class="stat">
          <span class="stat__v"
            >{{ pace.value }}<small>{{ pace.unit }}</small></span
          >
          <span class="stat__l">{{ t('providers.recorder.statPace') }}</span>
        </div>
      </div>

      <div class="controls">
        <button v-if="phase === 'recording'" class="btn btn--pause" @click="pause">
          <i class="fas fa-pause" aria-hidden="true"></i> {{ t('providers.recorder.pause') }}
        </button>
        <button v-else class="btn btn--go" @click="resume">
          <i class="fas fa-play" aria-hidden="true"></i> {{ t('providers.recorder.resume') }}
        </button>
        <button class="btn btn--stop" @click="stop">
          <i class="fas fa-stop" aria-hidden="true"></i> {{ t('providers.recorder.stop') }}
        </button>
      </div>
    </div>

    <p v-if="doneMessage" class="ok">
      <i class="fas fa-check-circle" aria-hidden="true"></i> {{ doneMessage }}
    </p>
    <div v-if="errorMessage" class="err">
      <p><i class="fas fa-triangle-exclamation" aria-hidden="true"></i> {{ errorMessage }}</p>
      <!-- A refused permission cannot be asked for twice: the way back is the OS. -->
      <button v-if="permissionDenied" class="btn btn--settings" @click="openSettings">
        <i class="fas fa-gear" aria-hidden="true"></i> {{ t('providers.recorder.openSettings') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import MapPreview from '@/components/MapPreview.vue'
import { usePluginContext } from '@/composables/usePluginContext'
import { formatSportType, getSportIcon, COMMON_SPORT_TYPES } from '@/utils/sportLabels'
import { formatClock } from '@/utils/duration'
import type { SportType } from '@/types/sport'
import { NOT_AUTHORIZED, openLocationSettings } from './geo'
import { liveStats, MAX_ACCURACY } from './recorder'
import * as recorder from './session'

/** How often the live track handed to the map is refreshed (ms). */
const MAP_REFRESH_MS = 5000

const { t } = useI18n()
const ctx = usePluginContext()

const sports = COMMON_SPORT_TYPES as SportType[]
const sport = ref<SportType>('running')
const doneMessage = ref('')
const localError = ref('')

// The recording itself lives in ./session, not here: it has to outlive this
// screen (see the comment at the top of that module).
const state = recorder.state
const phase = computed(() => state.phase)

let ticker: ReturnType<typeof setInterval> | null = null
const nowMs = ref(Date.now())
const track = ref<[number, number][]>([])

const stats = computed(() => liveStats(state.session, nowMs.value))

const permissionDenied = computed(() => state.error?.code === NOT_AUTHORIZED)
const errorMessage = computed(() => {
  if (localError.value) return localError.value
  if (!state.error) return ''
  return permissionDenied.value
    ? t('providers.recorder.permissionDenied')
    : t('providers.recorder.error', { message: state.error.message })
})

/**
 * Why the map is still empty. A mute "Waiting for GPS…" over a frozen distance
 * is the moment the user decides the recorder is broken; the first fixes after
 * a cold start are routinely worse than `MAX_ACCURACY`, and saying so costs
 * nothing.
 */
const waitingLabel = computed(() =>
  state.accuracy !== null && state.accuracy > MAX_ACCURACY
    ? t('providers.recorder.gpsAccuracy', { meters: Math.round(state.accuracy) })
    : t('providers.recorder.gpsWaiting')
)

const notification = computed(() => ({
  title: t('providers.recorder.notificationTitle'),
  message: t('providers.recorder.notificationMessage')
}))

// The HUD reads in the user's units like every other figure in the app: the
// stats arrive in SI and only the units layer decides between km and miles.
const distance = computed(() => ctx.units.format('distance', stats.value.distance))
const pace = computed(() => ctx.units.format('pace', stats.value.pace))

function refreshTrack(): void {
  track.value = state.session.points.map(p => [p.lat, p.lng] as [number, number])
}

function startTicker() {
  if (ticker) return
  let sinceMapRefresh = 0
  ticker = setInterval(() => {
    nowMs.value = Date.now()
    sinceMapRefresh += 1000
    if (sinceMapRefresh >= MAP_REFRESH_MS) {
      sinceMapRefresh = 0
      refreshTrack()
    }
  }, 1000)
}
function stopTicker() {
  if (ticker) {
    clearInterval(ticker)
    ticker = null
  }
}

function reportError(err: unknown) {
  localError.value = t('providers.recorder.error', {
    message: err instanceof Error ? err.message : String(err)
  })
}

async function start() {
  localError.value = ''
  doneMessage.value = ''
  startTicker()
  try {
    await recorder.start(sport.value, notification.value)
  } catch (err) {
    reportError(err)
    stopTicker()
  }
}

async function pause() {
  try {
    await recorder.pause()
  } catch (err) {
    reportError(err)
  }
}

async function resume() {
  localError.value = ''
  startTicker()
  try {
    await recorder.resume(notification.value)
  } catch (err) {
    reportError(err)
  }
}

async function stop() {
  stopTicker()
  try {
    const activity = await recorder.finish()
    doneMessage.value = activity
      ? t('providers.recorder.saved')
      : t('providers.recorder.nothingRecorded')
    ctx.notifications.notify(doneMessage.value, { type: activity ? 'success' : 'warning' })
  } catch (err) {
    reportError(err)
  } finally {
    refreshTrack()
  }
}

async function openSettings() {
  try {
    await openLocationSettings()
  } catch (err) {
    reportError(err)
  }
}

onMounted(async () => {
  // Pick up a recording already running in this JS context, or recover one an
  // app kill interrupted. Both cases are the session module's business.
  await recorder.restore()
  sport.value = state.session.sport
  nowMs.value = Date.now()
  refreshTrack()
  if (state.phase !== 'idle') startTicker()
})

onUnmounted(async () => {
  stopTicker()
  // The watcher stays up on purpose: leaving this screen mid-run is not
  // stopping the run. It is the session module that holds it now, so it can
  // still be stopped when the user comes back.
  await recorder.flush()
})
</script>

<style scoped>
.recorder {
  padding: 1rem;
  max-width: 32rem;
  margin: 0 auto;
}
.intro {
  color: var(--color-gray-600, #4b5563);
  font-size: 0.9rem;
  text-align: center;
  margin-bottom: 1rem;
}
.lbl {
  display: block;
  font-size: 0.85rem;
  color: var(--color-gray-500, #6b7280);
  margin-bottom: 0.5rem;
}
.sports {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1.2rem;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.8rem;
  border: 1px solid var(--color-gray-300, #d1d5db);
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  font-size: 0.85rem;
}
.chip--on {
  background: var(--color-green-600, #88aa00);
  color: var(--color-white, #fff);
  border-color: transparent;
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.8rem 1.4rem;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  color: var(--color-white, #fff);
}
.btn--go {
  background: var(--color-green-600, #88aa00);
  width: 100%;
}
.btn--pause {
  background: var(--color-yellow-500, #f59e0b);
  flex: 1;
}
.btn--stop {
  background: var(--color-red-600, #dc2626);
  flex: 1;
}
.btn--settings {
  background: var(--color-gray-700, #374151);
  margin-top: 0.6rem;
}
.map {
  height: 240px;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 1rem;
}
.map--waiting {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  background: var(--color-gray-100, #f3f4f6);
  color: var(--color-gray-500, #6b7280);
}
.hud {
  display: flex;
  justify-content: space-around;
  margin-bottom: 1.2rem;
}
.stat {
  text-align: center;
}
.stat__v {
  display: block;
  font-size: 1.6rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.stat__v small {
  font-size: 0.9rem;
  font-weight: 500;
  margin-left: 2px;
}
.stat__l {
  font-size: 0.75rem;
  color: var(--color-gray-500, #6b7280);
  text-transform: uppercase;
}
.controls {
  display: flex;
  gap: 0.8rem;
}
.ok {
  margin-top: 1rem;
  text-align: center;
  color: var(--color-emerald-700, #047857);
}
.err {
  margin-top: 1rem;
  text-align: center;
  color: var(--color-red-600, #dc2626);
}
</style>
