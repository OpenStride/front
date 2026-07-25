<template>
  <div class="tracker-page">
    <h2 class="tracker-title">
      <i class="fas fa-chart-line" aria-hidden="true"></i>
      {{ t('metricTracker.title') }}
    </h2>

    <div v-if="loading" class="tracker-state">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      {{ t('common.loading') }}
    </div>

    <div v-else-if="activities.length === 0" class="tracker-state empty">
      <i class="fas fa-chart-line" aria-hidden="true"></i>
      <p>{{ t('metricTracker.noData') }}</p>
      <p class="hint">{{ t('metricTracker.noDataHint') }}</p>
    </div>

    <template v-else>
      <div class="controls">
        <label class="control">
          <span class="control-label">{{ t('metricTracker.metric') }}</span>
          <select v-model="selectedMetricId" class="metric-select" data-test="metric-select">
            <optgroup :label="t('metricTracker.groups.direct')">
              <option v-for="m in DIRECT_METRICS" :key="m.id" :value="m.id">
                {{ metricLabel(m) }}
              </option>
            </optgroup>
            <optgroup :label="t('metricTracker.groups.bestTimes')">
              <option v-for="m in DERIVED_METRICS" :key="m.id" :value="m.id">
                {{ metricLabel(m) }}
              </option>
            </optgroup>
          </select>
        </label>

        <div class="control">
          <span class="control-label">{{ t('metricTracker.granularity') }}</span>
          <ChipSelect
            v-model="selectedGranularity"
            :options="granularityOptions"
            :aria-label="t('metricTracker.granularity')"
            test-prefix="granularity"
          />
        </div>

        <div class="control">
          <span class="control-label">{{ t('metricTracker.window') }}</span>
          <ChipSelect
            v-model="selectedWindow"
            :options="windowOptions"
            :aria-label="t('metricTracker.window')"
            test-prefix="window"
          />
        </div>

        <div v-if="sportOptions.length > 1" class="control">
          <span class="control-label">{{ t('metricTracker.sport') }}</span>
          <ChipSelect
            v-model="selectedSport"
            :options="sportChoices"
            :aria-label="t('metricTracker.sport')"
            test-prefix="sport"
          />
        </div>
      </div>

      <section class="chart-card">
        <div v-if="indexing" class="tracker-state indexing">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progress + '%' }"></div>
          </div>
          <p>{{ t('metricTracker.indexing') }} {{ progress }}%</p>
          <p class="hint">{{ t('metricTracker.indexingHint') }}</p>
        </div>

        <div v-else-if="statsLoading" class="tracker-state">
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          {{ t('metricTracker.loadingStats') }}
        </div>

        <div v-else-if="!summary" class="tracker-state empty">
          <p>{{ t('metricTracker.noPoints') }}</p>
          <p class="hint">{{ t('metricTracker.noPointsHint') }}</p>
        </div>

        <template v-else>
          <div class="summary">
            <div class="summary-item">
              <span class="summary-label">{{ t('metricTracker.summary.best') }}</span>
              <span class="summary-value">{{ metric.format(summary.best) }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">{{ t('metricTracker.summary.average') }}</span>
              <span class="summary-value">{{ metric.format(summary.average) }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">{{ t('metricTracker.summary.points') }}</span>
              <span class="summary-value">{{ summary.count }}</span>
            </div>
          </div>

          <MetricSeriesChart :points="points" :labels="labels" :metric="metric" />
        </template>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMetricActivities } from '../composables/useMetricActivities'
import { useMetricIndex } from '../composables/useMetricIndex'
import { buildSeries, summarize } from '../series'
import { DIRECT_METRICS, DERIVED_METRICS, getMetric, hasMetric } from '../metrics'
import {
  GRANULARITIES,
  WINDOWS,
  availableWindows,
  needsDetails,
  needsIndex,
  windowRange,
  type Granularity,
  type MetricDefinition,
  type WindowId
} from '../types'
import { inRange } from '@/utils/timeRange'
import ChipSelect from './ChipSelect.vue'
import MetricSeriesChart from './MetricSeriesChart.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const { activities, stats, sportOptions, loading, statsLoading, ensureStats } =
  useMetricActivities()
const { derived, indexing, progress, ensureIndex } = useMetricIndex()

function isGranularity(value: unknown): value is Granularity {
  return GRANULARITIES.includes(value as Granularity)
}

function isWindow(value: unknown): value is WindowId {
  return WINDOWS.includes(value as WindowId)
}

// Deep links land here from the "Bests de la séance" table, which points at a
// specific distance: /metrics?metric=time_5000
const queryMetric = route.query.metric
const queryGranularity = route.query.granularity

const selectedMetricId = ref(
  typeof queryMetric === 'string' && hasMetric(queryMetric) ? queryMetric : 'pace'
)
const selectedGranularity = ref<Granularity>(
  isGranularity(queryGranularity) ? queryGranularity : 'activity'
)
const selectedSport = ref(typeof route.query.sport === 'string' ? route.query.sport : '')

// A hand-edited or stale link can pair a window with a granularity that cannot
// carry it, and the watcher below only fires on later changes
const linkedWindow = isWindow(route.query.window) ? route.query.window : 'all'
const selectedWindow = ref<WindowId>(
  availableWindows(selectedGranularity.value).includes(linkedWindow) ? linkedWindow : 'all'
)

const metric = computed(() => getMetric(selectedMetricId.value))

function metricLabel(definition: MetricDefinition): string {
  return definition.distanceLabel
    ? t('metricTracker.timeOn', { distance: definition.distanceLabel })
    : t(`metricTracker.metrics.${definition.id}`)
}

const granularityOptions = computed(() =>
  GRANULARITIES.map(value => ({ value, label: t(`metricTracker.granularities.${value}`) }))
)

const openWindows = computed(() => availableWindows(selectedGranularity.value))

const windowOptions = computed(() =>
  openWindows.value.map(value => ({ value, label: t(`metricTracker.windows.${value}`) }))
)

const sportChoices = computed(() => [
  { value: '', label: t('metricTracker.allSports') },
  ...sportOptions.value
])

const filteredActivities = computed(() => {
  const range = windowRange(selectedWindow.value)
  return activities.value.filter(
    a =>
      (!selectedSport.value || a.type?.toLowerCase() === selectedSport.value) &&
      inRange(a.startTime, range)
  )
})

// A coarser granularity can drop the current window — fall back to the widest
// rather than silently plotting one lone point
watch(openWindows, windows => {
  if (!windows.includes(selectedWindow.value)) selectedWindow.value = 'all'
})

const sources = computed(() => ({ stats: stats.value, derived: derived.value }))

// Buckets holding no usable value are kept so the chart shows a gap where the
// data is missing, instead of stitching distant points together
const points = computed(() => {
  if (statsLoading.value || indexing.value) return []
  return buildSeries(
    filteredActivities.value,
    sources.value,
    metric.value,
    selectedGranularity.value
  )
})

const labels = computed(() =>
  points.value.map(p =>
    selectedGranularity.value === 'activity' ? new Date(p.startTime).toLocaleDateString() : p.key
  )
)

const summary = computed(() => summarize(points.value, metric.value))

// Details and index are only built when the selected metric actually needs
// them. Immediate, because the activities may already be loaded from a
// previous visit — in which case the watcher would never fire on its own.
watch(
  [metric, activities],
  ([m, acts]) => {
    if (needsDetails(m)) ensureStats()
    if (needsIndex(m) && acts.length > 0) ensureIndex(acts)
  },
  { immediate: true }
)

// Keep the URL in step with the selection, so a view can be shared or reloaded
watch(
  [selectedMetricId, selectedGranularity, selectedSport, selectedWindow],
  ([metricId, granularity, sport, window]) => {
    router.replace({
      query: {
        ...route.query,
        metric: metricId,
        granularity,
        sport: sport || undefined,
        window: window === 'all' ? undefined : window
      }
    })
  }
)
</script>

<style scoped>
.tracker-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 1.5rem 1rem;
}

