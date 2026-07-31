<template>
  <section class="section-card">
    <div class="section-header">
      <h3 class="section-title">
        <i class="fas fa-gauge-high" aria-hidden="true"></i>
        {{ t('statistics.summary.title') }}
      </h3>

      <div class="period-toggle" role="tablist" :aria-label="t('statistics.summary.periodLabel')">
        <button
          v-for="p in PERIODS"
          :key="p"
          role="tab"
          :aria-selected="p === period"
          :class="['toggle-btn', { active: p === period }]"
          @click="period = p"
        >
          {{ t(`statistics.summary.periods.${p}`) }}
        </button>
      </div>
    </div>

    <dl class="tiles">
      <div v-for="tile in tiles" :key="tile.id" class="tile">
        <dt class="tile-label">{{ tile.label }}</dt>
        <dd class="tile-value">
          {{ tile.value }}<small v-if="tile.unit">{{ tile.unit }}</small>
        </dd>
      </div>
    </dl>

    <!-- Said only when it needs saying: the aggregate has no sport axis, so
         with a sport selected above these tiles are the one block on the page
         that does not follow the filter. -->
    <p v-if="selectedSport" class="tiles-caption">
      <i class="fas fa-circle-info" aria-hidden="true"></i>
      {{ t('statistics.summary.allSports') }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePluginContext } from '@/composables/usePluginContext'
import { periodKey } from '@/utils/dateKeys'
import type { AggregationMetricDefinition, AggregationPeriod } from '@/types/aggregation'
import type { Activity, ActivityDetails } from '@/types/activity'

const { t } = useI18n()
const { storage, aggregation, units } = usePluginContext()

defineProps<{
  /** Only to say so when the tiles ignore it — see the caption. */
  selectedSport: string
}>()

/**
 * The totals the page opens on, read from the aggregation store.
 *
 * Every other section of this page groups the activity list on the fly. This
 * one does not: `ctx.aggregation` keeps a running sum per period, updated by
 * the activity events themselves, so the figure is there before anything is
 * scanned. It is also the only reader left of that store since the Progression
 * widget was folded into the metric tracker — and a store nothing reads is a
 * store nothing notices when it drifts.
 */
const PERIODS: AggregationPeriod[] = ['week', 'month', 'year']

/**
 * The metrics this section registers, named by their base id.
 *
 * Labels are looked up at render time rather than stored: the config is
 * replicated, so a stored French string would follow the user who wrote it onto
 * every other device. `dimension` is what the renderer converts through — a
 * stored unit and factor would be a second, preference-blind copy of the
 * conversion table.
 */
const BASE_METRICS = [
  { id: 'distance', sourceRef: 'distance', unit: 'm', dimension: 'distance', decimals: 1 },
  { id: 'duration', sourceRef: 'duration', unit: 's', decimals: 0 },
  {
    id: 'totalAscent',
    sourceRef: 'stats.totalAscent',
    unit: 'm',
    dimension: 'elevation',
    decimals: 0
  }
] as const

const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60

const period = ref<AggregationPeriod>('week')
const definitions = ref<AggregationMetricDefinition[]>([])
const values = ref<Record<string, number>>({})

