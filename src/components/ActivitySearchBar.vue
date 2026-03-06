<template>
  <div class="activity-search-bar">
    <div class="search-row">
      <div class="search-input-wrapper">
        <i class="fas fa-search search-icon" aria-hidden="true"></i>
        <input
          type="text"
          class="search-input"
          :placeholder="t('filters.searchPlaceholder')"
          :value="modelValue"
          data-test="search-input"
          @input="onInput"
        />
        <button
          v-if="modelValue"
          class="clear-btn"
          data-test="search-clear"
          @click="$emit('update:modelValue', '')"
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>
      <button
        class="filter-toggle-btn"
        :class="{ active: filtersOpen, 'has-filters': hasActiveFilters }"
        data-test="filter-toggle"
        @click="$emit('toggle-filters')"
      >
        <i class="fas fa-sliders-h" aria-hidden="true"></i>
        <span v-if="activeFilterCount" class="filter-badge">{{ activeFilterCount }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { debounce } from '@/utils/debounce'

const { t } = useI18n()

defineProps<{
  modelValue: string
  filtersOpen: boolean
  hasActiveFilters: boolean
  activeFilterCount: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'toggle-filters': []
}>()

const debouncedEmit = debounce((value: string) => {
  emit('update:modelValue', value)
}, 300)

function onInput(e: Event) {
  const value = (e.target as HTMLInputElement).value
  debouncedEmit(value)
}
</script>

<style scoped>
.search-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.search-input-wrapper {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 0.75rem;
  color: var(--color-gray-400);
  font-size: 0.875rem;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 0.6rem 2rem 0.6rem 2.25rem;
  border: 1px solid var(--color-gray-200);
  border-radius: 8px;
  font-size: 0.9rem;
  font-family: var(--font-main);
  background: var(--color-white);
  color: var(--text-color);
  transition: border-color 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: var(--color-green-400);
}

.search-input::placeholder {
  color: var(--color-gray-400);
}

.clear-btn {
  position: absolute;
  right: 0.5rem;
  background: none;
  border: none;
  color: var(--color-gray-400);
  cursor: pointer;
  padding: 0.25rem;
  font-size: 0.85rem;
}

.clear-btn:hover {
  color: var(--color-gray-600);
}

.filter-toggle-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--color-gray-200);
  border-radius: 8px;
  background: var(--color-white);
  color: var(--color-gray-500);
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.filter-toggle-btn:hover {
  border-color: var(--color-green-400);
  color: var(--color-green-600);
}

.filter-toggle-btn.active {
  border-color: var(--color-green-500);
  color: var(--color-green-600);
  background: var(--color-green-50);
}

.filter-toggle-btn.has-filters {
  border-color: var(--color-green-500);
  color: var(--color-green-600);
}

.filter-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: var(--color-green-500);
  color: var(--color-white);
  font-size: 0.65rem;
  font-weight: 600;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
