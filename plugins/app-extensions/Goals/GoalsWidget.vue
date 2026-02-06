<template>
  <div class="goals-widget">
    <div class="header-row">
      <h3 class="title">{{ t('goals.title') }}</h3>
      <button class="add-btn" :title="t('goals.addGoal')" @click="showForm = !showForm">
        <i class="fas fa-plus" aria-hidden="true"></i>
      </button>
    </div>

    <div v-if="goals.length > 0" class="period-nav">
      <button class="nav-btn" @click="shiftPeriod(-1)">
        <i class="fas fa-chevron-left" aria-hidden="true"></i>
      </button>
      <span class="period-label">{{ viewPeriodLabel }}</span>
      <button class="nav-btn" :disabled="periodOffset >= 0" @click="shiftPeriod(1)">
        <i class="fas fa-chevron-right" aria-hidden="true"></i>
      </button>
      <button v-if="periodOffset !== 0" class="today-btn" @click="goToToday">
        {{ t('goals.today') }}
      </button>
    </div>

    <GoalEditForm
      v-if="showForm"
      :available-sport-types="availableSportTypes"
      @save="onAddGoal"
      @cancel="showForm = false"
    />

    <div v-if="goals.length === 0 && !showForm" class="empty-state">
      <p class="empty-title">{{ t('goals.noGoals') }}</p>
      <p class="empty-hint">{{ t('goals.noGoalsHint') }}</p>
    </div>

    <div v-else-if="progressList.length > 0" class="goals-list">
      <GoalProgressBar
        v-for="progress in progressList"
        :key="progress.goal.id"
        :progress="progress"
        @delete="onDeleteGoal(progress.goal.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { aggregationService, getISOWeekKey, getMonthKey } from '@/services/AggregationService'
import { IndexedDBService } from '@/services/IndexedDBService'
import GoalProgressBar from './GoalProgressBar.vue'
import GoalEditForm from './GoalEditForm.vue'
import type { Goal, GoalsConfig, GoalProgress } from './types'
import type { Activity } from '@/types/activity'

const { t } = useI18n()

const goals = ref<Goal[]>([])
const progressList = ref<GoalProgress[]>([])
const availableSportTypes = ref<string[]>([])
const showForm = ref(false)
const periodOffset = ref(0) // 0 = current, -1 = previous week, etc.

let unsubscribe: (() => void) | null = null

// Compute the reference date based on offset (shifts by 7 days per step)
function getViewDate(): Date {
  const d = new Date()
  d.setDate(d.getDate() + periodOffset.value * 7)
  return d
}

function getPeriodKeyForDate(period: 'week' | 'month', date: Date): string {
  return period === 'week' ? getISOWeekKey(date) : getMonthKey(date)
}

// Label shown in the navigator
const viewPeriodLabel = computed(() => {
  const d = getViewDate()
  const weekKey = getISOWeekKey(d)
  const weekNum = weekKey.split('-W')[1]
  const monthName = t(`goals.monthNames.${d.getMonth()}`)
  return `${t('goals.periods.week')} ${weekNum} · ${monthName} ${d.getFullYear()}`
})

function shiftPeriod(delta: number) {
  periodOffset.value += delta
  if (periodOffset.value > 0) periodOffset.value = 0
}

function goToToday() {
  periodOffset.value = 0
}

async function loadConfig(): Promise<GoalsConfig> {
  const db = await IndexedDBService.getInstance()
  const config = await db.getData('goals_config')
  if (config && Array.isArray(config.goals)) {
    return config as GoalsConfig
  }
  return { version: 1, goals: [] }
}

async function saveConfig(config: GoalsConfig) {
  const db = await IndexedDBService.getInstance()
  await db.saveData('goals_config', config)
}

function getActivityPeriodKey(period: 'week' | 'month', startTime: number): string {
  const date = new Date(startTime < 1e11 ? startTime * 1000 : startTime)
  return period === 'week' ? getISOWeekKey(date) : getMonthKey(date)
}

