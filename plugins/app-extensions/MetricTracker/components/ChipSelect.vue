<template>
  <div class="chip-select" role="group" :aria-label="ariaLabel">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :class="['chip', { active: modelValue === option.value }]"
      :aria-pressed="modelValue === option.value"
      :data-test="`${testPrefix}-${option.value || 'all'}`"
      @click="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string
  options: { value: string; label: string }[]
  ariaLabel: string
  testPrefix: string
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<style scoped>
.chip-select {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.chip {
  padding: 0.35rem 0.8rem;
  border-radius: 20px;
  border: 1px solid var(--color-green-200);
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 0.82rem;
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s,
    border-color 0.2s;
  font-family: var(--font-main);
}

.chip:hover {
  border-color: var(--color-green-400);
}

.chip.active {
  background: var(--color-green-500);
  color: var(--color-white);
  border-color: var(--color-green-500);
}
</style>
