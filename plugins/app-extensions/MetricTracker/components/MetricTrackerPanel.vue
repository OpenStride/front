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
      <!-- What am I looking at: the metric, and for which sport. -->
      <div class="mt-primary">
        <label class="field">
          <span class="field-label">{{ t('metricTracker.metric') }}</span>
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
            <!-- Nothing to show until the reader has defined one, so the group
                 stays out rather than sitting there empty. -->
            <optgroup v-if="customMetrics.length" :label="t('metricTracker.groups.custom')">
              <option v-for="m in customMetrics" :key="m.id" :value="m.id">
                {{ metricLabel(m) }}
              </option>
            </optgroup>
          </select>
        </label>

        <label v-if="!hostOwnsSport && sportChoices.length > 1" class="field">
          <span class="field-label">{{ t('metricTracker.sport') }}</span>
          <select v-model="sportModel" class="sport-select" data-test="sport-select">
            <option v-for="s in sportChoices" :key="s.value" :value="s.value">
              {{ s.label }}
            </option>
          </select>
        </label>

        <!-- Pace in one pair against the other: only once there is more than one
             to compare for this sport. -->
        <label v-if="gearChoices.length > 1" class="field">
          <span class="field-label">{{ t('metricTracker.gear') }}</span>
          <select v-model="selectedGear" class="sport-select" data-test="gear-select">
            <option value="">{{ t('metricTracker.allGear') }}</option>
            <option v-for="g in gearChoices" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
        </label>
      </div>

      <!-- Over what span: one row, the grain follows it. -->
      <ChipSelect
        v-model="selectedWindow"
        :options="windowOptions"
        :group-label="t('metricTracker.window')"
        test-prefix="window"
      />

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

        <div v-else-if="!answer" class="tracker-state empty">
          <p>{{ t('metricTracker.noPoints') }}</p>
          <p class="hint">{{ t('metricTracker.noPointsHint') }}</p>
        </div>

        <template v-else>
          <!-- The answer first; the tiles and the chart are its evidence. -->
          <div class="answer" data-test="tracker-answer">
            <span class="answer-value">{{ answer.value }}</span>
            <span class="answer-text">
              {{ answer.text }}
              <RouterLink v-if="answer.link" :to="answer.link" class="answer-link">
                {{ t('metricTracker.answer.open') }}
              </RouterLink>
            </span>
          </div>

          <div class="summary">
            <div v-for="tile in tiles" :key="tile.label" class="mini">
              <span class="mini-label">{{ tile.label }}</span>
              <span class="mini-value">{{ tile.value }}</span>
              <span class="mini-foot">{{ tile.foot }}</span>
            </div>
          </div>

          <div class="chart-head">
            <span class="chart-title">{{ chartTitle }}</span>
            <div class="toggles">
              <ChipSelect
                v-if="kind === 'intensity'"
                v-model="mode"
                :options="modeOptions"
                :group-label="t('metricTracker.modeLabel')"
                test-prefix="mode"
              />
              <ChipSelect
                v-if="kind !== 'best'"
                v-model="grainModel"
                :options="grainOptions"
                :group-label="t('metricTracker.granularity')"
                test-prefix="grain"
              />
            </div>
          </div>

          <TrackerChart
            :kind="kind"
            :metric="metric"
            :periods="periods"
            :outings="windowOutings"
            :records="records"
            :grain="grain"
            :mode="mode"
            :average="average"
            :label="chartTitle"
          />

          <ul class="legend">
            <li v-for="item in legend" :key="item.label">
              <span :class="['swatch', item.kind]" aria-hidden="true"></span>
              {{ item.label }}
            </li>
          </ul>
        </template>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { matchesSportScope } from '@/types/sport'
