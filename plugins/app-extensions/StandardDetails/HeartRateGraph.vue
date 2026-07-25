<template>
  <GraphCard :title="t('graphs.heartRate')" icon="fa-heart-pulse" accent="var(--color-red-500)">
    <template v-if="hasData" #actions>
      <span
        >{{ t('graphs.average') }} <strong>{{ Math.round(meanBPM) }}</strong> bpm</span
      >
    </template>
    <div v-if="hasData">
      <canvas ref="canvas" height="180"></canvas>
    </div>
    <p v-else class="graph-empty">{{ t('graphs.noHeartRate') }}</p>
  </GraphCard>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { onMounted, onUnmounted, ref, watch, computed } from 'vue'
import Chart from 'chart.js/auto'
import { Activity, ActivityDetails } from '@/types/activity'
import GraphCard from './GraphCard.vue'

const { t } = useI18n()

const cssVar = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

const props = defineProps<{ data: { activity: Activity; details: ActivityDetails } }>()

const details = computed(() => props.data.details)

const canvas = ref<HTMLCanvasElement | null>(null)
const chartInstance = ref<Chart | null>(null)

const heartSamples = computed(() => details.value.samples?.filter(s => s.heartRate != null) ?? [])

const hasData = computed(() => heartSamples.value.length > 0)
const bpmSeries = computed(() => heartSamples.value.map(s => s.heartRate!))
const labels = computed(() => heartSamples.value.map((_, i) => i))

const meanBPM = computed(() => {
  const sum = bpmSeries.value.reduce((a, b) => a + b, 0)
  return bpmSeries.value.length ? sum / bpmSeries.value.length : 0
})

onMounted(() => {
  if (!canvas.value || !hasData.value) return

  const ctx = canvas.value.getContext('2d')
  if (!ctx) return

  chartInstance.value = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.value,
      datasets: [
        {
          label: '',
          data: bpmSeries.value,
          borderColor: cssVar('--color-red-500', '#ef4444'),
          backgroundColor: cssVar('--color-red-500', '#ef4444') + '55',
          tension: 0.1,
          fill: true,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4
        },
        {
          label: 'Moyenne',
          data: Array(bpmSeries.value.length).fill(meanBPM.value),
          borderColor: cssVar('--color-gray-400', '#9ca3af'),
          borderWidth: 2,
          borderDash: [3, 3],
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { display: false },
        y: {
          title: { display: false, text: 'bpm' },
          beginAtZero: false,
          ticks: { font: { size: 12 }, color: cssVar('--color-gray-400', '#9ca3af') }
        }
      }
    }
  })
})

watch(
  () => props.data,
  () => {
    if (chartInstance.value) {
      chartInstance.value.destroy()
      chartInstance.value = null
    }
  }
)

onUnmounted(() => {
  if (chartInstance.value) {
    chartInstance.value.destroy()
    chartInstance.value = null
  }
})
</script>

<style scoped>
.graph-empty {
  font-size: 0.85rem;
  color: var(--text-muted);
}
</style>
