<template>
  <div class="manager" data-test="aggregate-manager">
    <!-- Suggestions first, and the form last: the form asks eight questions
         before producing anything, which is a lot to answer before knowing what
         the answers are worth. -->
    <div v-if="!editing && suggestions.length" class="suggestions" data-test="aggregate-presets">
      <p class="lead">{{ t('customAggregates.suggestionsLead') }}</p>
      <ul class="suggestions__list">
        <li v-for="preset in suggestions" :key="preset.id">
          <button
            type="button"
            class="suggestion"
            :data-test="`preset-${preset.id}`"
            @click="$emit('add-preset', preset)"
          >
            <i :class="preset.icon" aria-hidden="true"></i>
            {{ t(preset.labelKey) }}
            <i class="fas fa-plus suggestion__add" aria-hidden="true"></i>
          </button>
        </li>
      </ul>
    </div>

    <ul v-if="aggregates.length" class="rows">
      <li v-for="aggregate in aggregates" :key="aggregate.id" class="row">
        <label class="switch">
          <input
            type="checkbox"
            role="switch"
            :checked="!!aggregate.pinned"
            :aria-checked="!!aggregate.pinned"
            :aria-label="t('customAggregates.showOnDashboard', { name: aggregate.label })"
            :data-test="`pin-${aggregate.id}`"
            @change="$emit('toggle-pin', aggregate)"
          />
          <span class="switch__track" aria-hidden="true"></span>
        </label>

        <div class="row__text">
          <span class="row__label">{{ aggregate.label }}</span>
          <span class="row__desc">{{ describe(aggregate) }}</span>
        </div>

        <div class="row__actions">
          <button
            type="button"
            class="btn-icon"
            :aria-label="t('customAggregates.edit', { name: aggregate.label })"
            :data-test="`edit-${aggregate.id}`"
            @click="$emit('edit', aggregate)"
          >
            <i class="fas fa-pen" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            class="btn-icon"
            :aria-label="t('customAggregates.delete', { name: aggregate.label })"
            :data-test="`delete-${aggregate.id}`"
            @click="$emit('remove', aggregate)"
          >
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      </li>
    </ul>

    <p v-else-if="!editing" class="lead">{{ t('customAggregates.empty') }}</p>

    <AggregateEditForm
      v-if="editing"
      :report="report"
      :existing="edited"
      @save="$emit('save', $event)"
      @cancel="$emit('cancel')"
    />

    <button
      v-else
      type="button"
      class="btn-secondary"
      data-test="aggregate-new"
      @click="$emit('create')"
    >
      <i class="fas fa-sliders" aria-hidden="true"></i>
      {{ t('customAggregates.addCustom') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { usePluginContext } from '@/composables/usePluginContext'
import type { CapabilityReport } from '@/composables/useSampleCapabilities'
import type { CustomAggregate } from '@/types/customAggregate'
import { SAMPLE_FIELD_SPECS } from '@/types/sampleFields'
import { toDisplay, unitOf } from '../aggregateFormat'
import type { AggregatePreset } from '../aggregatePresets'
import AggregateEditForm from './AggregateEditForm.vue'
import type { Draft } from './AggregateEditForm.vue'

defineProps<{
  aggregates: CustomAggregate[]
  suggestions: AggregatePreset[]
  report: CapabilityReport | null
  editing: boolean
  edited: CustomAggregate | null
}>()

defineEmits<{
  'add-preset': [preset: AggregatePreset]
  'toggle-pin': [aggregate: CustomAggregate]
  edit: [aggregate: CustomAggregate]
  remove: [aggregate: CustomAggregate]
  create: []
  save: [draft: Draft]
  cancel: []
}>()

const { t } = useI18n()
const ctx = usePluginContext()

/** The rule read back in the reader's units — see the note on the card. */
function describe(aggregate: CustomAggregate): string {
  const measure = t(SAMPLE_FIELD_SPECS[aggregate.measure.field].labelKey)
  const op = t(`customAggregates.ops.${aggregate.measure.op}`)

  const bands = aggregate.where.map(filter => {
    const name = t(SAMPLE_FIELD_SPECS[filter.field].labelKey)
    const unit = unitOf(ctx.units, filter.field)
    const low = filter.min !== undefined ? show(filter.field, filter.min) : null
    const high = filter.max !== undefined ? show(filter.field, filter.max) : null

    if (low !== null && high !== null) return `${name} ${low}–${high} ${unit}`
    if (low !== null) return `${name} ≥ ${low} ${unit}`
    return `${name} < ${high} ${unit}`
  })

  return bands.length ? `${op} ${measure} — ${bands.join(', ')}` : `${op} ${measure}`
}

function show(field: CustomAggregate['measure']['field'], si: number): string {
  return String(Math.round(toDisplay(ctx.units, field, si) * 10) / 10)
}
</script>

<style scoped>
.manager {
  padding: 1rem;
  margin-bottom: 1rem;
  background: var(--background-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
}

.lead {
  margin: 0 0 0.6rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.suggestions {
  margin-bottom: 1rem;
}

.suggestions__list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.suggestion {
  display: inline-flex;
  gap: 0.45rem;
  align-items: center;
  padding: 0.45rem 0.7rem;
  font-size: 0.85rem;
  color: var(--text-color);
  cursor: pointer;
  background: var(--card-background);
  border: 1px dashed var(--border-color);
  border-radius: 999px;
}

.suggestion:hover {
  border-color: var(--primary-color);
  border-style: solid;
}

.suggestion__add {
  font-size: 0.7rem;
  color: var(--text-secondary);
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0;
  margin: 0 0 0.8rem;
  list-style: none;
}

.row {
  display: flex;
  gap: 0.7rem;
  align-items: center;
  padding: 0.55rem 0.7rem;
  background: var(--card-background);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
}

.row__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.row__label {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-color);
}

.row__desc {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.row__actions {
  display: flex;
  gap: 0.3rem;
}

.switch {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  cursor: pointer;
}

.switch input {
  position: absolute;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
  opacity: 0;
}

.switch__track {
  width: 2.2rem;
  height: 1.2rem;
  background: var(--border-color);
  border-radius: 999px;
  transition: background 0.15s ease;
}

.switch__track::after {
  display: block;
  width: 0.9rem;
  height: 0.9rem;
  margin: 0.15rem;
  content: '';
  background: var(--card-background);
  border-radius: 50%;
  transition: transform 0.15s ease;
}

.switch input:checked + .switch__track {
  background: var(--primary-color);
}

.switch input:checked + .switch__track::after {
  transform: translateX(1rem);
}

.btn-secondary,
.btn-icon {
  display: inline-flex;
  gap: 0.4rem;
  align-items: center;
  padding: 0.45rem 0.7rem;
  font-size: 0.9rem;
  color: var(--text-color);
  cursor: pointer;
  background: var(--card-background);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm, 6px);
}
</style>