import type { Gear } from '@/types/gear'
import { resolveGear } from '@/utils/gear'
import { useMetricActivities } from '../composables/useMetricActivities'
import { useActivityMetricsIndex } from '@/composables/useActivityMetricsIndex'
import { DIRECT_METRICS, DERIVED_METRICS, METRICS, hasMetric } from '../metrics'
import { toMetricDefinitions } from '../customMetrics'
import { usePluginContext } from '@/composables/usePluginContext'
import { formatDate } from '@/utils/dateFormat'
import { WINDOWS, needsDetails, needsIndex, type MetricDefinition, type WindowId } from '../types'
import {
  beats,
  bestOuting,
  defaultGrain,
  mainSport,
  metricKind,
  outingsOf,
  periodSeries,
  recordSteps,
  type Grain,
  type Period,
  type PointMode
} from '../trackerData'
import ChipSelect from './ChipSelect.vue'
import TrackerChart from './TrackerChart.vue'

const props = defineProps<{
  /**
   * Set by a host that owns the sport filter. The panel then follows it and
   * hides its own selector, so one page never shows two sport selectors
   * disagreeing with each other.
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
function linkParam(name: string): string | undefined {
  const v = props.syncUrl ? route.query[name] : undefined
  return typeof v === 'string' ? v : undefined
}

const { activities, stats, sportOptions, loading, statsLoading, ensureStats } =
  useMetricActivities()
const { derived, indexing, progress, ensureIndex } = useActivityMetricsIndex()

/** The aggregates the reader defined, as plottable metrics. */
const customMetrics = ref<MetricDefinition[]>([])

async function loadCustomMetrics() {
  customMetrics.value = toMetricDefinitions(await ctx.aggregates.list())
}

const allMetrics = computed(() => [...METRICS, ...customMetrics.value])

// Deep links land here from the dashboard and from the session bests, which
// name a metric and a sport: /metrics?metric=time_5000&sport=running
const queryMetric = linkParam('metric')
// A custom aggregate's id passes through unchecked: the definitions load after
// this runs, so `hasMetric` cannot know about them yet.
const selectedMetricId = ref(
  queryMetric && (hasMetric(queryMetric) || queryMetric.includes('-')) ? queryMetric : 'pace'
)

// Falls back to the first built-in rather than to nothing: a link may name an
// aggregate that has since been deleted.
const metric = computed(
  () => allMetrics.value.find(m => m.id === selectedMetricId.value) ?? METRICS[0]
)
const kind = computed(() => metricKind(metric.value))

function metricLabel(definition: MetricDefinition): string {
  if (definition.label) return definition.label
  return definition.distanceLabel
    ? t('metricTracker.timeOn', { distance: definition.distanceLabel })
    : t(`metricTracker.metrics.${definition.id}`)
}

const linkedWindow = linkParam('window')
const selectedWindow = ref<WindowId>(
  WINDOWS.includes(linkedWindow as WindowId) ? (linkedWindow as WindowId) : '6m'
)
const windowOptions = computed(() =>
  (['3m', '6m', '12m', 'all'] as WindowId[]).map(value => ({
    value,
    label: t(`metricTracker.windows.${value}`)
  }))
)

/**
 * Weeks or months: the window picks, the reader may override. A best time is
 * read by month: a week rarely holds a race-pace effort.
 */
const linkedGrain = linkParam('grain')
const grainOverride = ref<Grain | null>(
  linkedGrain === 'week' || linkedGrain === 'month' ? linkedGrain : null
)
watch(selectedWindow, () => (grainOverride.value = null))
const grain = computed<Grain>(() =>
  kind.value === 'best' ? 'month' : (grainOverride.value ?? defaultGrain(selectedWindow.value))
)
const grainModel = computed<Grain>({
  get: () => grain.value,
  set: v => (grainOverride.value = v)
})
const grainOptions = computed(() =>
  (['week', 'month'] as Grain[]).map(value => ({
    value,
    label: t(`metricTracker.grains.${value}`)
  }))
)

/** Average of the period or its best outing: a point says which it is. */
const mode = ref<PointMode>(linkParam('mode') === 'best' ? 'best' : 'avg')

/** Pace and speed have a better side; a heart rate only a higher one. */
const hasBetter = computed(
  () => metric.value.betterIsLower || metric.value.id === 'speed' || metric.value.id === 'pace'
)
const modeOptions = computed(() => [
  { value: 'avg' as PointMode, label: t(`metricTracker.modes.avg.${grain.value}`) },
  {
    value: 'best' as PointMode,
    label: t(`metricTracker.modes.${hasBetter.value ? 'best' : 'max'}.${grain.value}`)
  }
])

const ownSport = ref(linkParam('sport') ?? '')

/**
 * "All sports" only for a volume: a total of time or distance adds up across
 * sports, a pace or a best time does not — a ride is no 5 km record.
 */
const sportChoices = computed(() =>
  kind.value === 'volume'
    ? [{ value: '', label: t('metricTracker.allSports') }, ...sportOptions.value]
    : sportOptions.value
)
const selectedSport = computed(() => {
  const chosen = hostOwnsSport.value ? props.sport! : ownSport.value
  return chosen || kind.value === 'volume' ? chosen : mainSport(activities.value)
})
const sportModel = computed({
  get: () => selectedSport.value,
  set: v => (ownSport.value = v)
})

const sportActivities = computed(() =>
  selectedSport.value
    ? activities.value.filter(a => matchesSportScope(selectedSport.value, a.type))
    : activities.value
)

// ── Gear ────────────────────────────────────────────────────────────────────
const gear = ref<Gear[]>([])
let unsubscribeGear: (() => void) | null = null
async function loadGear() {
  gear.value = (await ctx.gear?.list()) ?? []
}
onMounted(() => {
  loadGear()
  unsubscribeGear = ctx.gear?.onChanged(loadGear) ?? null
})
onUnmounted(() => unsubscribeGear?.())

const selectedGear = ref(linkParam('gear') ?? '')

/** What each outing of the sport wore, resolved once for the list and the filter. */
const gearByActivity = computed(() => {
  const map = new Map<string, Gear[]>()
  if (!gear.value.length) return map
  for (const a of sportActivities.value) map.set(a.id, resolveGear(a, gear.value))
  return map
})

/** The gear this sport's outings actually wore. */
const gearChoices = computed(() => {
  const worn = new Map<string, Gear>()
  for (const list of gearByActivity.value.values()) for (const g of list) worn.set(g.id, g)
  return [...worn.values()].sort((a, b) => b.activeFrom - a.activeFrom)
})

// A gear the new sport never wore would leave an empty chart behind it.
watch(gearChoices, choices => {
  if (selectedGear.value && !choices.some(g => g.id === selectedGear.value)) {
    selectedGear.value = ''
  }
})

const trackedActivities = computed(() =>
  selectedGear.value
    ? sportActivities.value.filter(a =>
        gearByActivity.value.get(a.id)?.some(g => g.id === selectedGear.value)
      )
    : sportActivities.value
)

const sources = computed(() => ({ stats: stats.value, derived: derived.value }))
const ready = computed(() => !statsLoading.value && !indexing.value)

const periods = computed<Period[]>(() =>
  ready.value
    ? periodSeries(trackedActivities.value, sources.value, metric.value, {
        grain: grain.value,
        window: selectedWindow.value,
        mode: kind.value === 'best' ? 'best' : mode.value
      })
    : []
)

const allOutings = computed(() =>
  ready.value ? outingsOf(trackedActivities.value, sources.value, metric.value) : []
)
const windowFrom = computed(() => periods.value[0]?.start.getTime() ?? Infinity)
const windowOutings = computed(() => allOutings.value.filter(o => o.startTime >= windowFrom.value))

/** For a best time, the record as it stood before the window opened. */
const records = computed(() => {
  if (kind.value !== 'best') return []
  const before = bestOuting(
    allOutings.value.filter(o => o.startTime < windowFrom.value),
    metric.value
  )
  return recordSteps(periods.value, metric.value, before?.value ?? null)
})

const complete = computed(() => periods.value.filter(p => !p.isCurrent))
const valued = computed(() => periods.value.filter(p => p.value !== null && p.count > 0))

/** Mean of the complete periods: the one under way would pull it down. */
const average = computed(() => {
  if (kind.value !== 'volume' || complete.value.length === 0) return null
  return complete.value.reduce((s, p) => s + (p.value ?? 0), 0) / complete.value.length
})

const fmt = (v: number) => metric.value.format(v)
const dateOf = (ms: number) => formatDate(ms, { day: 'numeric', month: 'short', year: 'numeric' })

function periodName(p: Period): string {
  return grain.value === 'month'
    ? formatDate(p.start.getTime(), { month: 'long', year: 'numeric' })
    : t('metricTracker.weekOf', {
        date: formatDate(p.start.getTime(), { day: 'numeric', month: 'short' })
      })
}

const windowName = computed(() => t(`metricTracker.windowNames.${selectedWindow.value}`))

/**
 * The change from the first period to the last, in words: faster or slower
 * for a pace or a speed, a signed figure for anything else.
 */
function change(first: number, last: number): string {
  const diff = last - first
  // Below the precision the figure is shown at, there is no change to tell.
  const nothing =
    metric.value.id === 'pace'
      ? Math.round(Math.abs(diff) * 60) === 0
      : fmt(Math.abs(diff)) === fmt(0)
  if (nothing) return t('metricTracker.answer.steady')
  if (!hasBetter.value) {
    const sign = diff > 0 ? '+' : diff < 0 ? '−' : ''
    return t('metricTracker.answer.changed', { value: `${sign}${fmt(Math.abs(diff))}` })
  }
  const better = beats(metric.value, last, first)
  const amount =
    metric.value.id === 'pace' ? `${Math.round(Math.abs(diff) * 60)} s` : fmt(Math.abs(diff))
  const moving = metric.value.id === 'pace' || metric.value.id === 'speed'
  const word = moving ? (better ? 'faster' : 'slower') : better ? 'better' : 'worse'
  return t(`metricTracker.answer.${word}`, { value: amount })
}

const answer = computed(() => {
  if (valued.value.length === 0) return null
  if (kind.value === 'volume') {
    if (average.value === null) return null
    return {
      value: `${fmt(average.value)} / ${t(`metricTracker.per.${grain.value}`)}`,
      text: t(`metricTracker.answer.volume.${grain.value}`, { window: windowName.value })
    }
  }
  if (kind.value === 'best') {
    const record = bestOuting(allOutings.value, metric.value)
    if (!record) return null
    return {
      value: fmt(record.value),
      text: t('metricTracker.answer.record', { date: dateOf(record.startTime) }),
      link: `/activity-details/${record.id}`
    }
  }
  // Intensity: the last complete period with a value, else the one under way.
  const done = valued.value.filter(p => !p.isCurrent)
  const last = done[done.length - 1] ?? valued.value[valued.value.length - 1]
  const first = valued.value[0]
  const what =
    mode.value === 'best'
      ? t(`metricTracker.answer.${hasBetter.value ? 'bestOf' : 'maxOf'}`, {
          period: periodName(last)
        })
      : t('metricTracker.answer.avgOf', { period: periodName(last) })
  return {
    value: fmt(last.value as number),
    text: first === last ? what : `${what} · ${change(first.value as number, last.value as number)}`
  }
})

const tiles = computed(() => {
  const g = grain.value
  if (kind.value === 'volume') {
    const best = complete.value.reduce<Period | null>(
      (b, p) => ((p.value ?? 0) > (b?.value ?? 0) ? p : b),
      null
    )
    const total = periods.value.reduce((s, p) => s + (p.value ?? 0), 0)
    const empty = complete.value.filter(p => p.count === 0).length
    return [
      {
        label: t(`metricTracker.tiles.busiest.${g}`),
        value: best ? fmt(best.value as number) : '—',
        foot: best ? periodName(best) : ''
      },
      {
        label: t('metricTracker.tiles.total'),
        value: fmt(total),
        foot: t(`metricTracker.tiles.periods.${g}`, { n: periods.value.length })
      },
      {
        label: t(`metricTracker.tiles.empty.${g}`),
        value: String(empty),
        foot: t('metricTracker.tiles.outOf', { n: complete.value.length })
      }
    ]
  }
  if (kind.value === 'best') {
    const record = bestOuting(allOutings.value, metric.value)
    const recent = bestOuting(
      allOutings.value.filter(o => o.startTime >= Date.now() - 91 * 86_400_000),
      metric.value
    )
    const first = valued.value[0]
    const broken = records.value.filter(r => r.isNew).length
    return [
      {
        label: t('metricTracker.tiles.recent'),
        value: recent ? fmt(recent.value) : '—',
        foot:
          !recent || !record
            ? t('metricTracker.tiles.noRecent')
            : recent.id === record.id
              ? t('metricTracker.tiles.isRecord')
              : t('metricTracker.tiles.offRecord', {
                  value: fmt(Math.abs(recent.value - record.value))
                })
      },
      {
        label: t('metricTracker.tiles.atStart'),
        value: first ? fmt(first.value as number) : '—',
        foot: first ? periodName(first) : ''
      },
      {
        label: t('metricTracker.tiles.broken'),
        value: String(broken),
        foot: t('metricTracker.tiles.brokenFoot')
      }
    ]
  }
  const first = valued.value[0]
  const bestPeriod = valued.value.reduce<Period | null>(
    (b, p) => (!b || beats(metric.value, p.value as number, b.value as number) ? p : b),
    null
  )
  const topOuting = bestOuting(windowOutings.value, metric.value)
  const bestTile =
    mode.value === 'best'
      ? {
          label: t(`metricTracker.tiles.${hasBetter.value ? 'bestOuting' : 'maxOuting'}`),
          value: topOuting ? fmt(topOuting.value) : '—',
          foot: topOuting ? dateOf(topOuting.startTime) : ''
        }
      : {
          label: t(`metricTracker.tiles.${hasBetter.value ? 'bestAverage' : 'maxAverage'}.${g}`),
          value: bestPeriod ? fmt(bestPeriod.value as number) : '—',
          foot: bestPeriod ? periodName(bestPeriod) : ''
        }
  return [
    bestTile,
    {
      label: t('metricTracker.tiles.atStart'),
      value: first ? fmt(first.value as number) : '—',
      foot: first ? periodName(first) : ''
    },
    {
      label: t('metricTracker.tiles.outings'),
      value: String(windowOutings.value.length),
      foot: t('metricTracker.tiles.outingsFoot')
    }
  ]
})

const chartTitle = computed(() => {
  const name = metricLabel(metric.value)
  if (kind.value === 'best') return t('metricTracker.chartTitle.best', { metric: name })
  if (kind.value === 'volume')
    return t(`metricTracker.chartTitle.volume.${grain.value}`, { metric: name })
  const key = mode.value === 'best' ? (hasBetter.value ? 'bestOuting' : 'max') : 'avg'
  return t(`metricTracker.chartTitle.${key}.${grain.value}`, { metric: name })
})

const legend = computed(() => {
  if (kind.value === 'volume') {
    return [
      { kind: 'bar', label: t(`metricTracker.legend.bar.${grain.value}`) },
      { kind: 'bar-best', label: t(`metricTracker.legend.busiest.${grain.value}`) },
      { kind: 'hatched', label: t(`metricTracker.legend.current.${grain.value}`) },
      { kind: 'dashed', label: t('metricTracker.legend.average') }
    ]
  }
  if (kind.value === 'best') {
    return [
      { kind: 'step', label: t('metricTracker.legend.record') },
      { kind: 'dot-dark', label: t('metricTracker.legend.newRecord') },
      { kind: 'dot', label: t('metricTracker.legend.monthBest') }
    ]
  }
  const key = mode.value === 'best' ? (hasBetter.value ? 'best' : 'max') : 'avg'
  return [
    { kind: 'line', label: t(`metricTracker.legend.${key}.${grain.value}`) },
    { kind: 'dot-pale', label: t('metricTracker.legend.outing') }
  ]
})

// Details and index are only built when the selected metric actually needs
// them. Immediate, because the activities may already be loaded.
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
watch(
  [selectedMetricId, ownSport, selectedWindow, grainOverride, mode, selectedGear],
  ([metricId, sport, window, g, m, gearId]) => {
    if (!props.syncUrl) return
    router.replace({
      query: {
        ...route.query,
        metric: metricId,
        sport: sport || undefined,
        window: window === '6m' ? undefined : window,
        grain: g ?? undefined,
        mode: m === 'best' ? m : undefined,
        gear: gearId || undefined,
        granularity: undefined
      }
    })
  }
)
</script>

<style scoped>
.tracker-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
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

.tracker-state.indexing {
  width: 100%;
  gap: 0.3rem;
}

.progress-bar {
  width: 100%;
  max-width: 320px;
  height: 6px;
  background: var(--color-green-100);
  border-radius: var(--radius-sm);
  overflow: hidden;
  margin-bottom: 0.4rem;
}

.progress-fill {
  height: 100%;
  background: var(--color-green-500);
  transition: width 0.3s ease;
}

/* The metric and the sport, side by side; the metric is the larger. */
.mt-primary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.field-label {
  font-size: 0.8rem;
  color: var(--text-faint);
}

.metric-select,
.sport-select {
  min-height: 2.75rem;
  padding: 0 0.8rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-green-200);
  background: var(--surface);
  color: var(--text-color);
  font-family: var(--font-main);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}

