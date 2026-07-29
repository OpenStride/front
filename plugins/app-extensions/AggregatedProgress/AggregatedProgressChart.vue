<template>
  <div class="apchart">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import Chart from 'chart.js/auto'

const cssVar = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

const props = defineProps<{
  /** One label per point, already formatted for reading. */
  labels: string[]
  /**
   * Points **already converted** to the reader's units by the parent.
   *
   * The axis used to plot raw SI while the tiles below it showed kilometres —
   * a chart reading 80 000 next to a tile reading 28.5 km. Whatever converts
   * the tiles has to convert the series, from the same call.
   */
  values: number[]
  /** Shown on the axis and in the tooltip, never derived here. */
  unit?: string
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null

/** Numbers read in mono here as they do everywhere else in the app. */
const mono = () => cssVar('--font-mono', 'monospace')

function build() {
  if (!canvas.value) return
  chart = new Chart(canvas.value, {
    type: 'line',
    data: {
      labels: props.labels,
      datasets: [
        {
          label: '',
          data: props.values,
          borderColor: cssVar('--color-green-600', '#4d7314'),
          backgroundColor: cssVar('--color-green-100', '#e8f0d4'),
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: cssVar('--color-green-600', '#4d7314'),
          pointBorderWidth: 0,
          fill: true,
          tension: 0.25
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            label: item => `${item.formattedValue}${props.unit ? ` ${props.unit}` : ''}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            font: { family: mono(), size: 10 },
            color: cssVar('--text-faint', '#6b7280')
          }
        },
        y: {
          beginAtZero: true,
          grid: { color: cssVar('--border-subtle', '#e5e7eb') },
          border: { display: false },
          ticks: {
            font: { family: mono(), size: 10 },
            color: cssVar('--text-faint', '#6b7280'),
            maxTicksLimit: 5
          }
        }
      }
    }
  })
}

onMounted(async () => {
  await nextTick()
  build()
})

onBeforeUnmount(() => {
  chart?.destroy()
  chart = null
})

watch(
  () => [props.labels, props.values, props.unit],
  () => {
    if (!chart) return
    chart.data.labels = props.labels
    chart.data.datasets[0].data = props.values
    chart.update()
  }
)
</script>

<style scoped>
.apchart {
  position: relative;
  width: 100%;
  height: 180px;
}
</style>
