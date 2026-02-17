<template>
  <section class="section-card">
    <h3 class="section-title">
      <i class="fas fa-chart-line" aria-hidden="true"></i>
      {{ t('statistics.trends.title') }}
    </h3>

    <div class="period-toggle">
      <button
        v-for="g in granularities"
        :key="g"
        :class="['toggle-btn', { active: granularity === g }]"
        @click="granularity = g"
      >
        {{ t(`statistics.trends.${g}`) }}
      </button>
    </div>

    <div v-if="periodData.length === 0" class="empty-chart">
      {{ t('statistics.noData') }}
    </div>
    <template v-else>
      <div class="chart-container">
        <canvas ref="distanceCanvas"></canvas>
      </div>
      <div class="chart-container">
        <canvas ref="countCanvas"></canvas>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import Chart from 'chart.js/auto'
import type { Activity } from '@/types/activity'
import { toMs } from '../types'
import type { PeriodGranularity, PeriodData } from '../types'
import { getISOWeekKey, getMonthKey } from '@/services/AggregationService'

const { t } = useI18n()

const props = defineProps<{
  activities: Activity[]
}>()

const granularities: PeriodGranularity[] = ['week', 'month', 'year']
const granularity = ref<PeriodGranularity>('month')

const distanceCanvas = ref<HTMLCanvasElement | null>(null)
const countCanvas = ref<HTMLCanvasElement | null>(null)
let distanceChart: Chart | null = null
let countChart: Chart | null = null

function getYearKey(date: Date): string {
  return `${date.getFullYear()}`
}

function getPeriodKey(date: Date, g: PeriodGranularity): string {
  if (g === 'week') return getISOWeekKey(date)
  if (g === 'month') return getMonthKey(date)
  return getYearKey(date)
}

function formatPeriodLabel(key: string, g: PeriodGranularity): string {
  if (g === 'week') {
    const parts = key.split('-W')
    return `S${parts[1]}`
  }
  if (g === 'month') {
    const parts = key.split('-')
    return `${parts[1]}/${parts[0].slice(2)}`
  }
  return key
}

const periodData = computed<PeriodData[]>(() => {
  const map = new Map<string, PeriodData>()

  for (const a of props.activities) {
    const date = new Date(toMs(a.startTime))
    const key = getPeriodKey(date, granularity.value)
    const existing = map.get(key)
    if (existing) {
      existing.distance += (a.distance || 0) / 1000
      existing.duration += (a.duration || 0) / 3600
      existing.count += 1
    } else {
      map.set(key, {
        key,
        label: formatPeriodLabel(key, granularity.value),
        distance: (a.distance || 0) / 1000,
        duration: (a.duration || 0) / 3600,
        count: 1
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key))
})

function createOrUpdateCharts() {
  const labels = periodData.value.map(d => d.label)
  const distances = periodData.value.map(d => Math.round(d.distance * 10) / 10)
  const counts = periodData.value.map(d => d.count)

  const style = getComputedStyle(document.documentElement)
  const green500 = style.getPropertyValue('--color-green-500').trim() || '#88aa00'
  const green300 = style.getPropertyValue('--color-green-300').trim() || '#cbe56d'

  if (distanceChart) {
    distanceChart.data.labels = labels
    distanceChart.data.datasets[0].data = distances
    distanceChart.update()
  } else if (distanceCanvas.value) {
    distanceChart = new Chart(distanceCanvas.value, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: t('statistics.trends.distance'),
            data: distances,
            borderColor: green500,
            backgroundColor: `${green500}1a`,
            fill: true,
            tension: 0.3,
            pointRadius: 3
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

  if (countChart) {
    countChart.data.labels = labels
    countChart.data.datasets[0].data = counts
    countChart.update()
  } else if (countCanvas.value) {
    countChart = new Chart(countCanvas.value, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: t('statistics.trends.activities'),
            data: counts,
            backgroundColor: green300,
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
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        }
      }
    })
  }
}

function destroyCharts() {
  distanceChart?.destroy()
  distanceChart = null
  countChart?.destroy()
  countChart = null
}

watch([periodData, granularity], async () => {
  await nextTick()
  if (periodData.value.length > 0) {
    destroyCharts()
    createOrUpdateCharts()
  }
})

onMounted(async () => {
  await nextTick()
  if (periodData.value.length > 0) {
    createOrUpdateCharts()
  }
})

onUnmounted(() => {
  destroyCharts()
})
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

.period-toggle {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 1rem;
}

.toggle-btn {
  padding: 0.3rem 0.8rem;
  border-radius: 6px;
  border: 1px solid var(--color-green-200);
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.8rem;
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s;
  font-family: var(--font-main);
}

.toggle-btn.active {
  background: var(--color-green-500);
  color: #fff;
  border-color: var(--color-green-500);
}

.chart-container {
  width: 100%;
  height: 220px;
  margin-bottom: 1rem;
}

.chart-container:last-child {
  margin-bottom: 0;
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
</style>
