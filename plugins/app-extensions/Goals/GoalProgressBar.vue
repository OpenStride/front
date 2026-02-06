<template>
  <div class="goal-progress-bar" :class="{ 'goal-complete': progress.isComplete }">
    <div class="goal-header">
      <div class="goal-info">
        <span class="goal-type">{{ typeLabel }}</span>
        <span v-if="sportLabel" class="goal-sport">{{ sportLabel }}</span>
        <span class="goal-frequency">{{ frequencyLabel }}</span>
      </div>
      <button class="goal-delete-btn" :title="t('common.delete')" @click="$emit('delete')">
        <i class="fas fa-trash-alt" aria-hidden="true"></i>
      </button>
    </div>
    <div class="goal-values">
      <span class="goal-current">{{ formattedCurrent }}</span>
      <span class="goal-separator">/</span>
      <span class="goal-target">{{ formattedTarget }}</span>
      <span class="goal-unit">{{ unitLabel }}</span>
      <span class="goal-percentage">{{ Math.min(100, Math.round(progress.percentage)) }}%</span>
    </div>
    <div class="bar-track">
      <div class="bar-fill" :style="{ width: Math.min(100, progress.percentage) + '%' }"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GoalProgress } from './types'
import { formatSportType } from './sportLabels'

const { t } = useI18n()

const props = defineProps<{
  progress: GoalProgress
}>()

defineEmits<{
  delete: []
}>()

const typeLabel = computed(() => t(`goals.types.${props.progress.goal.type}`))

const frequencyLabel = computed(() =>
  t(`goals.periodLabels.${props.progress.goal.period === 'week' ? 'weekly' : 'monthly'}`)
)

const sportLabel = computed(() => {
  const sport = props.progress.goal.sportType
  if (!sport) return ''
  return formatSportType(sport)
})

const unitLabel = computed(() => {
  switch (props.progress.goal.type) {
    case 'distance':
      return t('goals.units.km')
    case 'count':
      return t('goals.units.activities')
    case 'duration':
      return t('goals.units.hours')
    default:
      return ''
  }
})

const formattedCurrent = computed(() => {
  const val = props.progress.currentValue
  if (props.progress.goal.type === 'count') return Math.round(val).toString()
  return val.toFixed(1)
})

const formattedTarget = computed(() => {
  const val = props.progress.goal.targetValue
  if (props.progress.goal.type === 'count') return Math.round(val).toString()
  return val.toFixed(1)
})
</script>

<style scoped>
.goal-progress-bar {
  padding: 0.8rem 0;
}

.goal-progress-bar + .goal-progress-bar {
  border-top: 1px solid var(--color-green-100);
}

.goal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.3rem;
}

.goal-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.goal-type {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text-color);
}

.goal-sport {
  font-size: 0.8rem;
  color: var(--color-green-800);
  background: var(--color-green-100);
  padding: 1px 8px;
  border-radius: 10px;
}

.goal-frequency {
  font-size: 0.8rem;
  color: var(--color-green-700);
  background: var(--color-green-50);
  padding: 1px 8px;
  border-radius: 10px;
}

.goal-delete-btn {
  background: none;
  border: none;
  color: var(--color-green-600);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 0.85rem;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.goal-delete-btn:hover {
  opacity: 1;
}

.goal-values {
  display: flex;
  align-items: baseline;
  gap: 0.2rem;
  margin-bottom: 0.4rem;
  font-size: 0.9rem;
}

.goal-current {
  font-weight: 700;
  color: var(--color-green-600);
}

.goal-separator {
  color: var(--color-green-300);
}

.goal-target {
  color: var(--text-color);
}

.goal-unit {
  color: var(--color-green-700);
  font-size: 0.85rem;
}

.goal-percentage {
  margin-left: auto;
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--color-green-600);
}

.bar-track {
  height: 8px;
  background: var(--color-green-100);
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-green-400), var(--color-green-500));
  border-radius: 4px;
  transition: width 0.4s ease;
}

.goal-complete .bar-fill {
  background: linear-gradient(90deg, var(--color-green-600), var(--color-green-700));
  animation: pulse-complete 1.5s ease-in-out;
}

.goal-complete .goal-percentage {
  color: var(--color-green-700);
}

@keyframes pulse-complete {
  0% {
    opacity: 0.7;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 1;
  }
}
</style>
