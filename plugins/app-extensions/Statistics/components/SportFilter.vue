<template>
  <div class="sport-filter">
    <select
      class="sport-select"
      :value="modelValue"
      :aria-label="t('statistics.sportFilter')"
      data-test="sport-filter"
      @change="onChange"
    >
      <option value="">{{ t('statistics.allSports') }}</option>
      <option v-for="sport in options" :key="sport.value" :value="sport.value">
        {{ sport.label }}
      </option>
    </select>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{
  modelValue: string
  options: { value: string; label: string }[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function onChange(event: Event) {
  emit('update:modelValue', (event.target as HTMLSelectElement).value)
}
</script>

<style scoped>
/*
 * One control, not one chip per sport.
 *
 * As chips this filter grew with the library: a reader with five sports got two
 * full rows above the fold on a phone, ahead of every figure the page exists to
 * show. A select costs one line whatever the count, and the phone renders it as
 * its own native picker.
 */
.sport-filter {
  display: flex;
  align-items: center;
  min-width: 0;
}

.sport-select {
  padding: 0.35rem 0.8rem;
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-green-200);
  background: var(--surface);
  color: var(--text-color);
  font-family: var(--font-main);
  font-size: 0.85rem;
  cursor: pointer;
  /* A sport name is short; letting the select size itself keeps it beside the
     title rather than stretched across the row. */
  max-width: 100%;
}

@media (max-width: 640px) {
  /* Tappable, like the other controls of the page. */
  .sport-select {
    min-height: 2.25rem;
  }
}

.sport-select:hover {
  border-color: var(--color-green-400);
}

.sport-select:focus-visible {
  outline: 2px solid var(--color-green-500);
  outline-offset: 1px;
}
</style>
