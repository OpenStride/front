<template>
  <section class="section-card">
    <h3 class="section-title">
      <i class="fas fa-trophy" aria-hidden="true"></i>
      {{ t('statistics.records.title') }}
    </h3>

    <div v-if="computing" class="computing">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progress + '%' }"></div>
      </div>
      <p class="computing-text">{{ t('statistics.records.computing') }} {{ progress }}%</p>
    </div>

    <div v-else-if="records.length === 0" class="empty-records">
      <p>{{ t('statistics.records.noRecords') }}</p>
      <p class="hint">{{ t('statistics.records.noRecordsHint') }}</p>
    </div>

    <div v-else class="records-table-wrapper">
      <table class="records-table">
        <thead>
          <tr>
            <th>{{ t('statistics.records.distance') }}</th>
            <th>{{ t('statistics.records.time') }}</th>
            <th>{{ t('statistics.records.pace') }}</th>
            <th class="hide-mobile">{{ t('statistics.records.speed') }}</th>
            <th>{{ t('statistics.records.date') }}</th>
            <th class="hide-mobile"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in records" :key="r.distance">
            <td class="distance-cell">{{ r.distanceLabel }}</td>
            <td>{{ formatDuration(r.duration) }}</td>
            <td>{{ formatPace(r.pace) }}</td>
            <td class="hide-mobile">{{ formatSpeed(r.speed) }}</td>
            <td>{{ formatDate(r.date) }}</td>
            <td class="hide-mobile">
              <router-link :to="`/activity-details/${r.activityId}`" class="view-link">
                <i class="fas fa-external-link-alt" aria-hidden="true"></i>
              </router-link>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Activity } from '@/types/activity'
import { usePersonalRecords } from '../composables/usePersonalRecords'
import { toMs } from '../types'

const { t } = useI18n()

const props = defineProps<{
  activities: Activity[]
  selectedSport: string
}>()

const { records, computing, progress } = usePersonalRecords(
  toRef(props, 'activities'),
  toRef(props, 'selectedSport')
)

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"`
  return `${m}'${String(s).padStart(2, '0')}"`
}

function formatPace(minPerKm: number): string {
  const m = Math.floor(minPerKm)
  const s = Math.round((minPerKm - m) * 60)
  return `${m}'${String(s).padStart(2, '0')}"/km`
}

function formatSpeed(kmh: number): string {
  return `${kmh.toFixed(1)} km/h`
}

function formatDate(timestamp: number): string {
  return new Date(toMs(timestamp)).toLocaleDateString()
}
</script>

<style scoped>
.section-card {
  background: rgba(255, 255, 255, 0.92);
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  padding: 1.2rem 1.4rem;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.section-title i {
  color: var(--color-green-500);
}

.computing {
  padding: 1rem 0;
}

.progress-bar {
  height: 6px;
  background: var(--color-green-100);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.progress-fill {
  height: 100%;
  background: var(--color-green-500);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.computing-text {
  font-size: 0.85rem;
  color: var(--text-color);
  opacity: 0.7;
  text-align: center;
  margin: 0;
}

.empty-records {
  text-align: center;
  padding: 1.5rem;
  color: var(--text-color);
}

.empty-records .hint {
  font-size: 0.85rem;
  opacity: 0.6;
  margin-top: 0.3rem;
}

.records-table-wrapper {
  overflow-x: auto;
}

.records-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.records-table th {
  text-align: left;
  padding: 0.5rem 0.6rem;
  border-bottom: 2px solid var(--color-green-200);
  color: var(--text-color);
  font-weight: 600;
  white-space: nowrap;
}

.records-table td {
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid #eee;
  color: var(--text-color);
  white-space: nowrap;
}

.distance-cell {
  font-weight: 600;
  color: var(--color-green-600);
}

.view-link {
  color: var(--color-green-500);
  text-decoration: none;
}

.view-link:hover {
  color: var(--color-green-700);
}

@media (max-width: 640px) {
  .hide-mobile {
    display: none;
  }

  .records-table {
    font-size: 0.8rem;
  }

  .records-table th,
  .records-table td {
    padding: 0.4rem;
  }
}
</style>
