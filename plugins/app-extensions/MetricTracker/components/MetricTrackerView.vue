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
            <option v-for="metric in METRICS" :key="metric.id" :value="metric.id">
              {{ t(`metricTracker.metrics.${metric.id}`) }}
            </option>
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
        <div v-if="statsLoading" class="tracker-state">
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
import { useI18n } from 'vue-i18n'
import { useMetricActivities } from '../composables/useMetricActivities'
import { buildSeries, summarize } from '../series'
import { METRICS, getMetric } from '../metrics'
import { GRANULARITIES, needsDetails, type Granularity } from '../types'
import ChipSelect from './ChipSelect.vue'
import MetricSeriesChart from './MetricSeriesChart.vue'

const { t } = useI18n()

const { activities, stats, sportOptions, loading, statsLoading, ensureStats } =
  useMetricActivities()

const selectedMetricId = ref('pace')
const selectedGranularity = ref<Granularity>('activity')
const selectedSport = ref('')

const metric = computed(() => getMetric(selectedMetricId.value))

const granularityOptions = computed(() =>
  GRANULARITIES.map(value => ({ value, label: t(`metricTracker.granularities.${value}`) }))
)

const sportChoices = computed(() => [
  { value: '', label: t('metricTracker.allSports') },
  ...sportOptions.value
])

const filteredActivities = computed(() => {
  if (!selectedSport.value) return activities.value
  return activities.value.filter(a => a.type?.toLowerCase() === selectedSport.value)
})

// Buckets holding no usable value are kept so the chart shows a gap where the
// data is missing, instead of stitching distant points together
const points = computed(() => {
  if (statsLoading.value) return []
  return buildSeries(filteredActivities.value, stats.value, metric.value, selectedGranularity.value)
})

const labels = computed(() =>
  points.value.map(p =>
    selectedGranularity.value === 'activity' ? new Date(p.startTime).toLocaleDateString() : p.key
  )
)

const summary = computed(() => summarize(points.value, metric.value))

// Details are only read when a metric actually needs them
watch(
  metric,
  m => {
    if (needsDetails(m)) ensureStats()
  },
  { immediate: true }
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
