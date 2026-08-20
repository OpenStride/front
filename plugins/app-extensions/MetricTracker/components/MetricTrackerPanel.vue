<template>
  <div class="tracker-panel">
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
      <!-- Primary question — what am I looking at. Given the prominence the rest
           of the controls used to compete with. -->
      <div class="mt-primary">
        <label class="primary-label" for="metric-select">{{ t('metricTracker.metric') }}</label>
        <select
          id="metric-select"
          v-model="selectedMetricId"
          class="metric-select"
          data-test="metric-select"
        >
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
          <!-- Nothing to show until the reader has defined one, so the group
               stays out rather than sitting there empty. -->
          <optgroup v-if="customMetrics.length" :label="t('metricTracker.groups.custom')">
            <option v-for="m in customMetrics" :key="m.id" :value="m.id">
              {{ metricLabel(m) }}
            </option>
          </optgroup>
        </select>
      </div>

      <!-- Secondary — how to slice it. Demoted onto a recessed bar so it reads
           as an adjustment of the metric above, not as a rival to it. -->
      <div class="mt-secondary">
        <div class="control">
          <span class="control-label">{{ t('metricTracker.granularity') }}</span>
          <ChipSelect
            v-model="selectedGranularity"
            :options="granularityOptions"
            :group-label="t('metricTracker.granularity')"
            test-prefix="granularity"
          />
        </div>

        <div class="control">
          <span class="control-label">{{ t('metricTracker.window') }}</span>
          <ChipSelect
            v-model="selectedWindow"
            :options="windowOptions"
            :group-label="t('metricTracker.window')"
            test-prefix="window"
          />
        </div>

        <div v-if="!hostOwnsSport && sportOptions.length > 1" class="control">
          <span class="control-label">{{ t('metricTracker.sport') }}</span>
          <ChipSelect
            v-model="ownSport"
            :options="sportChoices"
            :group-label="t('metricTracker.sport')"
            test-prefix="sport"
          />
        </div>
      </div>

      <section class="chart-area">
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
            <div class="mini best">
              <span class="mini-label">{{ t('metricTracker.summary.best') }}</span>
              <span class="mini-value">{{ metric.format(summary.best) }}</span>
            </div>
            <div class="mini">
              <span class="mini-label">{{ t('metricTracker.summary.average') }}</span>
              <span class="mini-value">{{ metric.format(summary.average) }}</span>
            </div>
            <div class="mini">
              <span class="mini-label">{{ t('metricTracker.summary.points') }}</span>
              <span class="mini-value">{{ summary.count }}</span>
            </div>
          </div>

          <!-- The chart changes its mark with the granularity and can flip its
               axis for a metric where lower is better. Say which, so the reader
               is not left to infer the language from the shape. -->
          <p class="chart-caption">
            <span class="legend">
              <span class="legend-dot" aria-hidden="true"></span>
              {{ chartMode }}
            </span>
            <span v-if="metric.betterIsLower" class="hint-pill">
              {{ t('metricTracker.chart.lowerBetter') }}
            </span>
          </p>

          <MetricSeriesChart
            :points="points"
            :labels="labels"
            :metric="metric"
            :granularity="selectedGranularity"
          />
        </template>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMetricActivities } from '../composables/useMetricActivities'
import { useActivityMetricsIndex } from '@/composables/useActivityMetricsIndex'
import { buildSeries, summarize } from '../series'
import { DIRECT_METRICS, DERIVED_METRICS, METRICS, hasMetric } from '../metrics'
import { toMetricDefinitions } from '../customMetrics'
import { usePluginContext } from '@/composables/usePluginContext'
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
import { formatDate } from '@/utils/dateFormat'
import ChipSelect from './ChipSelect.vue'
import MetricSeriesChart from './MetricSeriesChart.vue'

