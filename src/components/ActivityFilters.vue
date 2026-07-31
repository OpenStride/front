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

    <!-- Distance range. A library of pool lengths and gym sessions has no
         distance to narrow, so the control that asks for one stays away. -->
    <div v-if="hasDistance" class="filter-section" data-test="distance-section">
      <label class="filter-label">{{ t('filters.distance') }}</label>
      <div class="range-inputs">
        <div class="range-field">
          <input
            type="number"
            class="range-input"
            :placeholder="t('filters.min')"
            :value="distanceMinDisplay"
            min="0"
            step="1"
            data-test="distance-min"
            @input="onDistanceMin"
          />
          <span class="range-unit">{{ distanceUnit }}</span>
        </div>
        <span class="range-separator">-</span>
        <div class="range-field">
          <input
            type="number"
            class="range-input"
            :placeholder="t('filters.max')"
            :value="distanceMaxDisplay"
            min="0"
            step="1"
            data-test="distance-max"
            @input="onDistanceMax"
          />
          <span class="range-unit">{{ distanceUnit }}</span>
        </div>
      </div>
    </div>

    <!-- Date range: how one actually looks for a session again -->
    <div class="filter-section">
      <label class="filter-label">{{ t('filters.date') }}</label>
      <div class="range-inputs">
        <div class="range-field">
          <input
            type="date"
            class="range-input range-input--date"
            :value="dateFromDisplay"
            :max="dateToDisplay || undefined"
            :aria-label="t('filters.dateFrom')"
            data-test="date-from"
            @input="onDateFrom"
          />
        </div>
        <span class="range-separator">-</span>
        <div class="range-field">
          <input
            type="date"
            class="range-input range-input--date"
            :value="dateToDisplay"
            :min="dateFromDisplay || undefined"
            :aria-label="t('filters.dateTo')"
            data-test="date-to"
            @input="onDateTo"
          />
        </div>
      </div>
    </div>

    <!-- Duration range. The one volume every sport has: a pool set and a
         strength session have no distance, but they both took time. -->
    <div class="filter-section">
      <label class="filter-label">{{ t('filters.duration') }}</label>
      <div class="range-inputs">
        <div class="range-field">
          <input
            type="number"
            class="range-input"
            :placeholder="t('filters.min')"
            :value="durationMinDisplay"
            min="0"
            step="5"
            data-test="duration-min"
            @input="onDurationMin"
          />
          <span class="range-unit">{{ t('filters.minutes') }}</span>
        </div>
        <span class="range-separator">-</span>
        <div class="range-field">
          <input
            type="number"
            class="range-input"
            :placeholder="t('filters.max')"
            :value="durationMaxDisplay"
            min="0"
            step="5"
            data-test="duration-max"
            @input="onDurationMax"
          />
          <span class="range-unit">{{ t('filters.minutes') }}</span>
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
import { useUnits } from '@/composables/useUnits'
import { useI18n } from 'vue-i18n'
import type { ActivityFilters } from '@/types/activity'
import type { Dimension } from '@/types/units'
import { COMMON_SPORT_TYPES, formatSportType, getSportIcon } from '@/utils/sportLabels'
import { getDayKey, fromDayKey } from '@/utils/dateKeys'

const { t } = useI18n()

const props = defineProps<{
  modelValue: ActivityFilters
  hasActiveFilters: boolean
  availableSports?: string[]
  /** Whether the library holds anything measured in distance at all */
  hasDistance?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ActivityFilters]
  reset: []
}>()

const { convert } = useUnits()

const sportOptions = computed(() => {
  const sports = props.availableSports?.length ? props.availableSports : COMMON_SPORT_TYPES
  return sports.map(s => ({
    value: s,
    label: formatSportType(s),
    icon: getSportIcon(s)
  }))
})

// Filters are stored in SI; the input reads and writes in the user's unit.
const toDisplay = (dimension: Dimension, si?: number) =>
  si != null ? Number(convert(dimension, si).value.toFixed(2)) : undefined

const toSIValue = (dimension: Dimension, value: number) => value / convert(dimension, 1).value

const distanceUnit = computed(() => convert('distance', 0).unit)
const distanceMinDisplay = computed(() =>
  toDisplay('distance', props.modelValue.distanceMin ?? undefined)
)
const distanceMaxDisplay = computed(() =>
  toDisplay('distance', props.modelValue.distanceMax ?? undefined)
)

// Time is not a `Dimension`: a minute reads the same in both systems, so it
// needs the storage conversion (seconds) and no unit system.
const SECONDS_PER_MINUTE = 60
const toMinutes = (seconds?: number) =>
  seconds != null ? Math.round(seconds / SECONDS_PER_MINUTE) : undefined

const durationMinDisplay = computed(() => toMinutes(props.modelValue.durationMin ?? undefined))
const durationMaxDisplay = computed(() => toMinutes(props.modelValue.durationMax ?? undefined))

// `<input type="date">` speaks `YYYY-MM-DD` in both directions; the filter
// holds the local instant that bounds the day.
const dateFromDisplay = computed(() =>
  props.modelValue.dateFrom != null ? getDayKey(new Date(props.modelValue.dateFrom)) : ''
)
const dateToDisplay = computed(() =>
  props.modelValue.dateTo != null ? getDayKey(new Date(props.modelValue.dateTo)) : ''
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
  const entered = parseNumInput(e)
  updateFilter('distanceMin', entered != null ? toSIValue('distance', entered) : undefined)
}

function onDistanceMax(e: Event) {
  const entered = parseNumInput(e)
  updateFilter('distanceMax', entered != null ? toSIValue('distance', entered) : undefined)
}

function onDurationMin(e: Event) {
  const entered = parseNumInput(e)
  updateFilter('durationMin', entered != null ? entered * SECONDS_PER_MINUTE : undefined)
}

function onDurationMax(e: Event) {
  const entered = parseNumInput(e)
  updateFilter('durationMax', entered != null ? entered * SECONDS_PER_MINUTE : undefined)
}

// The bound lands on the edge of the day, so a single-day range keeps the
// activities of that day rather than only the ones logged at midnight.
function onDateFrom(e: Event) {
  updateFilter('dateFrom', fromDayKey((e.target as HTMLInputElement).value, 'start'))
}

function onDateTo(e: Event) {
  updateFilter('dateTo', fromDayKey((e.target as HTMLInputElement).value, 'end'))
}
</script>

<style scoped>
.activity-filters {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.85rem;
  /* Nested one level inside the controls panel, so it recedes rather than
     repeating the surface it sits on */
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}

.filter-section {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.filter-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
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
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-green-200);
  /* Raised on the recessed panel, the way the selected scope tab is */
  background: var(--surface);
  color: var(--text-color);
  font-size: 0.8rem;
  /* Same reason as the scope tabs: a sport name is a label, not a shout */
  text-transform: none;
  letter-spacing: 0;
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
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  font-family: var(--font-main);
  background: var(--surface);
  color: var(--text-color);
  -moz-appearance: textfield;
}

/* No trailing unit label to clear, and the native picker needs the room. */
.range-input--date {
  padding-right: 0.6rem;
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
  color: var(--text-faint);
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