async function loadSportTypes() {
  const db = await IndexedDBService.getInstance()
  const activities = (await db.getAllData('activities')) as Activity[]
  const types = new Set<string>()
  for (const act of activities) {
    if (act.type && !act.deleted) types.add(act.type)
  }
  availableSportTypes.value = Array.from(types).sort()
}

async function computeProgress(): Promise<GoalProgress[]> {
  const db = await IndexedDBService.getInstance()
  const activities = (await db.getAllData('activities')) as Activity[]
  const viewDate = getViewDate()
  const result: GoalProgress[] = []

  for (const goal of goals.value) {
    if (!goal.enabled) continue

    const periodKey = getPeriodKeyForDate(goal.period, viewDate)
    let currentValue = 0

    for (const act of activities) {
      if (act.deleted) continue
      if (goal.sportType && act.type !== goal.sportType) continue
      if (!act.startTime) continue

      const actPeriodKey = getActivityPeriodKey(goal.period, act.startTime)
      if (actPeriodKey !== periodKey) continue

      switch (goal.type) {
        case 'distance':
          currentValue += (act.distance || 0) * 0.001 // m -> km
          break
        case 'duration':
          currentValue += (act.duration || 0) / 3600 // s -> h
          break
        case 'count':
          currentValue += 1
          break
      }
    }

    const percentage = goal.targetValue > 0 ? (currentValue / goal.targetValue) * 100 : 0

    result.push({
      goal,
      currentValue,
      percentage,
      isComplete: percentage >= 100
    })
  }

  return result
}

async function refresh() {
  const config = await loadConfig()
  goals.value = config.goals
  progressList.value = await computeProgress()
}

async function onAddGoal(partial: Omit<Goal, 'id' | 'createdAt'>) {
  const config = await loadConfig()
  const newGoal: Goal = {
    ...partial,
    id: crypto.randomUUID(),
    createdAt: Date.now()
  }
  config.goals.push(newGoal)
  await saveConfig(config)
  showForm.value = false
  await refresh()
}

async function onDeleteGoal(id: string) {
  if (!confirm(t('goals.deleteConfirm'))) return
  const config = await loadConfig()
  config.goals = config.goals.filter(g => g.id !== id)
  await saveConfig(config)
  await refresh()
}

watch(periodOffset, () => refresh())

onMounted(async () => {
  await loadSportTypes()
  await refresh()
  unsubscribe = aggregationService.subscribe(() => {
    refresh()
  })
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})
</script>

<style scoped>
.goals-widget {
  background: rgba(255, 255, 255, 0.92);
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  padding: 1.2rem 1.4rem;
  margin-bottom: 0.5rem;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}

.add-btn {
  background: var(--color-green-50);
  border: 1px solid var(--color-green-200);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.9rem;
  color: var(--color-green-600);
  cursor: pointer;
  transition: background 0.2s;
}

.add-btn:hover {
  background: var(--color-green-100);
}

.period-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  margin-bottom: 0.7rem;
  padding: 0.4rem 0;
}

.nav-btn {
  background: none;
  border: 1px solid var(--color-green-200);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 0.8rem;
  color: var(--color-green-600);
  cursor: pointer;
  transition: background 0.2s;
}

.nav-btn:hover:not(:disabled) {
  background: var(--color-green-50);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.period-label {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-color);
  min-width: 160px;
  text-align: center;
}

.today-btn {
  background: var(--color-green-500);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: opacity 0.2s;
}

.today-btn:hover {
  opacity: 0.85;
}

.empty-state {
  text-align: center;
  padding: 1rem 0;
}

.empty-title {
  font-size: 0.95rem;
  color: var(--text-color);
  margin: 0 0 0.3rem;
}

.empty-hint {
  font-size: 0.85rem;
  color: var(--color-green-600);
  margin: 0;
}

.goals-list {
  display: flex;
  flex-direction: column;
}
</style>
