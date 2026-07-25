<template>
  <div class="chart-container">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import Chart from 'chart.js/auto'
import { trendLine } from '../series'
import type { MetricDefinition, SeriesPoint } from '../types'

const props = defineProps<{
  points: SeriesPoint[]
  labels: string[]
  metric: MetricDefinition
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null

/** Dense series need smaller dots to stay readable */
function pointRadius(count: number): number {
  if (count > 200) return 1.5
  if (count > 60) return 2
  return 3
}

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function createOrUpdate() {
  const values = props.points.map(p => p.value)
  const trend = trendLine(props.points)
  const green500 = cssVar('--color-green-500', '#88aa00')
  const green300 = cssVar('--color-green-300', '#cbe56d')

  if (chart) {
    chart.data.labels = props.labels
    chart.data.datasets[0].data = values
    chart.data.datasets[0].pointRadius = pointRadius(props.points.length)
    chart.data.datasets[1].data = trend
    // The axis direction belongs to the metric, so it follows the selection
    const scales = chart.options.scales as Record<string, Record<string, unknown>>
    scales.y.reverse = !!props.metric.betterIsLower
    chart.update()
    return
  }

  if (!canvas.value) return

  chart = new Chart(canvas.value, {
    type: 'line',
    data: {
      labels: props.labels,
      datasets: [
        {
          label: 'points',
          data: values,
          // Consecutive outings are not a continuum — plotting them as a cloud
          // and reading the direction off the trend line is far more legible
          // than a line zigzagging between them
          showLine: false,
          pointRadius: pointRadius(props.points.length),
          pointHoverRadius: 5,
          pointBackgroundColor: green500,
          borderColor: green500
        },
        {
          label: 'trend',
          data: trend,
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
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
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
          ticks: { autoSkip: true, maxTicksLimit: 12, maxRotation: 0 }
        },
        y: {
          reverse: !!props.metric.betterIsLower,
          beginAtZero: false,
          ticks: {
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

watch(() => [props.points, props.labels, props.metric], createOrUpdate, { deep: true })
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
