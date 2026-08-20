<template>
  <div class="chart-container">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue'
import Chart from 'chart.js/auto'
import { trendLine } from '../series'
import type { Granularity, MetricDefinition, SeriesPoint } from '../types'

const props = defineProps<{
  points: SeriesPoint[]
  labels: string[]
  metric: MetricDefinition
  granularity: Granularity
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null

/**
 * Periods are a continuum; outings are not.
 *
 * A week or a month follows the one before it, so the eye reads a filled line
 * as the progression it is. Consecutive outings only share an order — plotting
 * them as a cloud and reading the direction off a fitted trend is far more
 * legible than a line zigzagging between two Sunday long runs.
 */
const isContinuous = computed(() => props.granularity !== 'activity')

/** Dense series need smaller dots to stay readable */
function pointRadius(count: number): number {
  if (count > 200) return 1.5
  if (count > 60) return 2
  return 3
}

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

/** Numbers read in mono here as they do everywhere else in the app. */
const mono = () => cssVar('--font-mono', 'monospace')

/**
 * A summed metric has a meaningful zero — half the distance is half the bar.
 * A pace or a heart rate does not: forcing the axis to zero flattens the very
 * variation the chart exists to show.
 */
const startsAtZero = () => props.metric.periodOp === 'sum'

function tickStyle() {
  return {
    font: { family: mono(), size: 10 },
    color: cssVar('--text-faint', '#6b7280')
  }
}

function datasets() {
  const values = props.points.map(p => p.value)
  const green500 = cssVar('--color-green-500', '#88aa00')
  const green300 = cssVar('--color-green-300', '#cbe56d')
  const green600 = cssVar('--color-green-600', '#4d7314')

  if (isContinuous.value) {
    return [
      {
        label: 'points',
        data: values,
        borderColor: green600,
        backgroundColor: cssVar('--color-green-100', '#e8f0d4'),
        borderWidth: 2,
        pointRadius: pointRadius(props.points.length),
        pointBackgroundColor: green600,
        pointBorderWidth: 0,
        fill: true,
        tension: 0.25
      }
    ]
  }

  return [
    {
      label: 'points',
      data: values,
      showLine: false,
      pointRadius: pointRadius(props.points.length),
      pointHoverRadius: 5,
      pointBackgroundColor: green500,
      borderColor: green500
    },
    {
      label: 'trend',
      data: trendLine(props.points),
      borderColor: green300,
      borderWidth: 2,
      borderDash: [6, 4],
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      // The fit covers the gaps, so the line must cross them
      spanGaps: true
    }
  ]
}

function createOrUpdate() {
  // Switching granularity switches the mark itself, which Chart.js cannot do
  // in place — the dataset count changes with it.
  if (chart && chart.data.datasets.length !== datasets().length) {
    chart.destroy()
    chart = null
  }

  if (chart) {
    chart.data.labels = props.labels
    chart.data.datasets.forEach((dataset, i) => {
      const next = datasets()[i] as Record<string, unknown>
      Object.assign(dataset, next)
    })
    // The axis direction and its origin belong to the metric, so they follow
    // the selection
    const scales = chart.options.scales as Record<string, Record<string, unknown>>
    scales.y.reverse = !!props.metric.betterIsLower
    scales.y.beginAtZero = startsAtZero()
    chart.update()
    return
  }

  if (!canvas.value) return

  chart = new Chart(canvas.value, {
    type: 'line',
    data: { labels: props.labels, datasets: datasets() },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          filter: item => item.datasetIndex === 0,
          callbacks: {
            label: ctx =>
              typeof ctx.parsed.y === 'number' ? props.metric.format(ctx.parsed.y) : '-'
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            ...tickStyle(),
            autoSkip: true,
            // A pixel gap, not just a count: twelve dates fit a desktop card
            // and ran into each other on a phone, where two labels printed as
            // one unreadable string. The padding lets Chart.js drop as many
            // as the width actually requires.
            autoSkipPadding: 16,
            maxTicksLimit: 12,
            maxRotation: 0
          }
        },
        y: {
          reverse: !!props.metric.betterIsLower,
          beginAtZero: startsAtZero(),
          grid: { color: cssVar('--border-subtle', '#e5e7eb') },
          border: { display: false },
          ticks: {
            ...tickStyle(),
            maxTicksLimit: 5,
            callback: value =>
              typeof value === 'number' ? props.metric.format(value) : String(value)
          }
        }
      }
    }
  })
}

onMounted(async () => {
  await nextTick()
  createOrUpdate()
})

onUnmounted(() => {
  chart?.destroy()
  chart = null
})

watch(() => [props.points, props.labels, props.metric, props.granularity], createOrUpdate, {
  deep: true
})
</script>

<style scoped>
.chart-container {
  width: 100%;
  height: 300px;
}

canvas {
  width: 100% !important;
}

@media (max-width: 640px) {
  .chart-container {
    height: 240px;
  }
}
</style>
