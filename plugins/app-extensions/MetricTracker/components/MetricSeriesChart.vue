<template>
  <div class="chart-container">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import Chart from 'chart.js/auto'
import type { MetricDefinition, SeriesPoint } from '../types'

const props = defineProps<{
  points: SeriesPoint[]
  labels: string[]
  metric: MetricDefinition
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null

function createOrUpdate() {
  const data = props.points.map(p => p.value)
  const style = getComputedStyle(document.documentElement)
  const green500 = style.getPropertyValue('--color-green-500').trim() || '#88aa00'

  if (chart) {
    chart.data.labels = props.labels
    chart.data.datasets[0].data = data
    // The axis direction and the tick format belong to the metric, so both are
    // rebuilt whenever the user switches metric
    const scales = chart.options.scales as Record<string, Record<string, unknown>>
    scales.y.reverse = !!props.metric.betterIsLower
    scales.y.beginAtZero = false
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
          label: '',
          data,
          borderColor: green500,
          backgroundColor: `${green500}1a`,
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          // Missing values break the line instead of being interpolated over
          spanGaps: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx =>
              typeof ctx.parsed.y === 'number' ? props.metric.format(ctx.parsed.y) : '-'
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
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
