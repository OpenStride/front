<template>
  <form class="aggregate-form" @submit.prevent="onSubmit">
    <div class="form-row">
      <input
        v-model="label"
        type="text"
        class="form-input grow"
        :placeholder="t('customAggregates.form.namePlaceholder')"
        :aria-label="t('customAggregates.form.name')"
        data-test="aggregate-label"
      />
      <select v-model="sport" class="form-select" :aria-label="t('customAggregates.form.sport')">
        <option value="">{{ t('customAggregates.form.allSports') }}</option>
        <option v-for="s in report?.sports ?? []" :key="s" :value="s">{{ s }}</option>
      </select>
    </div>

    <p v-if="measurable.length === 0" class="form-hint form-hint--empty">
      <i class="fas fa-circle-info" aria-hidden="true"></i>
      {{ t('customAggregates.form.nothingMeasured') }}
    </p>

    <template v-else>
      <div class="form-row">
        <label class="field-label" for="measure-field">{{
          t('customAggregates.form.measure')
        }}</label>
        <select id="measure-field" v-model="measureField" class="form-select">
          <option v-for="f in measurable" :key="f.field" :value="f.field">
            {{ t(f.labelKey) }} ({{ coverage(f) }})
          </option>
        </select>
        <select v-model="measureOp" class="form-select" :aria-label="t('customAggregates.form.op')">
          <option v-for="op in MEASURE_OPS" :key="op" :value="op">
            {{ t(`customAggregates.ops.${op}`) }}
          </option>
        </select>
      </div>

      <div class="form-row">
        <label class="field-label" for="weight-by">{{ t('customAggregates.form.weightBy') }}</label>
        <select id="weight-by" v-model="weightBy" class="form-select">
          <option v-for="w in WEIGHTS" :key="w" :value="w">
            {{ t(`customAggregates.weights.${w}`) }}
          </option>
        </select>
        <select
          v-model="periodOp"
          class="form-select"
          :aria-label="t('customAggregates.form.periodOp')"
        >
          <option v-for="op in MEASURE_OPS" :key="op" :value="op">
            {{ t(`customAggregates.periodOps.${op}`) }}
          </option>
        </select>
      </div>

      <fieldset class="filters">
        <legend>{{ t('customAggregates.form.filters') }}</legend>

        <div v-for="(filter, i) in filters" :key="i" class="form-row filter-row">
          <select v-model="filter.field" class="form-select">
            <option v-for="f in measurable" :key="f.field" :value="f.field">
              {{ t(f.labelKey) }}
            </option>
          </select>
          <div class="input-group">
            <input
              v-model.number="filter.min"
              type="number"
              step="any"
              class="form-input"
              :placeholder="t('customAggregates.form.min')"
            />
            <input
              v-model.number="filter.max"
              type="number"
              step="any"
              class="form-input"
              :placeholder="t('customAggregates.form.max')"
            />
            <span class="input-unit">{{ unitOf(filter.field) }}</span>
          </div>
          <button
            type="button"
            class="btn-icon"
            :aria-label="t('customAggregates.form.removeFilter')"
            @click="filters.splice(i, 1)"
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </div>

        <p v-if="hintFor(activeFilterField)" class="form-hint">
          <i class="fas fa-lightbulb" aria-hidden="true"></i>
          {{ hintFor(activeFilterField) }}
        </p>

        <button type="button" class="btn-secondary" @click="addFilter">
          <i class="fas fa-plus" aria-hidden="true"></i>
          {{ t('customAggregates.form.addFilter') }}
        </button>
      </fieldset>

      <label class="checkbox">
        <input v-model="pinned" type="checkbox" />
        {{ t('customAggregates.form.pin') }}
      </label>
    </template>

    <div class="form-actions">
      <button type="submit" class="btn-primary" :disabled="!isValid" data-test="aggregate-save">
        <i class="fas fa-check" aria-hidden="true"></i>
        {{ t('common.save') }}
      </button>
      <button type="button" class="btn-secondary" @click="$emit('cancel')">
        {{ t('common.cancel') }}
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePluginContext } from '@/composables/usePluginContext'
import type { CapabilityReport, FieldCapability } from '@/composables/useSampleCapabilities'
import type { CustomAggregate, MeasureOp, WeightBy } from '@/types/customAggregate'
import { SAMPLE_FIELD_SPECS, type SampleField } from '@/types/sampleFields'