/** Seconds → "3h05" / "45 min". A duration reads the same in both systems. */
function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / SECONDS_PER_MINUTE)
  const h = Math.floor(totalMinutes / MINUTES_PER_HOUR)
  const m = totalMinutes % MINUTES_PER_HOUR
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`
}

/** One SI value, as the pair the tile prints. */
function displayOf(
  metric: AggregationMetricDefinition,
  si: number
): { value: string; unit: string } {
  if (!Number.isFinite(si)) return { value: '—', unit: '' }
  if (metric.dimension) {
    const { value, unit } = units.convert(metric.dimension, si)
    return { value: value.toFixed(metric.decimals ?? 0), unit }
  }
  if (metric.unit === 's') return { value: formatDuration(si), unit: '' }
  return { value: si.toFixed(metric.decimals ?? 0), unit: metric.unit ?? '' }
}

/**
 * One tile per base metric, in declaration order.
 *
 * Read from `BASE_METRICS` rather than from the stored definitions so the row
 * keeps its order and its shape whatever a config written elsewhere holds.
 */
const tiles = computed(() =>
  BASE_METRICS.map(base => {
    const id = `${period.value}_${base.id}`
    const def = definitions.value.find(d => d.id === id)
    const shown = def ? displayOf(def, values.value[id] ?? 0) : { value: '—', unit: '' }
    return {
      id: base.id,
      label: t(`statistics.summary.metrics.${base.id}`),
      value: shown.value,
      unit: shown.unit
    }
  })
)

// ── Loading ─────────────────────────────────────────────────────────────────

/**
 * Bring the stored definitions in line with what this section expects.
 *
 * Reconciled every time, not merely completed when absent: a config written by
 * an older version stays frozen in its old shape otherwise — it still carries
 * `displayUnit`/`displayFactor` and no `dimension`, so a distance renders as
 * raw metres, and because nothing "changed" the aggregates are never rebuilt
 * either. `enabled` is the one field a user can own, so it is preserved.
 */
async function reconcileMetrics(): Promise<boolean> {
  const metrics = aggregation.listMetrics()
  let changed = false

  for (const base of BASE_METRICS) {
    for (const p of PERIODS) {
      const id = `${p}_${base.id}`
      const expected = {
        sourceRef: base.sourceRef,
        aggregation: 'sum' as const,
        periods: [p],
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
  await aggregation.loadConfigFromSettings()
  return true
}

async function rebuildFromScratch() {
  // `exportDB` cannot know what a store holds, so the shape is asserted once
  // here rather than smuggled through `Record<string, unknown>` at the call.
  const activities = (await storage.exportDB('activities')) as Activity[]
  const allDetails = (await storage.exportDB('activity_details')) as ActivityDetails[]
  const detailsMap = new Map<string, ActivityDetails | null>()
  for (const d of allDetails) {
    if (d?.id) detailsMap.set(d.id, d)
  }
  await aggregation.rebuildAll(activities, detailsMap)
}

/**
 * The aggregate of the period the reader is in, not of the last one on record.
 *
 * A tile that silently showed a fortnight-old week would read as this week's
 * total. A week with nothing in it has a total, and that total is zero.
 *
 * Returns whether the store holds no aggregate at all for these definitions.
 */
async function loadTotals(): Promise<{ empty: boolean }> {
  const enabled = aggregation
    .listMetrics()
    .filter(m => m.enabled && m.periods.includes(period.value))
  definitions.value = enabled

  const currentKey = periodKey(new Date(), period.value)
  const next: Record<string, number> = {}
  let records = 0

  await Promise.all(
    enabled.map(async def => {
      const stored = await aggregation.getAggregated(def.id, period.value)
      records += stored.length
      next[def.id] = stored.find(r => r.periodKey === currentKey)?.value ?? 0
    })
  )

  values.value = next
  return { empty: records === 0 }
}

let unsubscribe: (() => void) | null = null

watch(period, () => {
  void loadTotals()
})

onMounted(async () => {
  const reconciled = await reconcileMetrics()
  if (reconciled) await rebuildFromScratch()

  const { empty } = await loadTotals()
  // A definition can exist with no aggregate behind it — the aggregation is
  // event-driven, so activities imported before the metric was registered were
  // never counted. Rebuilding once here is what turns a section of zeroes into
  // a section of figures; `rebuildAll` purges first, so it cannot double-count.
  if (empty) {
    const activities = await storage.exportDB('activities')
    if (activities.length > 0) {
      await rebuildFromScratch()
      await loadTotals()
    }
  }

  // An import lands as activity events, which the aggregation turns into new
  // records; without this the tiles would keep the figures of page load.
  unsubscribe = aggregation.subscribe(() => {
    void loadTotals()
  })
})

onUnmounted(() => {
  unsubscribe?.()
  unsubscribe = null
})
</script>

<style scoped>
.section-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 1rem;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.section-title i {
  color: var(--color-green-500);
}

.period-toggle {
  display: flex;
  gap: 0.4rem;
}

.toggle-btn {
  padding: 0.3rem 0.8rem;
  border-radius: 6px;
  border: 1px solid var(--color-green-200);
  background: var(--bg-color);
  color: var(--text-color);
  font-family: var(--font-main);
  font-size: 0.8rem;
  /* Global button styling shouts in uppercase; a period is a label, not a call
     to action — same reason as the scope tabs on the activity list */
  text-transform: none;
  letter-spacing: 0;
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s;
}

.toggle-btn.active {
  background: var(--color-green-500);
  color: var(--color-white);
  border-color: var(--color-green-500);
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
  gap: 0.6rem;
  margin: 0;
}

.tile {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.7rem 0.8rem;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
}

.tile-label {
  font-family: var(--font-condensed);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.tile-value {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-color);
}

.tile-value small {
  margin-left: 0.2rem;
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--text-faint);
}

.tiles-caption {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0.7rem 0 0;
  font-size: 0.75rem;
  color: var(--text-faint);
}
</style>