.tracker-title {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-color);
  margin: 0 0 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tracker-title i {
  color: var(--color-green-500);
}

.tracker-state {
  text-align: center;
  padding: 2.5rem 1rem;
  color: var(--text-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.tracker-state.empty i {
  font-size: 2.5rem;
  color: var(--color-green-300);
  margin-bottom: 0.5rem;
}

.tracker-state p {
  margin: 0;
}

.tracker-state .hint {
  font-size: 0.85rem;
  opacity: 0.7;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 1.2rem;
  margin-bottom: 1.5rem;
}

.control {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.control-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-color);
  opacity: 0.65;
}

.metric-select {
  padding: 0.4rem 0.7rem;
  border-radius: 8px;
  border: 1px solid var(--color-green-200);
  background: var(--bg-color);
  color: var(--text-color);
  font-family: var(--font-main);
  font-size: 0.9rem;
  cursor: pointer;
}

.metric-select:focus-visible {
  outline: 2px solid var(--color-green-500);
  outline-offset: 1px;
}

.tracker-state.indexing {
  width: 100%;
  gap: 0.3rem;
}

.progress-bar {
  width: 100%;
  max-width: 320px;
  height: 6px;
  background: var(--color-green-100);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 0.4rem;
}

.progress-fill {
  height: 100%;
  background: var(--color-green-500);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.chart-card {
  background: var(--bg-color);
  border: 1px solid var(--color-green-200);
  border-radius: 12px;
  padding: 1.2rem 1.4rem;
}

.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 1.8rem;
  margin-bottom: 1.2rem;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.summary-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-color);
  opacity: 0.65;
}

.summary-value {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--color-green-600);
}

@media (max-width: 640px) {
  .controls {
    gap: 1rem;
  }

  .summary {
    gap: 1.2rem;
  }
}
</style>
