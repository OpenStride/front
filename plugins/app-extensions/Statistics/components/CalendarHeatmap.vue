<template>
  <section class="section-card">
    <h3 class="section-title">
      <i class="fas fa-calendar-alt" aria-hidden="true"></i>
      {{ t('statistics.heatmap.title') }}
    </h3>

    <div class="heatmap-controls">
      <button
        v-for="m in metrics"
        :key="m"
        :class="['toggle-btn', { active: metric === m }]"
        @click="metric = m"
      >
        {{ t(`statistics.heatmap.${m}`) }}
      </button>
    </div>

    <div class="heatmap-layout">
      <div class="heatmap-days">
        <div class="day-spacer"></div>
        <div class="day-grid">
          <span class="day-label" :style="{ gridRow: 1 }"></span>
          <span class="day-label" :style="{ gridRow: 2 }">{{ dayLabels[1] }}</span>
          <span class="day-label" :style="{ gridRow: 3 }"></span>
          <span class="day-label" :style="{ gridRow: 4 }">{{ dayLabels[3] }}</span>
          <span class="day-label" :style="{ gridRow: 5 }"></span>
          <span class="day-label" :style="{ gridRow: 6 }">{{ dayLabels[5] }}</span>
          <span class="day-label" :style="{ gridRow: 7 }"></span>
        </div>
      </div>
      <div ref="scrollArea" class="heatmap-scroll">
        <div class="heatmap-inner" :style="{ width: totalWeeks * 14 + 'px' }">
          <div
            class="heatmap-months"
            :style="{ gridTemplateColumns: `repeat(${totalWeeks}, 12px)` }"
          >
            <span
              v-for="(ml, idx) in monthPositions"
              :key="idx"
              class="month-label"
              :style="{ gridColumn: ml.col }"
              >{{ ml.label }}</span
            >
          </div>
          <div class="heatmap-grid" :style="{ gridTemplateColumns: `repeat(${totalWeeks}, 12px)` }">
            <div
              v-for="(cell, i) in cells"
              :key="i"
              :class="['heatmap-cell', `level-${cell.level}`]"
              :title="cell.tooltip"
              :style="{ gridRow: cell.row, gridColumn: cell.col }"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <div class="heatmap-legend">
      <span class="legend-label">{{ t('statistics.heatmap.less') }}</span>
      <div class="heatmap-cell level-0"></div>
      <div class="heatmap-cell level-1"></div>
      <div class="heatmap-cell level-2"></div>
      <div class="heatmap-cell level-3"></div>
      <div class="heatmap-cell level-4"></div>
      <span class="legend-label">{{ t('statistics.heatmap.more') }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Activity } from '@/types/activity'
import { toMs } from '../types'
import type { HeatmapMetric } from '../types'

const { t } = useI18n()

const props = defineProps<{
  activities: Activity[]
}>()

const metrics: HeatmapMetric[] = ['distance', 'duration', 'count']
const metric = ref<HeatmapMetric>('distance')
const dayLabels = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const scrollArea = ref<HTMLElement | null>(null)

function scrollToEnd() {
  nextTick(() => {
    if (scrollArea.value) {
      scrollArea.value.scrollLeft = scrollArea.value.scrollWidth
    }
  })
}

onMounted(scrollToEnd)
watch(() => props.activities, scrollToEnd)

function toDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const dayData = computed(() => {
  const map = new Map<string, { distance: number; duration: number; count: number }>()
  for (const a of props.activities) {
    const key = toDayKey(new Date(toMs(a.startTime)))
    const existing = map.get(key)
    if (existing) {
      existing.distance += (a.distance || 0) / 1000
      existing.duration += (a.duration || 0) / 3600
      existing.count++
    } else {
      map.set(key, {
        distance: (a.distance || 0) / 1000,
        duration: (a.duration || 0) / 3600,
        count: 1
      })
    }
  }
  return map
})

