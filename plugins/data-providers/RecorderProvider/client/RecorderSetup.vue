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
      <MapPreview
        v-if="polyline.length"
        :polyline="polyline"
        :canzoom="true"
        theme="osm"
        class="map"
      />
      <div v-else class="map map--waiting">
        <i class="fas fa-satellite-dish fa-beat" aria-hidden="true"></i>
        <span>{{ t('providers.recorder.gpsWaiting') }}</span>
      </div>

      <div class="hud">
        <div class="stat">
          <span class="stat__v">{{ fmtDuration(stats.duration) }}</span>
          <span class="stat__l">{{ t('providers.recorder.statDuration') }}</span>
        </div>
        <div class="stat">
          <span class="stat__v">{{ (stats.distance / 1000).toFixed(2) }}<small>km</small></span>
          <span class="stat__l">{{ t('providers.recorder.statDistance') }}</span>
        </div>
        <div class="stat">
          <span class="stat__v">{{ fmtPace(stats.pace) }}<small>/km</small></span>
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
    <p v-if="error" class="err">
      <i class="fas fa-triangle-exclamation" aria-hidden="true"></i> {{ error }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import MapPreview from '@/components/MapPreview.vue'
import { usePluginContext } from '@/composables/usePluginContext'
import { formatSportType, getSportIcon, COMMON_SPORT_TYPES } from '@/utils/sportLabels'
import type { SportType } from '@/types/sport'
import { startWatch, stopWatch, type GeoPoint } from './geo'
import { liveStats, buildActivity, type RecordSession } from './recorder'

const STORAGE_KEY = 'recorder:session'
const ACCURACY_LIMIT = 30 // discard fixes worse than 30m

const { t } = useI18n()
const ctx = usePluginContext()

const sports = COMMON_SPORT_TYPES as SportType[]
const sport = ref<SportType>('running')
const phase = ref<'idle' | 'recording' | 'paused'>('idle')
const doneMessage = ref('')
const error = ref('')

const session = reactive<RecordSession>({ sport: 'running', startTime: 0, pausedMs: 0, points: [] })
let watcherId: string | null = null
let pausedAt: number | null = null
let ticker: ReturnType<typeof setInterval> | null = null
const nowMs = ref(Date.now())

const stats = computed(() => liveStats(session, nowMs.value))
const polyline = computed<[number, number][]>(() => session.points.map(p => [p.lat, p.lng]))

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}
function fmtPace(secPerKm: number): string {
  if (!secPerKm) return '--:--'
  return `${Math.floor(secPerKm / 60)}'${String(secPerKm % 60).padStart(2, '0')}`
}

async function persist() {
  await ctx.storage.saveData(STORAGE_KEY, JSON.parse(JSON.stringify(session)))
}

function onPoint(p: GeoPoint) {
  if (phase.value !== 'recording') return
  if (typeof p.accuracy === 'number' && p.accuracy > ACCURACY_LIMIT) return
  session.points.push(p)
  void persist()
}

async function beginWatch() {
  watcherId = await startWatch(onPoint, msg => {
    error.value = t('providers.recorder.error', { message: msg })
  })
}

function startTicker() {
  if (!ticker) ticker = setInterval(() => (nowMs.value = Date.now()), 1000)
}
function stopTicker() {
  if (ticker) {
    clearInterval(ticker)
    ticker = null
  }
}

async function start() {
  error.value = ''
  doneMessage.value = ''
  session.sport = sport.value
  session.startTime = Date.now()
  session.pausedMs = 0
  session.points = []
  phase.value = 'recording'
  startTicker()
  try {
    await beginWatch()
    await persist()
  } catch (err) {
    error.value = t('providers.recorder.error', {
      message: err instanceof Error ? err.message : String(err)
    })
    phase.value = 'idle'
    stopTicker()
  }
}

async function pause() {
  phase.value = 'paused'
  pausedAt = Date.now()
  if (watcherId) {
    await stopWatch(watcherId)
    watcherId = null
  }
  await persist()
}

async function resume() {
  if (pausedAt) {
    session.pausedMs += Date.now() - pausedAt
    pausedAt = null
  }
  phase.value = 'recording'
  startTicker()
  await beginWatch()
  await persist()
}

async function stop() {
  if (watcherId) {
    await stopWatch(watcherId)
    watcherId = null
  }
  stopTicker()

  try {
    if (session.points.length > 0) {
      const { activity, details } = buildActivity(session)
      await ctx.activity.saveActivityWithDetails(activity, details)
      doneMessage.value = t('providers.recorder.saved')
      ctx.notifications.notify(doneMessage.value, { type: 'success' })
    }
  } catch (err) {
    error.value = t('providers.recorder.error', {
      message: err instanceof Error ? err.message : String(err)
    })
  } finally {
    await ctx.storage.deleteData(STORAGE_KEY)
    phase.value = 'idle'
    session.points = []
  }
}

onMounted(async () => {
  // Recover an interrupted recording (app was killed mid-run).
  const saved = await ctx.storage.getData<RecordSession>(STORAGE_KEY)
  if (saved && saved.points?.length) {
    Object.assign(session, saved)
    sport.value = saved.sport
    phase.value = 'paused'
    pausedAt = Date.now()
    nowMs.value = Date.now()
  }
})

onUnmounted(async () => {
  stopTicker()
  // Leave the watcher running so tracking continues if the user just navigates
  // away; only persist the latest state.
  if (phase.value !== 'idle') await persist()
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
