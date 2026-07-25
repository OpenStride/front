<template>
  <div class="period-filter" role="group" :aria-label="t('statistics.records.periodLabel')">
    <button
      v-for="period in RECORD_PERIODS"
      :key="period"
      type="button"
      :class="['filter-btn', { active: modelValue === period }]"
      :aria-pressed="modelValue === period"
      :data-test="`record-period-${period}`"
      @click="$emit('update:modelValue', period)"
    >
      {{ t(`statistics.records.period.${period}`) }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RECORD_PERIODS, type RecordPeriod } from '../types'

const { t } = useI18n()

defineProps<{
  modelValue: RecordPeriod
}>()

defineEmits<{
  'update:modelValue': [value: RecordPeriod]
}>()
</script>

<style scoped>
.period-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.filter-btn {
  padding: 0.3rem 0.75rem;
  border-radius: 20px;
  border: 1px solid var(--color-green-200);
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.8rem;
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s,
    border-color 0.2s;
  font-family: var(--font-main);
}

.filter-btn:hover {
  border-color: var(--color-green-400);
}

.filter-btn.active {
  background: var(--color-green-500);
  color: var(--color-white);
  border-color: var(--color-green-500);
}

@media (max-width: 640px) {
  .filter-btn {
    padding: 0.3rem 0.6rem;
    font-size: 0.75rem;
  }
}
</style>
