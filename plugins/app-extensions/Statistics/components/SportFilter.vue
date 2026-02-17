<template>
  <div class="sport-filter">
    <button
      :class="['filter-btn', { active: !modelValue }]"
      @click="$emit('update:modelValue', '')"
    >
      {{ t('statistics.allSports') }}
    </button>
    <button
      v-for="sport in options"
      :key="sport.value"
      :class="['filter-btn', { active: modelValue === sport.value }]"
      @click="$emit('update:modelValue', sport.value)"
    >
      {{ sport.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{
  modelValue: string
  options: { value: string; label: string }[]
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<style scoped>
.sport-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.filter-btn {
  padding: 0.4rem 0.9rem;
  border-radius: 20px;
  border: 1px solid var(--color-green-200);
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.85rem;
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
  color: #fff;
  border-color: var(--color-green-500);
}
</style>
