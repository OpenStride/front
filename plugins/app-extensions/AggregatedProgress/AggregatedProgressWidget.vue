<template>
  <section class="apw">
    <header class="apw__head">
      <h3 class="apw__title">{{ t('aggregatedProgress.title') }}</h3>
      <button
        class="apw__refresh"
        :disabled="refreshing"
        :title="t('aggregatedProgress.recompute')"
        @click="onRefresh"
      >
        <i
          class="fas fa-arrows-rotate"
          :class="{ 'is-spinning': refreshing }"
          aria-hidden="true"
        ></i>
      </button>
    </header>

    <div class="apw__controls">
      <div class="apw__segments" role="tablist">
        <button
          v-for="period in availablePeriods"
          :key="period"
          class="apw__segment"
          :class="{ 'is-active': period === selectedPeriod }"
          role="tab"
          :aria-selected="period === selectedPeriod"
          @click="selectedPeriod = period"
        >
          {{ t(`aggregatedProgress.periods.${period}`) }}
        </button>
      </div>
    </div>

    <!-- Tiles first: the figure the reader came for, then its history -->
    <div v-if="tiles.length" class="apw__tiles">
      <button
        v-for="tile in tiles"
        :key="tile.id"
        class="apw__tile"
        :class="{ 'is-active': tile.id === selectedMetric }"
        :title="t('aggregatedProgress.plot', { metric: tile.label })"
        @click="selectedMetric = tile.id"
      >
        <span class="apw__label">{{ tile.label }}</span>
        <span class="apw__value">
          {{ tile.value }}<small v-if="tile.unit">{{ tile.unit }}</small>
        </span>
      </button>
    </div>

    <!-- A chart of one point is a dot, not a progression -->
    <AggregatedProgressChart
      v-if="chartValues.length > 1"
      :labels="chartLabels"
      :values="chartValues"
      :unit="chartUnit"
    />
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePluginContext } from '@/composables/usePluginContext'
import AggregatedProgressChart from './AggregatedProgressChart.vue'
import type { AggregationMetricDefinition } from '@/types/aggregation'

const { t } = useI18n()
const { storage, aggregation: aggregationCtx, units } = usePluginContext()

type Period = 'week' | 'month' | 'year'

/**
 * The metrics this widget offers, named by their base id.
 *
 * Labels are looked up at render time rather than stored: the config is
 * replicated, and a stored French string would follow the user who wrote it
 * onto every other device. `dimension` replaced an older
 * `displayUnit`/`displayFactor` pair, which hardcoded kilometres for everyone.
 */
const BASE_METRICS = [
  { id: 'distance', sourceRef: 'distance', unit: 'm', dimension: 'distance', decimals: 1 },
  { id: 'duration', sourceRef: 'duration', unit: 's', decimals: 1 },
  {
    id: 'totalAscent',
    sourceRef: 'stats.totalAscent',
    unit: 'm',
    dimension: 'elevation',
    decimals: 0
  }
] as const

const PERIODS: Period[] = ['week', 'month', 'year']
/** Enough history to read a trend, few enough to stay legible on a phone. */
const CHART_POINTS = 5
const SECONDS_PER_HOUR = 3600

const selectedPeriod = ref<Period>('week')
const selectedMetric = ref<string>('distance')
const availablePeriods = ref<Period[]>(PERIODS)
const definitions = ref<AggregationMetricDefinition[]>([])
const latestValues = ref<Record<string, number>>({})
const refreshing = ref(false)

const chartLabels = ref<string[]>([])
const chartSI = ref<number[]>([])

/** A metric's name comes from the locale, keyed by its base id. */
function metricLabel(id: string): string {
  const base = baseIdOf(id)
  const key = `aggregatedProgress.metrics.${base}`
  return t(key) === key ? base : t(key)
}

const baseIdOf = (id: string): string => id.replace(/^(week|month|year)_/, '')

/**
 * One SI value, as a number in the reader's units.
 *
 * The single conversion in this widget: the tiles and the chart series both go
 * through it. They used to convert separately, and when the metric definition
 * changed only the tiles were updated — leaving the axis plotting metres under
 * a tile that read kilometres.
 */
