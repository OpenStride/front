<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="strava-import">
    <h3 class="title">{{ t('providers.strava.title') }}</h3>
    <p class="intro">{{ t('providers.strava.intro') }}</p>

    <ol class="steps">
      <li>
        {{ t('providers.strava.step1') }}
        <a :href="EXPORT_URL" target="_blank" rel="noopener noreferrer" class="link">
          {{ t('providers.strava.step1Link') }}
          <i class="fas fa-external-link-alt" aria-hidden="true"></i>
        </a>
      </li>
      <li>{{ t('providers.strava.step2') }}</li>
      <li>{{ t('providers.strava.step3') }}</li>
    </ol>

    <label class="filepick" :class="{ 'filepick--busy': importing }">
      <i class="fas fa-file-zipper" aria-hidden="true"></i>
      <span>{{ t('providers.strava.selectZip') }}</span>
      <input type="file" accept=".zip" :disabled="importing" @change="onFileChange" />
    </label>

    <div v-if="importing" class="status" aria-live="polite">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <span v-if="total > 0">{{ t('providers.strava.importing', { done, total }) }}</span>
      <span v-else>{{ t('providers.strava.parsing') }}</span>
      <div v-if="total > 0" class="bar">
        <div class="bar__fill" :style="{ width: pct + '%' }"></div>
      </div>
    </div>

    <p v-if="doneMessage" class="ok" aria-live="polite">
      <i class="fas fa-check-circle" aria-hidden="true"></i> {{ doneMessage }}
    </p>
    <p v-if="error" class="err" aria-live="polite">
      <i class="fas fa-triangle-exclamation" aria-hidden="true"></i> {{ error }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import JSZip from 'jszip'
import Papa from 'papaparse'
import { usePluginContext } from '@/composables/usePluginContext'
import type { Activity } from '@/types/activity'
import { adaptStravaExport, type StravaCsvRow } from './adapter'
import { parseTrackFile } from './parseTrack'

const EXPORT_URL = 'https://www.strava.com/athlete/delete_your_account'

const { t } = useI18n()
const ctx = usePluginContext()

const importing = ref(false)
const done = ref(0)
const total = ref(0)
const doneMessage = ref('')
const error = ref('')
const pct = computed(() => (total.value ? Math.round((done.value / total.value) * 100) : 0))

/** Yield to the event loop so the progress UI can repaint during a big import. */
const tick = () => new Promise(r => setTimeout(r, 0))

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

async function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return

  importing.value = true
  error.value = ''
  doneMessage.value = ''
  done.value = 0
  total.value = 0

  try {
    const zip = await JSZip.loadAsync(await readAsArrayBuffer(file))

    // Strava export keeps activities.csv at the root (locate it defensively).
    const csvEntry = Object.keys(zip.files).find(k => k.toLowerCase().endsWith('activities.csv'))
    if (!csvEntry) {
      error.value = t('providers.strava.noCsv')
      importing.value = false
      return
    }

    const csv = await zip.files[csvEntry].async('string')
    const rows = (
      Papa.parse(csv, { header: true, skipEmptyLines: true }).data as StravaCsvRow[]
    ).filter(r => r['Activity ID'])
    total.value = rows.length

    // Skip activities already present (by startTime), like the ZIP importer.
    const existing = await ctx.activity.getAllActivities()
    const existingStartTimes = new Set(existing.map((a: Activity) => a.startTime))

    let imported = 0
    for (const row of rows) {
      try {
        // The Filename column points at the per-activity file (activities/<id>.<ext>).
        const rel = row.Filename?.trim()
        let track = null
        if (rel) {
          const entry =
            zip.files[rel] ?? zip.files[Object.keys(zip.files).find(k => k.endsWith(rel)) ?? '']
          if (entry) {
            const data = await entry.async('uint8array')
            track = await parseTrackFile(rel, data)
          }
        }

        const { activity, details } = adaptStravaExport(row, track)
        if (!existingStartTimes.has(activity.startTime)) {
          await ctx.activity.saveActivityWithDetails(activity, details)
          existingStartTimes.add(activity.startTime)
          imported++
        }
      } catch (err) {
        console.warn('[StravaImport] Failed to import an activity:', err)
      }
      done.value++
      if (done.value % 10 === 0) await tick() // keep the UI responsive
    }

    doneMessage.value = t('providers.strava.done', { count: imported })
    ctx.notifications.notify(doneMessage.value, { type: 'success' })
  } catch (err) {
    error.value = t('providers.strava.error', {
      message: err instanceof Error ? err.message : String(err)
    })
  } finally {
    importing.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}
</script>

<style scoped>
.strava-import {
  padding: 1.2rem;
  max-width: 32rem;
  margin: 0 auto;
}
.title {
  font-size: 1.15rem;
  font-weight: 600;
  margin-bottom: 0.4rem;
}
.intro {
  color: var(--color-gray-600, #4b5563);
  font-size: 0.9rem;
  margin-bottom: 1rem;
}
.steps {
  margin: 0 0 1.2rem 1.1rem;
  padding: 0;
  color: var(--color-gray-700, #374151);
  font-size: 0.9rem;
  line-height: 1.6;
}
.link {
  color: var(--color-green-600, #88aa00);
  font-weight: 500;
  white-space: nowrap;
}
.filepick {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.9rem 1.1rem;
  border: 2px dashed var(--color-gray-300, #d1d5db);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.2s;
}
.filepick:hover {
  border-color: var(--color-green-500, #88aa00);
}
.filepick--busy {
  opacity: 0.6;
  cursor: not-allowed;
}
.filepick input {
  display: none;
}
.status {
  margin-top: 1rem;
  color: var(--color-gray-600, #4b5563);
  font-size: 0.9rem;
}
.bar {
  margin-top: 0.5rem;
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
