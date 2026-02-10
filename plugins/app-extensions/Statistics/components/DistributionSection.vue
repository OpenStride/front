<template>
  <section class="section-card">
    <h3 class="section-title">
      <i class="fas fa-chart-pie" aria-hidden="true"></i>
      {{ t('statistics.distribution.title') }}
    </h3>

    <div v-if="activities.length === 0" class="empty-chart">
      {{ t('statistics.noData') }}
    </div>

    <template v-else-if="!selectedSport">
      <div class="distribution-grid">
        <div class="chart-container chart-doughnut">
          <canvas ref="doughnutCanvas"></canvas>
        </div>
        <div class="chart-container chart-bar">
          <canvas ref="distanceCanvas"></canvas>
        </div>
        <div class="chart-container chart-bar">
          <canvas ref="durationCanvas"></canvas>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="chart-container chart-bar-single">
        <canvas ref="monthlyCanvas"></canvas>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import Chart from 'chart.js/auto'
import type { Activity } from '@/types/activity'
import { formatSportType } from '@plugins/app-extensions/Goals/sportLabels'
import { getMonthKey } from '@/services/AggregationService'
import { toMs } from '../types'

const { t } = useI18n()

const props = defineProps<{
  activities: Activity[]
  allActivities: Activity[]
  selectedSport: string
}>()

const doughnutCanvas = ref<HTMLCanvasElement | null>(null)
const distanceCanvas = ref<HTMLCanvasElement | null>(null)
const durationCanvas = ref<HTMLCanvasElement | null>(null)
const monthlyCanvas = ref<HTMLCanvasElement | null>(null)

let doughnutChart: Chart | null = null
let distanceChart: Chart | null = null
let durationChart: Chart | null = null
let monthlyChart: Chart | null = null

const sportColors = [
  '#88aa00',
  '#e06c00',
  '#0077b6',
  '#9b59b6',
  '#e74c3c',
  '#1abc9c',
  '#f39c12',
  '#34495e',
  '#e91e63',
  '#00bcd4'
]

function getSportData(activities: Activity[]) {
  const map = new Map<string, { count: number; distance: number; duration: number }>()
  for (const a of activities) {
    const sport = (a.type || 'other').toLowerCase()
    const existing = map.get(sport)
    if (existing) {
      existing.count++
      existing.distance += (a.distance || 0) / 1000
      existing.duration += (a.duration || 0) / 3600
    } else {
      map.set(sport, {
        count: 1,
        distance: (a.distance || 0) / 1000,
        duration: (a.duration || 0) / 3600
      })
    }
  }
  const entries = Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count)
  return {
    labels: entries.map(([s]) => formatSportType(s)),
    counts: entries.map(([, d]) => d.count),
    distances: entries.map(([, d]) => Math.round(d.distance * 10) / 10),
    durations: entries.map(([, d]) => Math.round(d.duration * 10) / 10),
    colors: entries.map((_, i) => sportColors[i % sportColors.length])
  }
}

function getMonthlyData(activities: Activity[]) {
  const map = new Map<string, number>()
  for (const a of activities) {
    const key = getMonthKey(new Date(toMs(a.startTime)))
    map.set(key, (map.get(key) || 0) + (a.distance || 0) / 1000)
  }
  const sorted = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  return {
    labels: sorted.map(([k]) => {
      const parts = k.split('-')
      return `${parts[1]}/${parts[0].slice(2)}`
    }),
    distances: sorted.map(([, v]) => Math.round(v * 10) / 10)
  }
}

function destroyAllCharts() {
  doughnutChart?.destroy()
  doughnutChart = null
  distanceChart?.destroy()
  distanceChart = null
  durationChart?.destroy()
  durationChart = null
  monthlyChart?.destroy()
  monthlyChart = null
}

function createSportCharts() {
  const data = getSportData(props.allActivities)
  if (data.labels.length === 0) return

  if (doughnutCanvas.value) {
    doughnutChart = new Chart(doughnutCanvas.value, {
      type: 'doughnut',
      data: {
        labels: data.labels,
        datasets: [{ data: data.counts, backgroundColor: data.colors, borderWidth: 0 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, padding: 8, font: { size: 11 } } }
        }
      }
    })
  }

  if (distanceCanvas.value) {
    distanceChart = new Chart(distanceCanvas.value, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: t('statistics.distribution.distanceKm'),
            data: data.distances,
            backgroundColor: data.colors,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true } }
      }
    })
  }

  if (durationCanvas.value) {
    durationChart = new Chart(durationCanvas.value, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: t('statistics.distribution.durationH'),
            data: data.durations,
            backgroundColor: data.colors,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true } }
      }
    })
  }
}

function createMonthlyChart() {
  const data = getMonthlyData(props.activities)
  if (data.labels.length === 0 || !monthlyCanvas.value) return

  const style = getComputedStyle(document.documentElement)
  const green500 = style.getPropertyValue('--color-green-500').trim() || '#88aa00'

  monthlyChart = new Chart(monthlyCanvas.value, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [
        {
          label: t('statistics.distribution.distanceKm'),
          data: data.distances,
          backgroundColor: green500,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true }
      }
    }
  })
}

async function render() {
  await nextTick()
  destroyAllCharts()
  await nextTick()
  if (props.selectedSport) {
    createMonthlyChart()
  } else {
    createSportCharts()
  }
}

watch([() => props.activities, () => props.selectedSport, () => props.allActivities], render)

onMounted(render)
onUnmounted(destroyAllCharts)
</script>

<style scoped>
.section-card {
  background: rgba(255, 255, 255, 0.92);
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  padding: 1.2rem 1.4rem;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.section-title i {
  color: var(--color-green-500);
}

.distribution-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.chart-doughnut {
  grid-column: 1 / -1;
  height: 260px;
}

.chart-bar {
  height: 200px;
}

.chart-bar-single {
  height: 260px;
}

.chart-container canvas {
  width: 100% !important;
  height: 100% !important;
}

.empty-chart {
  text-align: center;
  padding: 2rem;
  color: var(--text-color);
  opacity: 0.6;
}

@media (max-width: 640px) {
  .distribution-grid {
    grid-template-columns: 1fr;
  }
}
</style>