const props = defineProps<{
  /**
   * Set by a host that owns the sport filter — the statistics page does. The
   * panel then follows it and hides its own chips, so one page never shows two
   * sport selectors disagreeing with each other.
   */
  sport?: string
  /** Only the standalone route reads and writes the query string */
  syncUrl?: boolean
}>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const ctx = usePluginContext()

const hostOwnsSport = computed(() => props.sport !== undefined)

/** Query parameters are the standalone route's business, not a section's */
function linkParam(name: string): unknown {
  return props.syncUrl ? route.query[name] : undefined
}

const { activities, stats, sportOptions, loading, statsLoading, ensureStats } =
  useMetricActivities()
const { derived, indexing, progress, ensureIndex } = useActivityMetricsIndex()

/**
 * The aggregates the reader defined, as plottable metrics.
 *
 * They arrive as two more `derived.*` keys, so neither the series builder nor
 * the chart had to learn anything about them.
 */
const customMetrics = ref<MetricDefinition[]>([])

async function loadCustomMetrics() {
  customMetrics.value = toMetricDefinitions(await ctx.aggregates.list())
}

const allMetrics = computed(() => [...METRICS, ...customMetrics.value])

function isGranularity(value: unknown): value is Granularity {
  return GRANULARITIES.includes(value as Granularity)
}

function isWindow(value: unknown): value is WindowId {
  return WINDOWS.includes(value as WindowId)
}

// Deep links land here from the "Bests de la séance" table, which points at a
// specific distance: /metrics?metric=time_5000
const queryMetric = linkParam('metric')
const queryGranularity = linkParam('granularity')

// A custom aggregate's id passes through unchecked: the definitions load after
// this runs, so `hasMetric` cannot know about them yet. `metric` falls back to
// the default if the id turns out to name nothing.
const selectedMetricId = ref(
  typeof queryMetric === 'string' && (hasMetric(queryMetric) || queryMetric.includes('-'))
    ? queryMetric
    : 'pace'
)
const selectedGranularity = ref<Granularity>(
  isGranularity(queryGranularity) ? queryGranularity : 'activity'
)
const ownSport = ref(typeof linkParam('sport') === 'string' ? (linkParam('sport') as string) : '')
const selectedSport = computed(() => (hostOwnsSport.value ? props.sport! : ownSport.value))

// A hand-edited or stale link can pair a window with a granularity that cannot
// carry it, and the watcher below only fires on later changes
const linkedWindow = isWindow(linkParam('window')) ? (linkParam('window') as WindowId) : 'all'
const selectedWindow = ref<WindowId>(
  availableWindows(selectedGranularity.value).includes(linkedWindow) ? linkedWindow : 'all'
)

// Falls back to the first built-in rather than to nothing: a deep link may name
// an aggregate that has since been deleted, and an empty chart with no
// explanation reads worse than the default metric.
const metric = computed(
  () => allMetrics.value.find(m => m.id === selectedMetricId.value) ?? METRICS[0]
)

function metricLabel(definition: MetricDefinition): string {
  if (definition.label) return definition.label
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
    selectedGranularity.value === 'activity' ? formatDate(p.startTime) : p.key
  )
)

const summary = computed(() => summarize(points.value, metric.value))

// The chart draws one point per activity at the finest granularity, and an
// aggregated curve otherwise — the caption names whichever is on screen.
const chartMode = computed(() =>
  selectedGranularity.value === 'activity'
    ? t('metricTracker.chart.perActivity')
    : t('metricTracker.chart.aggregated')
)

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

let unsubscribeAggregates: (() => void) | null = null

onMounted(async () => {
  await loadCustomMetrics()
  // A definition saved on the dashboard, or arriving from another device,
  // should appear in this list without a reload.
  unsubscribeAggregates = ctx.aggregates.onChanged(() => {
    void loadCustomMetrics()
  })
})

onUnmounted(() => {
  unsubscribeAggregates?.()
  unsubscribeAggregates = null
})

