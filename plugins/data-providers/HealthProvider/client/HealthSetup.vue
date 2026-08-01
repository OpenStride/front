<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="health-setup">
    <p class="intro">{{ t('providers.health.intro') }}</p>

    <div v-if="!authorized" class="actions">
      <button class="btn" :disabled="busy" @click="authorize">
        <i :class="busy ? 'fas fa-spinner fa-spin' : 'fas fa-heart-pulse'" aria-hidden="true"></i>
        {{ busy ? t('providers.health.authorizing') : t('providers.health.authorize') }}
      </button>
    </div>

    <div v-else class="actions">
      <p class="connected">
        <i class="fas fa-check-circle" aria-hidden="true"></i> {{ t('providers.health.connected') }}
      </p>
      <button class="btn" :disabled="busy" @click="importWorkouts">
        <i :class="busy ? 'fas fa-spinner fa-spin' : 'fas fa-download'" aria-hidden="true"></i>
        {{ busy ? t('providers.health.importing', { done, total }) : t('providers.health.import') }}
      </button>
      <div v-if="busy && total > 0" class="bar">
        <div class="bar__fill" :style="{ width: pct + '%' }"></div>
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
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePluginContext } from '@/composables/usePluginContext'
import type { Activity } from '@/types/activity'
import { requestHealthPermissions, queryWorkouts } from './health'
import { adaptHealthWorkout } from './adapter'

const { t } = useI18n()
const ctx = usePluginContext()

const authorized = ref(false)
const busy = ref(false)
const done = ref(0)
const total = ref(0)
const doneMessage = ref('')
const error = ref('')
const pct = computed(() => (total.value ? Math.round((done.value / total.value) * 100) : 0))

async function authorize() {
  busy.value = true
  error.value = ''
  try {
    await requestHealthPermissions()
    authorized.value = true
  } catch (err) {
    error.value = t('providers.health.error', {
      message: err instanceof Error ? err.message : String(err)
    })
  } finally {
    busy.value = false
  }
}

async function importWorkouts() {
  busy.value = true
  error.value = ''
  doneMessage.value = ''
  done.value = 0
  total.value = 0
  try {
    // Import the last 12 months of workouts.
    const end = new Date()
    const start = new Date(end)
    start.setMonth(start.getMonth() - 12)
    const workouts = await queryWorkouts(start.toISOString(), end.toISOString())
    total.value = workouts.length

    const existing = await ctx.activity.getAllActivities()
    const seen = new Set(existing.map((a: Activity) => a.startTime))

    let imported = 0
    for (const w of workouts) {
      try {
        const { activity, details } = adaptHealthWorkout(w)
        if (!seen.has(activity.startTime)) {
          await ctx.activity.saveActivityWithDetails(activity, details)
          seen.add(activity.startTime)
          imported++
        }
      } catch (err) {
        console.warn('[HealthImport] Failed to import a workout:', err)
      }
      done.value++
    }

    doneMessage.value = t('providers.health.done', { count: imported })
    ctx.notifications.notify(doneMessage.value, { type: 'success' })
  } catch (err) {
    error.value = t('providers.health.error', {
      message: err instanceof Error ? err.message : String(err)
    })
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.health-setup {
  padding: 1.2rem;
  max-width: 30rem;
  margin: 0 auto;
  text-align: center;
}
.intro {
  color: var(--color-gray-600, #4b5563);
  font-size: 0.9rem;
  margin-bottom: 1.2rem;
}
.actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.8rem;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.2rem;
  background: var(--color-green-600, #88aa00);
  color: var(--color-white, #fff);
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.connected {
  color: var(--color-emerald-700, #047857);
  font-size: 0.9rem;
}
.bar {
  width: 100%;
  height: 6px;
  background: var(--color-gray-200, #e5e7eb);
  border-radius: 999px;
  overflow: hidden;
}
.bar__fill {
  height: 100%;
  background: var(--color-green-500, #88aa00);
  transition: width 0.2s;
}
.ok {
  margin-top: 1rem;
  color: var(--color-emerald-700, #047857);
}
.err {
  margin-top: 1rem;
  color: var(--color-red-600, #dc2626);
}
</style>
