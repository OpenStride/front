<template>
  <section v-if="points.valued >= MIN_WEEKS" class="section-card" data-test="progress-trend">
    <div class="card-head">
      <h3 class="card-title">{{ title }}</h3>
      <span class="card-note">{{ t('statistics.progress.note', { weeks: WEEKS }) }}</span>
    </div>

    <p class="verdict">
      <strong class="latest">{{ format(points.last) }}</strong>
      {{ verdict }}
    </p>

    <div class="chart">
      <canvas ref="canvas" role="img" :aria-label="title"></canvas>
    </div>

    <RouterLink :to="exploreLink" class="explore">
      {{ t('statistics.progress.explore') }}
      <i class="fas fa-arrow-right" aria-hidden="true"></i>
    </RouterLink>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import Chart from 'chart.js/auto'
import { usePluginContext } from '@/composables/usePluginContext'
import { formatDate } from '@/utils/dateFormat'
import { primaryMetricSpec } from '@/utils/activityMetrics'
import type { Activity } from '@/types/activity'
import { weeklySeries, weeklySpeed } from '../dashboardData'
import { cssVar } from '../sportPalette'

const WEEKS = 12
/** Below three weeks a direction means nothing: two points only describe themselves. */
const MIN_WEEKS = 3

const { t } = useI18n()
const { units } = usePluginContext()

const props = defineProps<{
  /** Already filtered to `sport`. */
  activities: Activity[]
  sport: string
}>()

const weeks = computed(() => weeklySeries(props.activities, WEEKS))

/** Pace, pace per 100 m or speed: whatever the sport is read in. */
const spec = computed(() => primaryMetricSpec(props.sport, { speed: 1 }))
const dimension = computed(() => spec.value?.dimension)
const isPace = computed(() => dimension.value === 'pace' || dimension.value === 'pace100')

const points = computed(() => {
  const dim = dimension.value
  const speeds = weeklySpeed(weeks.value)
  const values = speeds.map(mps => {
    if (!dim || mps === null || dim === 'elevation') return null
    const si = isPace.value ? 1 / mps : mps
    return units.convert(dim, si).value
  })
  const valued = values.filter((v): v is number => v !== null)
  return {
    values,
    valued: valued.length,
    first: valued[0] ?? NaN,
    last: valued[valued.length - 1] ?? NaN
  }
})

function format(value: number): string {
  if (!Number.isFinite(value) || !dimension.value) return '—'
  const unit = units.convert(dimension.value, 1).unit
  if (isPace.value) {
    const total = Math.round(value)
    return `${Math.floor(total / 60)}'${String(total % 60).padStart(2, '0')}" ${unit}`
  }
  return `${value.toFixed(1)} ${unit}`
}

const title = computed(() =>
  isPace.value ? t('statistics.progress.pace') : t('statistics.progress.speed')
)

/** One sentence that says which way it goes, so the chart is the evidence. */
const verdict = computed(() => {
  const { first, last } = points.value
  const diff = last - first
  // Faster is a lower pace and a higher speed.
  const faster = isPace.value ? diff < 0 : diff > 0
  const amount = Math.abs(diff)
  const steady = isPace.value ? amount < 3 : amount < 0.2
  if (steady) return t('statistics.progress.steady', { weeks: WEEKS })
  const text = isPace.value
    ? `${Math.round(amount)} s`
    : `${amount.toFixed(1)} ${units.convert(dimension.value!, 1).unit}`
  return faster
    ? t('statistics.progress.faster', { value: text, weeks: WEEKS })
    : t('statistics.progress.slower', { value: text, weeks: WEEKS })
})

const exploreLink = computed(() => ({
  path: '/metrics',
  query: {
    metric: isPace.value ? 'pace' : 'speed',
    sport: props.sport,
    granularity: 'week',
    window: '3m'
  }
}))

const canvas = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null

function draw() {
  chart?.destroy()
  chart = null
  if (!canvas.value) return

  const green = cssVar('--color-green-600', '#4d7314')
  const faint = cssVar('--text-faint', '#8c8c84')
  chart = new Chart(canvas.value, {
    type: 'line',
    data: {
      labels: weeks.value.map(w =>
        w.isCurrent
          ? t('statistics.volume.thisWeek')
          : formatDate(w.start.getTime(), { day: 'numeric', month: 'short' })
      ),
      datasets: [
        {
          label: title.value,
          data: points.value.values,
          borderColor: green,
          backgroundColor: green,
          borderWidth: 2.5,
          // Straight segments: a smoothed curve invented bumps between weeks.
          tension: 0,
          spanGaps: true,
          pointRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      // Short: the chart is redrawn on every filter change, and a long grow
      // read as a page still loading.
      animation: { duration: 300 },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: item => format(item.raw as number) } }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: faint, font: { size: 11 }, maxRotation: 0, autoSkipPadding: 8 }
        },
        y: {
          // Up is better: a pace axis is turned over so a faster week rises.
          reverse: isPace.value,
          border: { display: false },
          grid: { color: cssVar('--surface-muted', '#e9ece4') },
          ticks: {
            color: faint,
            font: { size: 11 },
            maxTicksLimit: 5,
            callback: value => format(Number(value)).split(' ')[0]
          }
        }
      }
    }
  })
}

watch([points, () => units.system], async () => {
  await nextTick()
  draw()
})

onMounted(async () => {
  await nextTick()
  draw()
})

onUnmounted(() => chart?.destroy())
</script>

<style scoped>
.card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.3rem 1rem;
}

.card-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-color);
}

.card-note {
  font-size: 0.82rem;
  color: var(--text-faint);
}

.verdict {
  margin: 0.6rem 0 0.8rem;
  font-size: 0.95rem;
  color: var(--color-ink-soft);
}

.latest {
  font-family: var(--font-mono);
  font-size: 1.15rem;
  color: var(--color-green-700);
  margin-right: 0.3rem;
}

.chart {
  position: relative;
  height: 11rem;
}

.explore {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2.75rem;
  margin-top: 0.4rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-green-700);
  text-decoration: none;
}

.explore:hover {
  color: var(--color-green-600);
}
</style>