.metric-select {
  min-width: 14rem;
  border-color: var(--color-green-500);
}

.metric-select:focus-visible,
.sport-select:focus-visible {
  outline: 2px solid var(--color-green-500);
  outline-offset: 1px;
}

.chart-area {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* The answer to the question the metric asks, before any chart. */
.answer {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.answer-value {
  font-family: var(--font-mono);
  font-size: 2.2rem;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--color-green-700);
}

.answer-text {
  font-size: 0.95rem;
  color: var(--color-ink-soft);
}

.answer-link {
  margin-left: 0.3rem;
  font-weight: 600;
  color: var(--color-green-700);
}

.summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.6rem;
}

.mini {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.65rem 0.8rem;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  min-width: 0;
}

.mini-label {
  font-size: 0.78rem;
  color: var(--text-faint);
}

.mini-value {
  font-family: var(--font-mono);
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
}

.mini-foot {
  font-size: 0.75rem;
  color: var(--text-faint);
}

.chart-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.chart-title {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: var(--font-weight-bold);
  color: var(--text-color);
}

.toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.1rem;
  font-size: 0.82rem;
  color: var(--color-ink-soft);
}

.legend li {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.swatch {
  display: inline-block;
  width: 0.8rem;
  height: 0.8rem;
}

.swatch.bar {
  background: var(--color-green-500);
}

.swatch.bar-best {
  background: var(--color-green-700);
}

.swatch.hatched {
  background: repeating-linear-gradient(
    135deg,
    var(--color-green-500) 0 3px,
    var(--surface) 3px 6px
  );
  outline: 1px solid var(--color-green-500);
  outline-offset: -1px;
}

.swatch.dashed {
  height: 0;
  border-top: 2px dashed var(--color-ink-soft);
}

.swatch.line {
  height: 0;
  border-top: 3px solid var(--color-green-600);
}

.swatch.step {
  height: 0;
  border-top: 2px solid var(--color-ink);
}

.swatch.dot,
.swatch.dot-dark,
.swatch.dot-pale {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: var(--radius-round);
}

.swatch.dot {
  background: var(--color-green-300);
}

.swatch.dot-dark {
  background: var(--color-green-700);
}

.swatch.dot-pale {
  background: var(--color-green-200);
}

@media (max-width: 640px) {
  .mt-primary .field {
    flex: 1 1 100%;
  }

  .metric-select {
    min-width: 0;
  }

  .answer-value {
    font-size: 1.8rem;
  }

  /* Three short figures stay on one line while they fit, else wrap. */
  .summary {
    grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));
    gap: 0.5rem;
  }

  .mini-value {
    font-size: 1.05rem;
  }

  :deep(.chip-select) {
    flex-wrap: wrap;
  }
}
</style>
