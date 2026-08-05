<template>
  <article class="agg" :data-test="`aggregate-card-${aggregate.id}`">
    <header class="agg__head">
      <i :class="aggregate.icon || 'fas fa-chart-simple'" aria-hidden="true"></i>
      <h4 class="agg__label">{{ aggregate.label }}</h4>
      <span class="agg__value">{{ currentValue }}</span>
    </header>

    <p class="agg__desc">{{ describe(aggregate) }}</p>

    <div v-if="points.length > 1" class="agg__chart">
      <canvas ref="canvas" :aria-label="t('customAggregates.chartOf', { name: aggregate.label })">
      </canvas>
    </div>
    <p v-else class="agg__thin">{{ t('customAggregates.notEnoughPoints') }}</p>

    <footer class="agg__controls">
      <div class="chips" role="group" :aria-label="t('customAggregates.period')">
        <button
          v-for="p in PERIODS"
          :key="p"
          type="button"
          class="chip"
          :class="{ 'chip--on': period === p }"
          :aria-pressed="period === p"
          :data-test="`period-${p}`"
          @click="period = p"
        >
          {{ t(`customAggregates.periods.${p}`) }}
        </button>
      </div>

      <!-- Absent on a yearly card: three months of yearly buckets is one point. -->
      <div
        v-if="windows.length"
        class="chips"
        role="group"
        :aria-label="t('customAggregates.window')"
      >
        <button
          v-for="w in windows"
          :key="w"
          type="button"
          class="chip"
          :class="{ 'chip--on': window === w }"
          :aria-pressed="window === w"
          :data-test="`window-${w}`"
          @click="window = w"
        >
          {{ t(`customAggregates.windows.${w}`) }}
        </button>
      </div>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Chart from 'chart.js/auto'
import { usePluginContext } from '@/composables/usePluginContext'
import type { AggregatedRecord, AggregationPeriod } from '@/types/aggregation'
import type { CustomAggregate } from '@/types/customAggregate'
import { SAMPLE_FIELD_SPECS } from '@/types/sampleFields'
import { periodKey } from '@/utils/dateKeys'
import { formatValue, toDisplay, unitOf } from '../aggregateFormat'
import { availableWindows, buildSeries, type WindowId } from '../aggregateSeries'

const PERIODS: AggregationPeriod[] = ['week', 'month', 'year']

const props = defineProps<{ aggregate: CustomAggregate }>()

const { t } = useI18n()
const ctx = usePluginContext()

const records = ref<AggregatedRecord[]>([])
const period = ref<AggregationPeriod>('month')
const window = ref<WindowId>('12m')
const canvas = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null

const windows = computed(() => availableWindows(period.value))
const points = computed(() => buildSeries(records.value, period.value, window.value))

/** The figure of the period being read, not the last one on record. */
const currentValue = computed(() => {
  const key = periodKey(new Date(), period.value)
  const record = records.value.find(r => r.periodType === period.value && r.periodKey === key)
  return record
    ? formatValue(ctx.units, props.aggregate.measure.field, record.value)
    : t('customAggregates.noValue')
})

/**
 * The rule, read back in the reader's units.
 *
 * Built from the definition rather than stored beside it: a description that is
 * a second copy of the rule drifts from it the first time the rule is edited.
 */
function describe(aggregate: CustomAggregate): string {
  const measure = t(SAMPLE_FIELD_SPECS[aggregate.measure.field].labelKey)
  const op = t(`customAggregates.ops.${aggregate.measure.op}`)

  const bands = aggregate.where.map(filter => {
    const name = t(SAMPLE_FIELD_SPECS[filter.field].labelKey)
    const unit = unitOf(ctx.units, filter.field)
    const low = filter.min !== undefined ? show(filter.field, filter.min) : null
    const high = filter.max !== undefined ? show(filter.field, filter.max) : null

    if (low !== null && high !== null) return `${name} ${low}–${high} ${unit}`
    if (low !== null) return `${name} ≥ ${low} ${unit}`
    return `${name} < ${high} ${unit}`
  })

  return bands.length ? `${op} ${measure} — ${bands.join(', ')}` : `${op} ${measure}`
}

function show(field: CustomAggregate['measure']['field'], si: number): string {
  return String(Math.round(toDisplay(ctx.units, field, si) * 10) / 10)
}

async function load() {
  records.value = await ctx.aggregation.getAggregated(props.aggregate.id, period.value)
}

function draw() {
  const spec = SAMPLE_FIELD_SPECS[props.aggregate.measure.field]
  const labels = points.value.map(p => p.key)
  // Plotted in the reader's units, like every figure on the card. A chart in
  // metres per second beside a value in km/h would read as two measurements.
  const data = points.value.map(
    p => Math.round(toDisplay(ctx.units, props.aggregate.measure.field, p.value) * 10) / 10
  )

  if (chart) {
    chart.data.labels = labels
    chart.data.datasets[0].data = data
    chart.update()
    return
  }

  if (!canvas.value) return

  const style = getComputedStyle(document.documentElement)
  const green500 = style.getPropertyValue('--color-green-500').trim() || '#88aa00'

  chart = new Chart(canvas.value, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: props.aggregate.label,
          data,
          borderColor: green500,
          backgroundColor: `${green500}1a`,
          fill: true,
          tension: 0.3,
          pointRadius: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        // Not from zero: these are averages within a band, and a heart rate
        // axis starting at zero flattens every variation worth seeing.
        y: { beginAtZero: false, title: { display: false, text: spec.unit ?? '' } }
      }
    }
  })
}

/** A window that means nothing for the new period would leave an empty chart. */
watch(period, async () => {
  if (windows.value.length && !windows.value.includes(window.value)) window.value = 'all'
  await load()
})

watch([points, canvas], async () => {
  await nextTick()
  draw()
})

onMounted(async () => {
  await load()
  await nextTick()
  draw()
})

onBeforeUnmount(() => {
  chart?.destroy()
  chart = null
})
</script>

<style scoped>
.agg {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1.1rem 1.2rem;
  background: var(--card-background);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
}

.agg__head {
  display: flex;
  gap: 0.45rem;
  align-items: baseline;
}

.agg__head i {
  color: var(--color-green-500);
}

.agg__label {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-color);
}

.agg__value {
  font-size: 1.45rem;
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
}

.agg__desc {
  margin: 0.2rem 0 0.7rem;
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.agg__chart {
  position: relative;
  height: 210px;
}

.agg__thin {
  padding: 1.5rem 0;
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
  text-align: center;
}

.agg__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: space-between;
  margin-top: 0.7rem;
}

.chips {
  display: flex;
  gap: 0.25rem;
}

.chip {
  padding: 0.3rem 0.55rem;
  font-size: 0.78rem;
  color: var(--text-secondary);
  cursor: pointer;
  background: var(--background-color);
  border: 1px solid var(--border-color);
  border-radius: 999px;
}

.chip--on {
  color: var(--text-on-primary, #fff);
  background: var(--primary-color);
  border-color: var(--primary-color);
}
</style>