function displayOf(
  metric: AggregationMetricDefinition,
  si: number
): { value: number; unit: string; decimals: number } {
  const decimals = metric.decimals ?? 0
  if (metric.dimension) {
    const converted = units.convert(metric.dimension, si)
    return { value: converted.value, unit: converted.unit, decimals }
  }
  // A duration has no dimension: hours read the same in both systems.
  if (metric.unit === 's') {
    return { value: si / SECONDS_PER_HOUR, unit: t('goals.units.hours'), decimals: 1 }
  }
  return { value: si, unit: metric.unit ?? '', decimals }
}

const tiles = computed(() =>
  definitions.value.map(def => {
    const shown = displayOf(def, latestValues.value[def.id] ?? 0)
    return {
      id: baseIdOf(def.id),
      label: metricLabel(def.id),
      value: Number.isFinite(shown.value) ? shown.value.toFixed(shown.decimals) : '—',
      unit: shown.unit
    }
  })
)

const selectedDefinition = computed(() =>
  definitions.value.find(d => baseIdOf(d.id) === selectedMetric.value)
)

/** Converted from the SI series, so a preference change redraws the axis. */
const chartValues = computed(() => {
  const def = selectedDefinition.value
  if (!def) return []
  return chartSI.value.map(si => displayOf(def, si).value)
})

const chartUnit = computed(() =>
  selectedDefinition.value ? displayOf(selectedDefinition.value, 0).unit : ''
)

// ── Period keys → readable labels ────────────────────────────────────────────

function monthKeyToLabel(monthKey: string): string {
  const match = monthKey.match(/(\d{4})-(\d{2})/)
  return match ? `${match[2]}/${match[1]}` : monthKey
}

function weekKeyToMonday(weekKey: string): string {
  const match = weekKey.match(/(\d{4})-W(\d{2})/)
  if (!match) return weekKey
  const year = parseInt(match[1], 10)
  const week = parseInt(match[2], 10)
  const simple = new Date(year, 0, 1 + (week - 1) * 7)
  const dow = simple.getDay()
  const monday = new Date(simple)
  monday.setDate(dow <= 4 ? simple.getDate() - dow + 1 : simple.getDate() + 8 - dow)
  // The reader's locale, not a hardcoded one.
  return monday.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })
}

const periodLabel = (key: string, period: Period): string => {
  if (period === 'week') return weekKeyToMonday(key)
  if (period === 'month') return monthKeyToLabel(key)
  return key
}

// ── Loading ─────────────────────────────────────────────────────────────────

/**
 * Bring the stored definitions in line with what this widget expects.
 *
 * Reconciled every time, not merely completed when absent. Only adding the
 * missing ids left a config written by an older version frozen in its old
 * shape: it still carried `displayUnit`/`displayFactor` and no `dimension`, so
 * a distance rendered as raw metres — and because nothing "changed", the
 * aggregates were never rebuilt either, leaving the whole widget on zeroes.
 *
 * `enabled` is the one field a user can own, so it is preserved.
 */
async function reconcileMetrics(): Promise<boolean> {
  const metrics = aggregationCtx.listMetrics()
  let changed = false

  for (const base of BASE_METRICS) {
    for (const period of PERIODS) {
      const id = `${period}_${base.id}`
      const expected = {
        sourceRef: base.sourceRef,
        aggregation: 'sum' as const,
        periods: [period],
        unit: base.unit,
        decimals: base.decimals,
        dimension: 'dimension' in base ? base.dimension : undefined
      }
      const existing = metrics.find(m => m.id === id)

      if (!existing) {
        metrics.push({ id, label: base.id, enabled: true, ...expected })
        changed = true
        continue
      }

      // Fields this widget owns; anything else the user set is left alone.
      const stale =
        existing.sourceRef !== expected.sourceRef ||
        existing.unit !== expected.unit ||
        existing.decimals !== expected.decimals ||
        existing.dimension !== expected.dimension ||
        'displayFactor' in existing ||
        'displayUnit' in existing

      if (!stale) continue

      Object.assign(existing, expected)
      // Drop what the type no longer knows about, so the shape converges.
      delete (existing as Record<string, unknown>).displayFactor
      delete (existing as Record<string, unknown>).displayUnit
      changed = true
    }
  }
  if (!changed) return false

  await storage.saveData('aggregationConfig', { metrics })
  await aggregationCtx.loadConfigFromSettings()
  return true
}

