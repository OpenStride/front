<template>
  <div class="chip-select" role="group" :aria-label="groupLabel">
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

<script setup lang="ts" generic="T extends string">
/**
 * Generic over the value type so `v-model` round-trips a union.
 *
 * Declared as plain `string`, the emit widened whatever came back: a parent
 * holding a `Ref<Granularity>` could not accept it, and three call sites were
 * quietly mistyped. A chip select does not care what the value is, only that it
 * can be compared and used as a key — which is exactly what a constraint says.
 */
defineProps<{
  modelValue: T
  options: { value: T; label: string }[]
  /**
   * Named `groupLabel`, not `ariaLabel`: Vue treats `aria-*` in a template as an
   * HTML attribute and never camelizes it into a prop, so `:aria-label` fell
   * through to the root instead of binding. The group stayed labelled purely by
   * that accident, and the declared prop was always undefined.
   */
  groupLabel: string
  testPrefix: string
}>()

defineEmits<{
  'update:modelValue': [value: T]
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
