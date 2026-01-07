<template>
  <div class="bg-white rounded-lg shadow p-4">
    <h3 class="text-lg font-semibold mb-2">Allure Moyenne par Km & Altitude</h3>
    <canvas ref="canvas" height="240"></canvas>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import Chart from 'chart.js/auto'
import type { Activity, ActivityDetails } from '@/types/activity'

const props = defineProps<{ data: { activity: Activity; details: ActivityDetails } }>()

const activity = computed(() => props.data.activity)
const samples = computed(() => props.data.details.samples ?? [])

const canvas = ref<HTMLCanvasElement | null>(null)

const getDataPerKm = () => {
  const perKm: { pace: number, speed: number, elevation: number }[] = []
  let lastKm = 0
  let segment: any[] = []

  for (const sample of samples.value) {
    const dist = sample.distance ?? 0
    const speed = sample.speed ?? 0
    if (dist < lastKm * 1000 || speed <= 0) continue

    segment.push(sample)

    if (dist >= (lastKm + 1) * 1000) {
      const avgSpeed = segment.reduce((sum, s) => sum + (s.speed ?? 0), 0) / segment.length
      const avgPace = avgSpeed > 0 ? 1000 / avgSpeed : 0
      const avgElevation = segment.reduce((sum, s) => sum + (s.elevation ?? 0), 0) / segment.length

      perKm.push({ pace: avgPace, speed: avgSpeed, elevation: avgElevation })
      lastKm++
      segment = []
    }
  }

  return perKm
}

function getBarColors(paces: number[]) {
  const max = Math.max(...paces)
  return paces.map(pace => {
    const ratio = pace / max
    const lightness = Math.floor(35 + (1 - ratio) * 65)
    return `hsla(75, 70%, ${lightness}%, 0.7)`
  })
}

function getClosestY(points: { x: number; y: number }[], targetX: number) {
  let closest = points[0]
  let minDiff = Math.abs(targetX - closest.x)
  for (const p of points) {
    const diff = Math.abs(targetX - p.x)
    if (diff < minDiff) {
      closest = p
      minDiff = diff
    }
  }
  return closest.y
}

onMounted(() => {
  const ctx = canvas.value?.getContext('2d')
  if (!ctx) return

  const perKm = getDataPerKm()
  const labels = perKm.map((_, i) => `${i + 1} km`)

  const speeds = perKm.map(p => p.speed)
  const minSpeed = Math.min(...speeds)
  const maxSpeed = Math.max(...speeds)

  const roundDown = (v: number, step = 0.5) => Math.floor(v / step) * step
  const roundUp = (v: number, step = 0.5) => Math.ceil(v / step) * step

  const elevationPoints = samples.value
    .filter(p => typeof p.distance === 'number' && typeof p.elevation === 'number')
    .map(p => ({
      x: (p.distance ?? 0) / 1000 - 0.5,
      y: p.elevation!
    }))

  const yMin = roundDown(minSpeed - 15 / 60)
  const yMax = roundUp(maxSpeed)

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Allure (min/km)',
          data: speeds,
          backgroundColor: getBarColors(speeds),
          yAxisID: 'y1',
          barPercentage: 1,
          categoryPercentage: 0.95,
          borderSkipped: false
        },
        {
          type: 'line',
          label: 'Altitude (m)',
          data: elevationPoints,
          borderColor: '#888888',
          borderWidth: 0,
          parsing: false,
          fill: true,
          yAxisID: 'y2',
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 4
        }
      ]
    },
    options: {
      plugins: {
        tooltip: {
          position: 'nearest',
          callbacks: {
            label: (tooltipItem) => {
              const { dataset, dataIndex } = tooltipItem
              if (dataset.type === 'line') {
                const elevation = getClosestY(dataset.data as any, dataIndex)
                return `${Math.round(elevation)} m`
              }
              const speed = dataset.data[dataIndex] as number
              const value = 1000 / 60 / speed
              const min = Math.floor(value)
              const sec = Math.round((value * 60) % 60)
              return `${dataset.label}: ${min}:${String(sec).padStart(2, '0')}`
            }
          }
        }
      },
      interaction: {
        mode: 'index',
        axis: 'y'
      },
      responsive: true,
      scales: {
        y1: {
          type: 'linear',
          position: 'left',
          title: { display: false, text: 'Allure (min/km)' },
          min: yMin,
          max: yMax,
          fill: 'start',
          ticks: {
            stepSize: 0.5,
            callback: (speed: number) => {
              const value = 1000 / 60 / speed
              const min = Math.floor(value)
              const sec = Math.round((value * 60) % 60)
              return `${min}:${String(sec).padStart(2, '0')}`
            }
          }
        },
        y2: {
          type: 'linear',
          position: 'right',
          display: false,
          title: { display: false, text: 'Altitude (m)' },
          beginAtZero: false,
          grid: { drawOnChartArea: false }
        }
      }
    }
  })
})
</script>

<style scoped>
canvas {
  width: 100% !important;
  max-width: 100%;
}
</style>
