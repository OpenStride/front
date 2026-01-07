<template>
  <div class="bg-white rounded-lg shadow p-4">
    <div class="flex justify-between items-center mb-2">
        <h3 class="text-xl font-semibold mb-5 flex items-center gap-2">
          <svg class="w-5 h-5 text-rose-500" fill="#b75e38" viewBox="0 0 24 24">
            <path d="M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4a4.9 4.9 0 0 1 3.5 1.5A4.9 4.9 0 0 1 13.5 4C16 4 18 6 18 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z"/>
          </svg>
          Fréquence Cardiaque
        </h3>
      <span v-if="hasData" class="text-sm text-gray-600">Moyenne: {{ Math.round(meanBPM) }} bpm</span>
    </div>
    <div v-if="hasData">
      <canvas ref="canvas" height="180"></canvas>
    </div>
    <p v-else class="text-gray-500 text-sm">Aucune donnée de fréquence cardiaque disponible.</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, computed } from 'vue'
import Chart from 'chart.js/auto'
import { Activity, ActivityDetails } from '@/types/activity'

const props = defineProps<{ data: { activity: Activity; details: ActivityDetails } }>()

const activity = computed(() => props.data.activity)
const details = computed(() => props.data.details)

const canvas = ref<HTMLCanvasElement | null>(null)
const chartInstance = ref<Chart | null>(null)

const heartSamples = computed(() =>
  details.value.samples?.filter(s => s.heartRate != null) ?? []
)

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
          borderColor: '#b75e38',
          backgroundColor: '#b75e3855',
          tension: 0.1,
          fill: true,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4
        },
        {
          label: 'Moyenne',
          data: Array(bpmSeries.value.length).fill(meanBPM.value),
          borderColor: '#999',
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
          beginAtZero: false
        }
      }
    }
  })
})

watch(() => props.data, () => {
  if (chartInstance.value) {
    chartInstance.value.destroy()
    chartInstance.value = null
  }
})

onUnmounted(() => {
  if (chartInstance.value) {
    chartInstance.value.destroy()
    chartInstance.value = null
  }
})
</script>

<style scoped>
canvas {
  width: 100% !important;
  max-width: 100%;
}
</style>
