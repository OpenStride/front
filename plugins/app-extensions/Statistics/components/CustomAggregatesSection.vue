<template>
  <section v-if="!loading" class="custom-aggregates" data-test="custom-aggregates">
    <div class="section-header">
      <h3 class="section-title">
        <i class="fas fa-sliders" aria-hidden="true"></i>
        {{ t('customAggregates.title') }}
      </h3>
      <button
        v-if="!editing"
        type="button"
        class="btn-secondary"
        data-test="aggregate-new"
        @click="startCreate"
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
        {{ t('customAggregates.add') }}
      </button>
    </div>

    <AggregateEditForm
      v-if="editing"
      :report="report"
      :existing="edited"
      @save="onSave"
      @cancel="stopEditing"
    />

    <ul v-if="aggregates.length" class="stack">
      <li v-for="aggregate in aggregates" :key="aggregate.id" class="item">
        <div class="item__text">
          <span class="item__label">
            <i
              v-if="aggregate.pinned"
              class="fas fa-thumbtack"
              :title="t('customAggregates.pinned')"
              aria-hidden="true"
            ></i>
            {{ aggregate.label }}
          </span>
          <span class="item__desc">{{ describe(aggregate) }}</span>
        </div>

        <div class="item__actions">
          <button
            type="button"
            class="btn-icon"
            :aria-label="t('customAggregates.edit', { name: aggregate.label })"
            @click="startEdit(aggregate)"
          >
            <i class="fas fa-pen" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            class="btn-icon"
            :aria-label="t('customAggregates.delete', { name: aggregate.label })"
            @click="onDelete(aggregate)"
          >
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      </li>
    </ul>

    <p v-else-if="!editing" class="empty">{{ t('customAggregates.empty') }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePluginContext } from '@/composables/usePluginContext'
import type { CapabilityReport } from '@/composables/useSampleCapabilities'
import type { CustomAggregate } from '@/types/customAggregate'
import { SAMPLE_FIELD_SPECS, type SampleField } from '@/types/sampleFields'
import AggregateEditForm from './AggregateEditForm.vue'
import type { Draft } from './AggregateEditForm.vue'

const props = defineProps<{ selectedSport?: string }>()

const { t } = useI18n()
const ctx = usePluginContext()

const aggregates = ref<CustomAggregate[]>([])
const report = ref<CapabilityReport | null>(null)
const loading = ref(true)
const editing = ref(false)
const edited = ref<CustomAggregate | null>(null)

const sportScope = computed(() => props.selectedSport || undefined)

async function refresh() {
  aggregates.value = await ctx.aggregates.list()
}

async function loadReport() {
  report.value = await ctx.aggregates.capabilities(sportScope.value)
}

/**
 * A one-line reading of what the aggregate does, in the reader's own units.
 *
 * Written from the definition rather than stored beside it: a description that
 * is a second copy of the rule drifts from it the first time the rule is
 * edited.
 */
function describe(aggregate: CustomAggregate): string {
  const measure = t(SAMPLE_FIELD_SPECS[aggregate.measure.field].labelKey)
  const op = t(`customAggregates.ops.${aggregate.measure.op}`)

  const bands = aggregate.where.map(filter => {
    const name = t(SAMPLE_FIELD_SPECS[filter.field].labelKey)
    const unit = unitOf(filter.field)
    const low = filter.min !== undefined ? display(filter.field, filter.min) : null
    const high = filter.max !== undefined ? display(filter.field, filter.max) : null

    if (low !== null && high !== null) return `${name} ${low}–${high} ${unit}`
    if (low !== null) return `${name} ≥ ${low} ${unit}`
    return `${name} < ${high} ${unit}`
  })

  return bands.length ? `${op} ${measure} — ${bands.join(', ')}` : `${op} ${measure}`
}

function unitOf(field: SampleField): string {
  const spec = SAMPLE_FIELD_SPECS[field]
  return spec.dimension ? ctx.units.convert(spec.dimension, 0).unit : (spec.unit ?? '')
}

function display(field: SampleField, si: number): string {
  const spec = SAMPLE_FIELD_SPECS[field]
  const value = spec.dimension
    ? ctx.units.convert(spec.dimension, si).value
    : si * (spec.scale ?? 1)
  return String(Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10)
}

function startCreate() {
  edited.value = null
  editing.value = true
}

function startEdit(aggregate: CustomAggregate) {
  edited.value = aggregate
  editing.value = true
}

function stopEditing() {
  editing.value = false
  edited.value = null
}

async function onSave(draft: Draft) {
  const target = edited.value

  if (target) {
    await ctx.aggregates.update(target.id, { ...draft, enabled: true })
  } else {
    await ctx.aggregates.create({ ...draft, enabled: true })
  }

  stopEditing()
  await refresh()
}

async function onDelete(aggregate: CustomAggregate) {
  await ctx.aggregates.remove(aggregate.id)
  if (edited.value?.id === aggregate.id) stopEditing()
  await refresh()
}

let unsubscribe: (() => void) | null = null

// The sport filter above this section scopes what the editor may offer: power
// exists in the library, but proposing it on a run would build a filter that
// matches nothing.
watch(sportScope, () => {
  void loadReport()
})

onMounted(async () => {
  await Promise.all([refresh(), loadReport()])
  loading.value = false

  // Another device's edit lands through sync, not through this form.
  unsubscribe = ctx.aggregates.onChanged(() => {
    void refresh()
  })
})

onUnmounted(() => {
  unsubscribe?.()
  unsubscribe = null
})
</script>

<style scoped>
.custom-aggregates {
  margin-bottom: 1.5rem;
}

.section-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 1rem;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0;
  margin: 0.75rem 0 0;
  list-style: none;
}

.item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 0.9rem;
  background: var(--card-background);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
}

.item__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.item__label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
  color: var(--text-color);
}

.item__desc {
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.item__actions {
  display: flex;
  gap: 0.35rem;
}

.empty {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.btn-secondary,
.btn-icon {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.7rem;
  font-size: 0.9rem;
  color: var(--text-color);
  cursor: pointer;
  background: var(--background-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm, 6px);
}
</style>