const MEASURE_OPS: MeasureOp[] = ['avg', 'sum', 'min', 'max']
const WEIGHTS: WeightBy[] = ['time', 'distance', 'none']

const props = defineProps<{
  report: CapabilityReport | null
  /** Present when editing; absent when creating. */
  existing?: CustomAggregate | null
}>()

const emit = defineEmits<{
  save: [draft: Draft]
  cancel: []
}>()

/** What the form hands back, already in SI. */
export interface Draft {
  label: string
  sports?: string[]
  where: Array<{ field: SampleField; min?: number; max?: number }>
  measure: { field: SampleField; op: MeasureOp }
  weightBy: WeightBy
  periodOp: MeasureOp
  pinned: boolean
  dimension?: CustomAggregate['dimension']
  betterIsLower?: boolean
}

const { t } = useI18n()
const { units } = usePluginContext()

const label = ref('')
const sport = ref('')
const measureField = ref<SampleField>('speed')
const measureOp = ref<MeasureOp>('avg')
const weightBy = ref<WeightBy>('time')
const periodOp = ref<MeasureOp>('avg')
const pinned = ref(false)

/** Bounds live here in *display* units; SI conversion happens on submit only. */
const filters = ref<Array<{ field: SampleField; min?: number; max?: number }>>([])

/** Only what the library actually measured — the rest would filter nothing. */
const measurable = computed<FieldCapability[]>(
  () => props.report?.fields.filter(f => f.availability === 'measured') ?? []
)

const isValid = computed(() => label.value.trim().length > 0 && measurable.value.length > 0)

const activeFilterField = computed<SampleField | null>(
  () => filters.value[filters.value.length - 1]?.field ?? null
)

function capabilityOf(field: SampleField | null): FieldCapability | undefined {
  return field ? measurable.value.find(f => f.field === field) : undefined
}

/**
 * A field with a dimension is read in the reader's own units; one without —
 * a slope, a heart rate — carries its own symbol and scale.
 */
function unitOf(field: SampleField): string {
  const spec = SAMPLE_FIELD_SPECS[field]
  return spec.dimension ? units.convert(spec.dimension, 0).unit : (spec.unit ?? '')
}

function toDisplay(field: SampleField, si: number): number {
  const spec = SAMPLE_FIELD_SPECS[field]
  return spec.dimension ? units.convert(spec.dimension, si).value : si * (spec.scale ?? 1)
}

function toStored(field: SampleField, display: number): number {
  const spec = SAMPLE_FIELD_SPECS[field]
  return spec.dimension ? units.toSI(spec.dimension, display) : display / (spec.scale ?? 1)
}

/**
 * A bound the reader actually set, in SI — or nothing.
 *
 * `v-model.number` on a cleared field yields the empty string, not `undefined`,
 * so a guard on `undefined` alone lets `''` through and stores `NaN`. Every
 * comparison against `NaN` is false, which turns "I cleared the maximum" into a
 * filter that silently matches nothing at all.
 */
function bound(field: SampleField, value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? toStored(field, value) : undefined
}

function round(value: number): number {
  return Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10
}

/** The whole point of measuring the library: a band nobody has to guess. */
function hintFor(field: SampleField | null): string | null {
  const capability = capabilityOf(field)
  if (!capability || capability.p05 === undefined || capability.p95 === undefined) return null

  return t('customAggregates.form.rangeHint', {
    field: t(capability.labelKey),
    low: round(toDisplay(capability.field, capability.p05)),
    high: round(toDisplay(capability.field, capability.p95)),
    unit: unitOf(capability.field)
  })
}

