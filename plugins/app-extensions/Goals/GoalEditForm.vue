<template>
  <div class="goal-edit-form">
    <div class="form-row">
      <select v-model="goalType" class="form-select">
        <option value="distance">{{ t('goals.types.distance') }}</option>
        <option value="count">{{ t('goals.types.count') }}</option>
        <option value="duration">{{ t('goals.types.duration') }}</option>
      </select>
      <select v-model="goalPeriod" class="form-select">
        <option value="week">{{ t('goals.periods.week') }}</option>
        <option value="month">{{ t('goals.periods.month') }}</option>
      </select>
    </div>
    <div class="form-row">
      <select v-model="sportType" class="form-select">
        <option value="">{{ t('goals.allSports') }}</option>
        <option v-for="sport in availableSportTypes" :key="sport" :value="sport">
          {{ formatSportType(sport) }}
        </option>
      </select>
    </div>
    <div class="form-row">
      <div class="input-group">
        <input
          v-model.number="targetValue"
          type="number"
          min="0"
          step="any"
          class="form-input"
          :placeholder="targetPlaceholder"
        />
        <span class="input-unit">{{ unitLabel }}</span>
      </div>
      <div class="form-actions">
        <button class="btn-confirm" :disabled="!isValid" @click="onSave">
          <i class="fas fa-check" aria-hidden="true"></i>
        </button>
        <button class="btn-cancel" @click="$emit('cancel')">
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GoalType, GoalPeriod, Goal } from './types'
import { formatSportType } from './sportLabels'

const { t } = useI18n()

defineProps<{
  availableSportTypes: string[]
}>()

const emit = defineEmits<{
  save: [goal: Omit<Goal, 'id' | 'createdAt'>]
  cancel: []
}>()

const goalType = ref<GoalType>('distance')
const goalPeriod = ref<GoalPeriod>('week')
const sportType = ref('')
const targetValue = ref<number | null>(null)

const unitLabel = computed(() => {
  switch (goalType.value) {
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

const targetPlaceholder = computed(() => {
  switch (goalType.value) {
    case 'distance':
      return t('goals.form.distanceKm')
    case 'count':
      return t('goals.form.activityCount')
    case 'duration':
      return t('goals.form.durationHours')
    default:
      return ''
  }
})

const isValid = computed(() => targetValue.value != null && targetValue.value > 0)

function onSave() {
  if (!isValid.value) return
  emit('save', {
    type: goalType.value,
    period: goalPeriod.value,
    targetValue: targetValue.value!,
    sportType: sportType.value || undefined,
    enabled: true
  })
}
</script>

<style scoped>
.goal-edit-form {
  border: 2px dashed var(--color-green-400);
  background: var(--color-green-50);
  border-radius: 8px;
  padding: 0.8rem;
  margin-bottom: 0.5rem;
}

.form-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.form-row + .form-row {
  margin-top: 0.5rem;
}

.form-select {
  flex: 1;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--color-green-200);
  border-radius: 6px;
  background: white;
  font-size: 0.9rem;
  color: var(--text-color);
}

.input-group {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.form-input {
  flex: 1;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--color-green-200);
  border-radius: 6px;
  font-size: 0.9rem;
  min-width: 0;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-green-500);
}

.input-unit {
  font-size: 0.85rem;
  color: var(--color-green-700);
  white-space: nowrap;
}

.form-actions {
  display: flex;
  gap: 0.3rem;
}

.btn-confirm,
.btn-cancel {
  border: none;
  border-radius: 6px;
  padding: 0.4rem 0.7rem;
  font-size: 0.9rem;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-confirm {
  background: var(--color-green-500);
  color: white;
}

.btn-confirm:disabled {
  opacity: 0.4;
  cursor: default;
}

.btn-cancel {
  background: var(--color-green-100);
  color: var(--color-green-700);
}
</style>