function getStartDate(): Date {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  d.setDate(d.getDate() + 1)
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

const monthNames = [
  'Jan',
  'Fev',
  'Mar',
  'Avr',
  'Mai',
  'Jun',
  'Jul',
  'Aou',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]

const monthPositions = computed(() => {
  const start = getStartDate()
  const positions: { label: string; col: number }[] = []
  let lastMonth = -1
  for (let w = 0; w < 53; w++) {
    const d = new Date(start)
    d.setDate(d.getDate() + w * 7)
    if (d.getMonth() !== lastMonth) {
      positions.push({ label: monthNames[d.getMonth()], col: w + 1 })
      lastMonth = d.getMonth()
    }
  }
  return positions
})

const totalWeeks = computed(() => {
  const start = getStartDate()
  const today = new Date()
  const diffDays = Math.ceil((today.getTime() - start.getTime()) / 86400000)
  return Math.ceil(diffDays / 7) + 1
})

const cells = computed(() => {
  const start = getStartDate()
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  const allCells: { row: number; col: number; level: number; tooltip: string }[] = []
  const values: number[] = []
  const dayEntries: { key: string; row: number; col: number; value: number }[] = []
  const d = new Date(start)

  let col = 1
  while (d <= today) {
    const dayOfWeek = d.getDay()
    const row = dayOfWeek === 0 ? 7 : dayOfWeek
    const key = toDayKey(d)
    const data = dayData.value.get(key)
    let value = 0
    if (data) {
      if (metric.value === 'distance') value = data.distance
      else if (metric.value === 'duration') value = data.duration
      else value = data.count
    }
    dayEntries.push({ key, row, col, value })
    if (value > 0) values.push(value)

    d.setDate(d.getDate() + 1)
    if (d.getDay() === 1) col++
  }

  if (values.length === 0) {
    return dayEntries.map(e => ({
      row: e.row,
      col: e.col,
      level: 0,
      tooltip: e.key
    }))
  }

  values.sort((a, b) => a - b)
  const q1 = values[Math.floor(values.length * 0.25)]
  const q2 = values[Math.floor(values.length * 0.5)]
  const q3 = values[Math.floor(values.length * 0.75)]

  function getLevel(v: number): number {
    if (v === 0) return 0
    if (v <= q1) return 1
    if (v <= q2) return 2
    if (v <= q3) return 3
    return 4
  }

  for (const e of dayEntries) {
    const data = dayData.value.get(e.key)
    let tooltip = e.key
    if (data) {
      if (metric.value === 'distance')
        tooltip = `${e.key}: ${Math.round(data.distance * 10) / 10} km`
      else if (metric.value === 'duration')
        tooltip = `${e.key}: ${Math.round(data.duration * 10) / 10} h`
      else tooltip = `${e.key}: ${data.count} activite(s)`
    }
    allCells.push({
      row: e.row,
      col: e.col,
      level: getLevel(e.value),
      tooltip
    })
  }

  return allCells
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

.heatmap-controls {
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

.heatmap-layout {
  display: flex;
  gap: 4px;
}

.heatmap-days {
  flex-shrink: 0;
  width: 18px;
}

.day-spacer {
  height: 16px;
}

.day-grid {
  display: grid;
  grid-template-rows: repeat(7, 12px);
  gap: 2px;
}

.day-label {
  font-size: 0.6rem;
  color: var(--text-color);
  opacity: 0.6;
  line-height: 12px;
}

.heatmap-scroll {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.heatmap-scroll::-webkit-scrollbar {
  display: none;
}

.heatmap-inner {
  min-width: fit-content;
}

.heatmap-months {
  display: grid;
  gap: 2px;
  height: 14px;
  margin-bottom: 2px;
}

.month-label {
  font-size: 0.6rem;
  color: var(--text-color);
  opacity: 0.6;
  white-space: nowrap;
  line-height: 14px;
}

.heatmap-grid {
  display: grid;
  grid-template-rows: repeat(7, 12px);
  gap: 2px;
}

.heatmap-cell {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.level-0 {
  background: #ebedf0;
}
.level-1 {
  background: var(--color-green-100);
}
.level-2 {
  background: var(--color-green-300);
}
.level-3 {
  background: var(--color-green-500);
}
.level-4 {
  background: var(--color-green-700);
}

.heatmap-legend {
  display: flex;
  align-items: center;
  gap: 3px;
  justify-content: flex-end;
  margin-top: 0.8rem;
}

.heatmap-legend .heatmap-cell {
  width: 10px;
  height: 10px;
}

.legend-label {
  font-size: 0.7rem;
  color: var(--text-color);
  opacity: 0.6;
  margin: 0 4px;
}
</style>
