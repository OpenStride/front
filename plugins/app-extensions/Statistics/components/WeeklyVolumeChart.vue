<template>
  <DashCard :title="title" icon="fa-chart-column" data-test="weekly-volume">
    <template #aside>{{ t('statistics.volume.note', { weeks: WEEKS }) }}</template>

    <div class="chart">
      <canvas ref="canvas" role="img" :aria-label="ariaLabel"></canvas>
    </div>

    <ul class="legend">
      <li v-for="s in legend" :key="s.sport">
        <span class="swatch" :style="{ background: s.color }" aria-hidden="true"></span>
        {{ s.label }}
      </li>
      <li>
        <span class="swatch hatched" aria-hidden="true"></span>
        {{ t('statistics.volume.currentWeek') }}
      </li>
      <li v-if="average > 0">
        <span class="swatch dashed" aria-hidden="true"></span>
        {{ t('statistics.volume.average') }}
      </li>
    </ul>
  </DashCard>
</template>

<script setup lang="ts">
import DashCard from './DashCard.vue'
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import Chart from 'chart.js/auto'
import { usePluginContext } from '@/composables/usePluginContext'
import { formatDate } from '@/utils/dateFormat'
import { formatCompactDuration } from '@/utils/duration'
import { distanceDimension } from '@/utils/activityMetrics'
import { getSportProfile } from '@/types/sport'
import { formatSportType } from '@/utils/sportLabels'
import type { Activity } from '@/types/activity'
import { timeBySport, weeklySeries, type WeekBucket } from '../dashboardData'
import { cssVar, hatch, sportColor } from '../sportPalette'
import { axisTicks, gridLines, tooltipStyle } from '../chartTheme'

const WEEKS = 12

const { t } = useI18n()
const { units } = usePluginContext()

const props = defineProps<{
  /** Already filtered by the page's sport. */
  activities: Activity[]
  /** Empty for all sports. */
  selectedSport: string
}>()

/**
 * Distance for one sport that moves; time when sports are mixed, because the
 * time is what they share — 40 km on a bike and 10 km on foot are not
 * stacked on one axis honestly.
 */
const kind = computed<'distance' | 'duration'>(() =>
  props.selectedSport && getSportProfile(props.selectedSport).primaryMetric !== 'none'
    ? 'distance'
    : 'duration'
)
const dimension = computed(() => distanceDimension(props.selectedSport))

const weeks = computed(() => weeklySeries(props.activities, WEEKS))

/** Sports by time spent, so the main one sits at the base of each bar. */
const sports = computed(() => timeBySport(weeks.value).map(s => s.sport))

/** A week's SI amount for one sport, in display units. */
function display(week: WeekBucket, sport?: string): number {
  const slot = sport ? week.bySport[sport] : week
  if (!slot) return 0
  if (kind.value === 'duration') return slot.duration / 3600
  return units.convert(dimension.value, slot.distance).value
}

const unit = computed(() =>
  kind.value === 'duration' ? 'h' : units.convert(dimension.value, 0).unit
)

const title = computed(() =>
  kind.value === 'duration' ? t('statistics.volume.titleTime') : t('statistics.volume.title')
)

/** Mean of the four complete weeks before this one. */
const average = computed(() => {
  const complete = weeks.value.slice(-5, -1)
  return complete.reduce((s, w) => s + display(w), 0) / complete.length
})

const legend = computed(() =>
  sports.value.map((sport, rank) => ({
    sport,
    label: formatSportType(sport),
    color: sportColor(rank)
  }))
)

function label(value: number): string {
  if (kind.value === 'duration') return formatCompactDuration(value * 3600)
  return `${value.toFixed(dimension.value === 'distance' ? 1 : 0)} ${unit.value}`
}

const ariaLabel = computed(() =>
  t('statistics.volume.aria', {
    weeks: WEEKS,
    values: weeks.value.map(w => label(display(w))).join(', ')
  })
)

const canvas = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null

function draw() {
  chart?.destroy()
  chart = null
  if (!canvas.value) return

  const labels = weeks.value.map(w =>
    w.isCurrent
      ? t('statistics.volume.thisWeek')
      : formatDate(w.start.getTime(), { day: 'numeric', month: 'short' })
  )
  const bars = sports.value.map((sport, rank) => {
    const color = sportColor(rank)
    return {
      type: 'bar' as const,
      label: formatSportType(sport),
      data: weeks.value.map(w => display(w, sport)),
      backgroundColor: weeks.value.map(w => (w.isCurrent ? hatch(color) : color)),
      borderColor: color,
      borderWidth: weeks.value.map(w => (w.isCurrent ? 1 : 0)),
      stack: 'volume',
      order: 2
    }
  })
  const line = {
    type: 'line' as const,
    label: t('statistics.volume.average'),
    data: weeks.value.map(() => average.value),
    borderColor: cssVar('--color-ink-soft'),
    borderDash: [6, 4],
    borderWidth: 1.5,
    pointRadius: 0,
    pointHoverRadius: 0,
    order: 1
  }

  const tick = axisTicks()
  chart = new Chart(canvas.value, {
    data: { labels, datasets: average.value > 0 ? [...bars, line] : bars },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      // Short: the chart is redrawn on every filter change, and a long grow
      // read as a page still loading.
      animation: { duration: 300 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle(),
          filter: item => item.dataset.type !== 'line' && (item.raw as number) > 0,
          callbacks: {
            label: item => `${item.dataset.label} : ${label(item.raw as number)}`,
            footer: items =>
              items.length > 1 ? label(items.reduce((s, i) => s + (i.raw as number), 0)) : ''
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          border: { display: false },
          ticks: { ...tick, maxRotation: 0, autoSkip: true, autoSkipPadding: 16 }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          border: { display: false },
          grid: gridLines(),
          ticks: { ...tick, maxTicksLimit: 5 },
          title: { display: true, text: unit.value, color: tick.color, font: tick.font }
        }
      }
    }
  })
}

// Chart.js draws to canvas, so a change of data or of unit system redraws.
watch([weeks, kind, () => units.system], async () => {
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
.chart {
  position: relative;
  height: 15rem;
}

.legend {
  list-style: none;
  margin: 0.8rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.1rem;
  font-size: 0.85rem;
  color: var(--color-ink-soft);
}

.legend li {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.swatch {
  width: 0.8rem;
  height: 0.8rem;
  display: inline-block;
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
</style>