async function rebuildFromScratch() {
  const activities = await storage.exportDB('activities')
  const allDetails = await storage.exportDB('activity_details')
  const detailsMap = new Map<string, Record<string, unknown> | null>()
  for (const d of allDetails) {
    const id = (d as Record<string, unknown> | null)?.id
    if (typeof id === 'string') detailsMap.set(id, d as Record<string, unknown>)
  }
  await aggregationCtx.rebuildAll(activities as Record<string, unknown>[], detailsMap)
}

/** True when the store holds no aggregate at all for the current definitions. */
async function loadMetrics(): Promise<{ empty: boolean }> {
  const enabled = aggregationCtx.listMetrics().filter(m => m.enabled)
  availablePeriods.value = PERIODS.filter(p => enabled.some(m => m.periods.includes(p)))

  const forPeriod = enabled.filter(m => m.periods.includes(selectedPeriod.value))
  definitions.value = forPeriod

  const values: Record<string, number> = {}
  const series = await Promise.all(
    forPeriod.map(async def => {
      const records = (await aggregationCtx.getAggregated(def.id, selectedPeriod.value)).sort(
        (a, b) => a.periodKey.localeCompare(b.periodKey)
      )
      values[def.id] = records[records.length - 1]?.value ?? 0
      return { def, records }
    })
  )
  latestValues.value = values

  const selected = series.find(s => baseIdOf(s.def.id) === selectedMetric.value)
  const points = selected ? selected.records.slice(-CHART_POINTS) : []
  chartLabels.value = points.map(r => periodLabel(r.periodKey, selectedPeriod.value))
  chartSI.value = points.map(r => r.value)

  return { empty: series.every(s => s.records.length === 0) }
}

watch([selectedPeriod, selectedMetric], () => {
  void loadMetrics()
})

onMounted(async () => {
  const reconciled = await reconcileMetrics()
  if (reconciled) await rebuildFromScratch()

  const { empty } = await loadMetrics()
  // A definition can exist with no aggregate behind it — the aggregation is
  // event-driven, so activities imported before the metric was registered were
  // never counted. Rebuilding once here is what turns a widget of zeroes into
  // a widget of figures; `rebuildAll` purges first, so it cannot double-count.
  if (empty) {
    const activities = await storage.exportDB('activities')
    if (activities.length > 0) {
      await rebuildFromScratch()
      await loadMetrics()
    }
  }
})

const onRefresh = async () => {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await rebuildFromScratch()
    await loadMetrics()
  } catch {
    // A failed rebuild leaves the previous figures on screen, which is honest.
  }
  refreshing.value = false
}
</script>

<style scoped>
.apw {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 18px 18px;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  color: var(--color-ink);
}

.apw__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.apw__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.apw__refresh {
  background: none;
  border: none;
  padding: 4px 8px;
  color: var(--text-faint);
  font-size: 14px;
  cursor: pointer;
}

.apw__refresh:hover:not(:disabled) {
  color: var(--color-green-600);
}

.apw__refresh:disabled {
  cursor: default;
}

.is-spinning {
  animation: apw-spin 0.9s linear infinite;
}

@keyframes apw-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Period segments ─────────────────────────────────────── */
.apw__segments {
  display: inline-flex;
  padding: 2px;
  gap: 2px;
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.apw__segment {
  flex: 1;
  padding: 6px 12px;
  border: none;
  border-radius: calc(var(--radius-md) - 3px);
  background: none;
  color: var(--text-faint);
  font-family: var(--font-condensed);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.15s;
}

.apw__segment.is-active {
  background: var(--color-ink);
  color: var(--color-white);
}

/* ── Tiles ───────────────────────────────────────────────── */
.apw__tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: 10px;
}

.apw__tile {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.15s;
  /* A tile is a button so it can be tapped and focused, but the global
     `button` rule uppercases everything it contains — including the unit,
     which turned "28.5 km" into "28.5 KM". The label opts back in below. */
  text-transform: none;
  letter-spacing: normal;
}

.apw__tile.is-active {
  border-color: var(--color-green-500);
  background: var(--color-green-50);
}

.apw__label {
  font-family: var(--font-condensed);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.apw__value {
  font-family: var(--font-mono);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-ink);
}

.apw__value small {
  margin-left: 3px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-faint);
}

.apw__tile.is-active .apw__value {
  color: var(--color-green-700);
}
</style>
