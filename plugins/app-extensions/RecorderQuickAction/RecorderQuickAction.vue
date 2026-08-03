<template>
  <!--
    Two placements on purpose, because there are two jobs.

    Idle, it is an entry point among the other home cards: occasional, worth
    finding, not worth floating over the feed. Recording, it is a live control
    that has to be reachable with a thumb while moving, so it anchors to the
    bottom of the screen and stays there while the user scrolls the feed.
  -->
  <div v-if="visible && phase === 'idle'" class="qa-card" data-test="recorder-quick-action">
    <div class="qa-card__head">
      <i class="fas fa-circle-dot" aria-hidden="true"></i>
      <span>{{ t('recorderQuickAction.title') }}</span>
    </div>
    <div class="qa-card__row">
      <label class="sr-only" for="qa-sport">{{ t('providers.recorder.chooseSport') }}</label>
      <select id="qa-sport" v-model="sport" class="qa-select">
        <option v-for="s in sports" :key="s" :value="s">{{ formatSportType(s) }}</option>
      </select>
      <button class="qa-btn qa-btn--go" data-test="recorder-start" @click="onStart">
        <i class="fas fa-play" aria-hidden="true"></i> {{ t('providers.recorder.start') }}
      </button>
    </div>
    <p v-if="error" class="qa-error">
      <i class="fas fa-triangle-exclamation" aria-hidden="true"></i> {{ error }}
    </p>
  </div>

  <div v-else-if="visible" class="qa-bar" data-test="recorder-quick-action">
    <div class="qa-bar__stats">
      <span class="qa-bar__time">{{ fmtDuration(stats.duration) }}</span>
      <span class="qa-bar__dist">{{ distanceText }}</span>
      <span v-if="phase === 'paused'" class="qa-bar__paused">
        {{ t('recorderQuickAction.paused') }}
      </span>
    </div>
    <div class="qa-bar__actions">
      <button
        v-if="phase === 'recording'"
        class="qa-btn qa-btn--pause"
        data-test="recorder-pause"
        @click="onPause"
      >
        <i class="fas fa-pause" aria-hidden="true"></i> {{ t('providers.recorder.pause') }}
      </button>
      <button v-else class="qa-btn qa-btn--go" data-test="recorder-resume" @click="onResume">
        <i class="fas fa-play" aria-hidden="true"></i> {{ t('providers.recorder.resume') }}
      </button>
      <button class="qa-btn qa-btn--stop" data-test="recorder-finish" @click="onFinish">
        <i class="fas fa-stop" aria-hidden="true"></i> {{ t('providers.recorder.stop') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePluginContext } from '@/composables/usePluginContext'
import { formatSportType, COMMON_SPORT_TYPES } from '@/utils/sportLabels'
import type { SportType } from '@/types/sport'
import { liveStats } from '@plugins/data-providers/RecorderProvider/client/recorder'
import * as recorder from '@plugins/data-providers/RecorderProvider/client/session'

const RECORDER_PROVIDER_ID = 'recorder'
const LAST_SPORT_KEY = 'recorder:lastSport'

const { t } = useI18n()
const ctx = usePluginContext()

const visible = ref(false)
const error = ref('')
const sports = COMMON_SPORT_TYPES as SportType[]
const sport = ref<SportType>('running')

const state = recorder.state
const phase = computed(() => state.phase)

const nowMs = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null

const stats = computed(() => liveStats(state.session, nowMs.value))
/** Through `units`, never `/ 1000`: the reader may be on miles. */
const distanceText = computed(() => ctx.units.format('distance', stats.value.distance).text)

const notification = computed(() => ({
  title: t('providers.recorder.notificationTitle'),
  message: t('providers.recorder.notificationMessage')
}))

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function startTicker() {
  if (!ticker) ticker = setInterval(() => (nowMs.value = Date.now()), 1000)
}
function stopTicker() {
  if (ticker) clearInterval(ticker)
  ticker = null
}

function report(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  if (message === 'cancelled') return
  error.value = t('providers.recorder.error', { message })
}

async function onStart() {
  error.value = ''
  startTicker()
  try {
    await ctx.storage.saveData(LAST_SPORT_KEY, sport.value)
    await recorder.start(sport.value, notification.value)
  } catch (err) {
    report(err)
    stopTicker()
  }
}

async function onPause() {
  try {
    await recorder.pause()
  } catch (err) {
    report(err)
  }
}

async function onResume() {
  try {
    await recorder.resume(notification.value)
  } catch (err) {
    report(err)
  }
}

async function onFinish() {
  stopTicker()
  try {
    const activity = await recorder.finish()
    ctx.notifications.notify(
      activity ? t('providers.recorder.saved') : t('providers.recorder.nothingRecorded'),
      { type: activity ? 'success' : 'warning' }
    )
  } catch (err) {
    report(err)
  }
}

onMounted(async () => {
  // The slot already answered "are we native"; this answers "did the user turn
  // the recorder on". A provider nobody enabled has no business owning the top
  // of the feed.
  visible.value = await ctx.plugins.isPluginActive(RECORDER_PROVIDER_ID)
  if (!visible.value) return

  // Picks up a recording an app kill interrupted, so it can be finished from
  // here without first finding the provider's setup page.
  await recorder.restore()
  const last = await ctx.storage.getData<SportType>(LAST_SPORT_KEY)
  sport.value = state.session.sport ?? last ?? 'running'
  nowMs.value = Date.now()
  if (state.phase !== 'idle') startTicker()
})

onUnmounted(stopTicker)
</script>

<style scoped>
.qa-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 12px;
  padding: 0.9rem 1rem;
  margin-bottom: 1rem;
}
.qa-card__head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  margin-bottom: 0.7rem;
  color: var(--color-ink, #1e1e2e);
}
.qa-card__row {
  display: flex;
  gap: 0.6rem;
}
.qa-select {
  flex: 1;
  min-width: 0;
  padding: 0.6rem 0.7rem;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
  background: var(--color-surface, #fff);
  color: var(--color-ink, #1e1e2e);
}
.qa-error {
  margin-top: 0.6rem;
  font-size: 0.85rem;
  color: var(--color-red-600, #dc2626);
}

/* Anchored, above the safe area so the finish button is not under a home bar. */
.qa-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0.7rem 1rem calc(0.7rem + env(safe-area-inset-bottom));
  background: var(--color-surface, #fff);
  border-top: 1px solid var(--color-border, #e5e7eb);
  box-shadow: 0 -4px 16px rgb(0 0 0 / 8%);
}
.qa-bar__stats {
  display: flex;
  align-items: baseline;
  gap: 0.7rem;
  min-width: 0;
}
.qa-bar__time {
  font-size: 1.3rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--color-ink, #1e1e2e);
}
.qa-bar__dist {
  font-size: 0.95rem;
  color: var(--color-gray-600, #4b5563);
}
.qa-bar__paused {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--color-yellow-600, #d97706);
}
.qa-bar__actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}
.qa-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 1rem;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  color: var(--color-white, #fff);
}
.qa-btn--go {
  background: var(--color-green-600, #4d7c0f);
}
.qa-btn--pause {
  background: var(--color-yellow-500, #f59e0b);
}
.qa-btn--stop {
  background: var(--color-red-600, #dc2626);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