function coverage(capability: FieldCapability): string {
  return t('customAggregates.form.coverage', {
    percent: Math.round(capability.activityRatio * 100)
  })
}

function addFilter() {
  const field = measurable.value[0]?.field
  if (!field) return

  // Prefilled with the band the data actually occupies, rather than with two
  // empty boxes: the suggestion is the help, and an empty pair of bounds is a
  // filter that matches everything.
  const capability = capabilityOf(field)
  filters.value.push({
    field,
    min: capability?.p05 !== undefined ? round(toDisplay(field, capability.p05)) : undefined,
    max: capability?.p95 !== undefined ? round(toDisplay(field, capability.p95)) : undefined
  })
}

/** Reset from the definition being edited, or to a sane default when creating. */
watch(
  () => [props.existing, props.report] as const,
  () => {
    const source = props.existing
    const fallback = measurable.value[0]?.field ?? 'speed'

    label.value = source?.label ?? ''
    sport.value = source?.sports?.[0] ?? ''
    measureField.value = source?.measure.field ?? fallback
    measureOp.value = source?.measure.op ?? 'avg'
    weightBy.value = source?.weightBy ?? 'time'
    periodOp.value = (source?.periodOp as MeasureOp) ?? 'avg'
    pinned.value = source?.pinned ?? false
    filters.value = (source?.where ?? []).map(f => ({
      field: f.field,
      min: f.min !== undefined ? round(toDisplay(f.field, f.min)) : undefined,
      max: f.max !== undefined ? round(toDisplay(f.field, f.max)) : undefined
    }))
  },
  { immediate: true }
)

function onSubmit() {
  if (!isValid.value) return

  const spec = SAMPLE_FIELD_SPECS[measureField.value]

  emit('save', {
    label: label.value.trim(),
    sports: sport.value ? [sport.value] : undefined,
    // Converted here and nowhere else: a bound typed as "5" means five of
    // whatever the reader is set to, and what gets stored is metres per second.
    where: filters.value
      .map(f => ({
        field: f.field,
        min: bound(f.field, f.min),
        max: bound(f.field, f.max)
      }))
      .filter(f => f.min !== undefined || f.max !== undefined),
    measure: { field: measureField.value, op: measureOp.value },
    weightBy: weightBy.value,
    periodOp: periodOp.value,
    pinned: pinned.value,
    dimension: spec.dimension,
    // Speed is the one measure a reader judges upside down, because they read
    // it as a pace.
    betterIsLower: false
  })
}
</script>

<style scoped>
.aggregate-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--card-background);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
}

.form-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.field-label {
  min-width: 6rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.form-input,
.form-select {
  padding: 0.5rem 0.6rem;
  font-size: 0.9rem;
  color: var(--text-color);
  background: var(--background-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm, 6px);
}

.form-input.grow {
  flex: 1 1 12rem;
}

.input-group {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.input-group .form-input {
  width: 5.5rem;
}

.input-unit {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.filters {
  padding: 0.75rem;
  margin: 0;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm, 6px);
}

.filters legend {
  padding: 0 0.35rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.filter-row {
  margin-bottom: 0.5rem;
}

.form-hint {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0.35rem 0;
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.form-hint--empty {
  color: var(--text-color);
}

.checkbox {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.9rem;
  color: var(--text-color);
}

.form-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-primary,
.btn-secondary,
.btn-icon {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.8rem;
  font-size: 0.9rem;
  cursor: pointer;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm, 6px);
}

.btn-primary {
  color: var(--text-on-primary, #fff);
  background: var(--primary-color);
  border-color: var(--primary-color);
}

.btn-primary:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.btn-secondary,
.btn-icon {
  color: var(--text-color);
  background: var(--background-color);
}
</style>