// Keep the URL in step with the selection, so a view can be shared or reloaded.
// A section embedded in another page has no business rewriting that page's query.
watch(
  [selectedMetricId, selectedGranularity, ownSport, selectedWindow],
  ([metricId, granularity, sport, window]) => {
    if (!props.syncUrl) return
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
.tracker-panel {
  display: flex;
  flex-direction: column;
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

/* Primary tier — the metric, given room and weight of its own. */
.mt-primary {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.9rem;
}

.primary-label {
  font-family: var(--font-condensed);
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-faint);
}

.metric-select {
  padding: 0.5rem 0.9rem;
  border-radius: var(--radius-pill);
  border: 1.5px solid var(--color-green-500);
  background: var(--surface);
  color: var(--text-color);
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: var(--shadow-card);
}

.metric-select:focus-visible {
  outline: 2px solid var(--color-green-500);
  outline-offset: 1px;
}

/* Secondary tier — how to slice it, on a recessed bar. */
.mt-secondary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.2rem;
  padding: 0.6rem 0.8rem;
  margin-bottom: 1.2rem;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.control-label {
  font-family: var(--font-condensed);
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-faint);
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

/* Deliberately bare: the card around the panel belongs to whoever hosts it,
   so an embedded panel never draws a second card inside its host's one. */
.chart-area {
  display: flex;
  flex-direction: column;
}

/* The three figures as real bordered tiles, the best one picked out — not the
   flat green columns that floated between the controls and the chart. */
.summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.7rem;
  margin-bottom: 1rem;
}

.mini {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.6rem 0.8rem;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.mini.best {
  background: var(--color-green-50);
  border-color: var(--color-green-200);
}

.mini-label {
  font-family: var(--font-condensed);
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-faint);
}

.mini-value {
  font-family: var(--font-mono);
  font-size: 1.3rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-color);
}

.mini.best .mini-value {
  color: var(--color-green-600);
}

.chart-caption {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.8rem;
  margin: 0 0 0.6rem;
  font-size: 0.78rem;
  color: var(--text-faint);
}

.legend {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.legend-dot {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 50%;
  background: var(--color-green-500);
}

.hint-pill {
  padding: 0.1rem 0.6rem;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  color: var(--text-color);
  opacity: 0.85;
}

@media (max-width: 640px) {
  /* Mobile is the main surface. Stack the slice controls and let each chip
     group scroll sideways instead of wrapping into a tall block; give the
     native metric picker the full width for an easy tap. */
  .mt-primary {
    gap: 0.5rem;
  }

  .metric-select {
    width: 100%;
  }

  .mt-secondary {
    flex-direction: column;
    /* `nowrap` matters as much as the direction: the base rule wraps, and a
       wrapping column container sizes its line on the widest control rather
       than on the bar, so each row stretched to its own content width and hung
       off the side of the card instead of stretching to it. */
    flex-wrap: nowrap;
    align-items: stretch;
    gap: 0.6rem;
  }

  /* The label goes above its chips rather than beside them. Holding a 5rem
     label column left barely 240px for the chips, and the sideways scroll that
     compensated cut the last chip through the middle of its word — a phone
     reader could not see that "Mo…" was "Month", nor that anything followed
     it. Stacked, the chips get the full width and simply wrap. */
  .control {
    flex-direction: column;
    align-items: stretch;
    gap: 0.35rem;
    min-width: 0;
  }

  .control :deep(.chip-select) {
    flex-wrap: wrap;
  }

  /* A chip breaking into two lines read as two chips. */
  .control :deep(.chip) {
    white-space: nowrap;
    min-height: 2.25rem;
  }

  /* Three short figures stay on one line rather than three stacked rows —
     which only holds if a figure never wraps inside its tile. Below roughly
     360px three tiles cannot hold a pace without breaking it, so the row
     becomes two and the third figure drops under them. */
  .summary {
    grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr));
    gap: 0.5rem;
  }

  .mini {
    padding: 0.5rem 0.6rem;
  }

  .mini-value {
    font-size: 1.05rem;
    white-space: nowrap;
  }
}
</style>
