<template>
  <div class="activity-filters" data-test="activity-filters">
    <!-- Sport type chips -->
    <div class="filter-section">
      <label class="filter-label">{{ t('filters.sportType') }}</label>
      <div class="sport-chips">
        <button
          :class="['chip', { active: !modelValue.sportType }]"
          @click="updateFilter('sportType', '')"
        >
          {{ t('filters.allSports') }}
        </button>
        <button
          v-for="sport in sportOptions"
          :key="sport.value"
          :class="['chip', { active: modelValue.sportType === sport.value }]"
          @click="updateFilter('sportType', sport.value)"
        >
          <i :class="sport.icon" aria-hidden="true"></i>
          {{ sport.label }}
        </button>
      </div>
    </div>

    <!-- Distance range -->
    <div class="filter-section">
      <label class="filter-label">{{ t('filters.distance') }}</label>
      <div class="range-inputs">
        <div class="range-field">
          <input
            type="number"
            class="range-input"
            :placeholder="t('filters.min')"
            :value="distanceMinKm"
            min="0"
            step="1"
            data-test="distance-min"
            @input="onDistanceMin"
          />
          <span class="range-unit">km</span>
        </div>
        <span class="range-separator">-</span>
        <div class="range-field">
          <input
            type="number"
            class="range-input"
            :placeholder="t('filters.max')"
            :value="distanceMaxKm"
            min="0"
            step="1"
            data-test="distance-max"
            @input="onDistanceMax"
          />
          <span class="range-unit">km</span>
        </div>
      </div>
    </div>

    <!-- Ascent range -->
    <div class="filter-section">
      <label class="filter-label">{{ t('filters.ascent') }}</label>
      <div class="range-inputs">
        <div class="range-field">
          <input
            type="number"
            class="range-input"
            :placeholder="t('filters.min')"
            :value="modelValue.ascentMin"
            min="0"
            step="10"
            data-test="ascent-min"
            @input="onAscentMin"
          />
          <span class="range-unit">m</span>
        </div>
        <span class="range-separator">-</span>
        <div class="range-field">
          <input
            type="number"
            class="range-input"
            :placeholder="t('filters.max')"
            :value="modelValue.ascentMax"
            min="0"
            step="10"
            data-test="ascent-max"
            @input="onAscentMax"
          />
          <span class="range-unit">m</span>
        </div>
      </div>
    </div>

    <!-- Reset -->
    <button
      v-if="hasActiveFilters"
      class="reset-btn"
      data-test="filters-reset"
      @click="$emit('reset')"
    >
      <i class="fas fa-times" aria-hidden="true"></i>
      {{ t('filters.reset') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ActivityFilters } from '@/types/activity'
import { COMMON_SPORT_TYPES, formatSportType, getSportIcon } from '@/utils/sportLabels'

const { t } = useI18n()

const props = defineProps<{
  modelValue: ActivityFilters
  hasActiveFilters: boolean
  availableSports?: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ActivityFilters]
  reset: []
}>()

const sportOptions = computed(() => {
  const sports = props.availableSports?.length ? props.availableSports : COMMON_SPORT_TYPES
  return sports.map(s => ({
    value: s,
    label: formatSportType(s),
    icon: getSportIcon(s)
  }))
})

const distanceMinKm = computed(() =>
  props.modelValue.distanceMin != null ? props.modelValue.distanceMin / 1000 : undefined
)

const distanceMaxKm = computed(() =>
  props.modelValue.distanceMax != null ? props.modelValue.distanceMax / 1000 : undefined
)

function updateFilter(key: keyof ActivityFilters, value: string | number | undefined) {
  emit('update:modelValue', { ...props.modelValue, [key]: value || undefined })
}

function parseNumInput(e: Event): number | undefined {
  const val = (e.target as HTMLInputElement).value
  if (!val) return undefined
  const num = parseFloat(val)
  return isNaN(num) ? undefined : num
}

function onDistanceMin(e: Event) {
  const km = parseNumInput(e)
  updateFilter('distanceMin', km != null ? km * 1000 : undefined)
}

function onDistanceMax(e: Event) {
  const km = parseNumInput(e)
  updateFilter('distanceMax', km != null ? km * 1000 : undefined)
}

function onAscentMin(e: Event) {
  updateFilter('ascentMin', parseNumInput(e))
}

function onAscentMax(e: Event) {
  updateFilter('ascentMax', parseNumInput(e))
}
</script>

<style scoped>
.activity-filters {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  background: var(--color-white);
  border: 1px solid var(--color-gray-200);
  border-radius: 8px;
}

.filter-section {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.filter-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-gray-500);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.sport-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.chip {
  padding: 0.35rem 0.75rem;
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
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.chip:hover {
  border-color: var(--color-green-400);
}

.chip.active {
  background: var(--color-green-500);
  color: var(--color-white);
  border-color: var(--color-green-500);
}

.range-inputs {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.range-field {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.range-input {
  width: 100%;
  padding: 0.5rem 2.2rem 0.5rem 0.6rem;
  border: 1px solid var(--color-gray-200);
  border-radius: 6px;
  font-size: 0.85rem;
  font-family: var(--font-main);
  background: var(--color-white);
  color: var(--text-color);
  -moz-appearance: textfield;
}

.range-input::-webkit-outer-spin-button,
.range-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.range-input:focus {
  outline: none;
  border-color: var(--color-green-400);
}

.range-input::placeholder {
  color: var(--color-gray-400);
}

.range-unit {
  position: absolute;
  right: 0.6rem;
  color: var(--color-gray-400);
  font-size: 0.8rem;
  pointer-events: none;
}

.range-separator {
  color: var(--color-gray-400);
  font-size: 0.9rem;
}

.reset-btn {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.8rem;
  border: 1px solid var(--color-gray-200);
  border-radius: 6px;
  background: var(--color-white);
  color: var(--color-gray-500);
  font-size: 0.8rem;
  font-family: var(--font-main);
  cursor: pointer;
  transition: all 0.2s;
}

.reset-btn:hover {
  border-color: var(--color-red-500);
  color: var(--color-red-500);
}
</style>
