<template>
  <section v-if="!loading" class="custom-aggregates" data-test="custom-aggregates">
    <div class="section-header">
      <h3 class="section-title">
        <i class="fas fa-sliders" aria-hidden="true"></i>
        {{ t('customAggregates.title') }}
      </h3>

      <div class="header-actions">
        <div v-if="pinned.length" class="period-chips" role="group">
          <button
            v-for="p in PERIODS"
            :key="p"
            type="button"
            class="chip"
            :class="{ 'chip--on': period === p }"
            :aria-pressed="period === p"
            @click="period = p"
          >
            {{ t(`customAggregates.periods.${p}`) }}
          </button>
        </div>
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
    </div>

    <div v-if="indexing" class="indexing" data-test="aggregate-indexing">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progress + '%' }"></div>
      </div>
      <p>{{ t('customAggregates.indexing') }} {{ progress }}%</p>
      <p class="hint">{{ t('customAggregates.indexingHint') }}</p>
    </div>

    <ul v-if="pinned.length" class="tiles" data-test="aggregate-tiles">
      <li v-for="tile in tiles" :key="tile.id" class="tile">
        <span class="tile__label">{{ tile.label }}</span>
        <span class="tile__value">{{ tile.value }}</span>
      </li>
    </ul>

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

    <p v-else-if="!editing && !indexing" class="empty">{{ t('customAggregates.empty') }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePluginContext } from '@/composables/usePluginContext'
import { useActivityMetricsIndex } from '@/composables/useActivityMetricsIndex'
import type { CapabilityReport } from '@/composables/useSampleCapabilities'
import type { Activity } from '@/types/activity'
import type { AggregationPeriod } from '@/types/aggregation'
import type { CustomAggregate } from '@/types/customAggregate'
import { SAMPLE_FIELD_SPECS } from '@/types/sampleFields'
import { periodKey } from '@/utils/dateKeys'
import { formatValue, toDisplay, unitOf } from '../aggregateFormat'
import AggregateEditForm from './AggregateEditForm.vue'
import type { Draft } from './AggregateEditForm.vue'

const PERIODS: AggregationPeriod[] = ['week', 'month', 'year']

const props = defineProps<{
  selectedSport?: string
  /** The library, for the one-off index pass this section may have to trigger. */
  activities?: Activity[]
}>()

const { t } = useI18n()
const ctx = usePluginContext()
const { indexing, progress, ensureIndex } = useActivityMetricsIndex()

const aggregates = ref<CustomAggregate[]>([])
const report = ref<CapabilityReport | null>(null)
const values = ref<Record<string, number>>({})
const period = ref<AggregationPeriod>('month')
const loading = ref(true)
const editing = ref(false)
const edited = ref<CustomAggregate | null>(null)

const sportScope = computed(() => props.selectedSport || undefined)
const pinned = computed(() => aggregates.value.filter(a => a.pinned))

const tiles = computed(() =>
  pinned.value.map(aggregate => ({
    id: aggregate.id,
    label: aggregate.label,
    value:
      values.value[aggregate.id] === undefined
        ? t('customAggregates.noValue')
        : formatValue(ctx.units, aggregate.measure.field, values.value[aggregate.id])
  }))
)

async function refresh() {
  aggregates.value = await ctx.aggregates.list()
  await loadValues()
}

async function loadReport() {
  report.value = await ctx.aggregates.capabilities(sportScope.value)
}

/**
 * The figure of the period the reader is in, not of the last one on record.
 *
 * A tile silently showing a fortnight-old week reads as this week's.
 */
async function loadValues() {
  const currentKey = periodKey(new Date(), period.value)
  const next: Record<string, number> = {}

  await Promise.all(
    pinned.value.map(async aggregate => {
      const records = await ctx.aggregation.getAggregated(aggregate.id, period.value)
      const record = records.find(r => r.periodKey === currentKey)
      if (record) next[aggregate.id] = record.value
    })
  )

  values.value = next
}

/**
 * One line saying what the aggregate does, in the reader's own units.
 *
 * Built from the definition rather than stored beside it: a description that is
 * a second copy of the rule drifts from it the first time the rule is edited.
 */
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
  // A new or edited definition has no values until the index has run against
  // it; the pass is incremental, so it only touches what the change invalidated.
  await runIndex()
  await refresh()
}

async function onDelete(aggregate: CustomAggregate) {
  await ctx.aggregates.remove(aggregate.id)
  if (edited.value?.id === aggregate.id) stopEditing()
  await runIndex()
  await refresh()
}

async function runIndex(): Promise<void> {
  const activities = props.activities ?? []
  if (activities.length === 0) return
  await ensureIndex(activities)
}

let unsubscribe: (() => void) | null = null

// The sport filter above this section scopes what the editor may offer: power
// exists in the library, but proposing it on a run would build a filter that
// matches nothing.
watch(sportScope, () => {
  void loadReport()
})

watch(period, () => {
  void loadValues()
})

onMounted(async () => {
  await Promise.all([refresh(), loadReport()])
  loading.value = false

  // Nothing measured yet means the index has never run over this library — or
  // ran under an older version. Triggering it here rather than telling the user
  // to go and scroll a feed until it happens: the message they would otherwise
  // read looks like a dead end, and the section is useless until this is done.
  const measured = report.value?.fields.some(f => f.availability === 'measured') ?? false
  if (!measured) {
    await runIndex()
    await Promise.all([loadReport(), refresh()])
  }

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

.header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.period-chips {
  display: flex;
  gap: 0.25rem;
}

.chip {
  padding: 0.35rem 0.6rem;
  font-size: 0.82rem;
  color: var(--text-secondary);
  cursor: pointer;
  background: var(--background-color);
  border: 1px solid var(--border-color);
  border-radius: 999px;
}

.chip--on {
  color: var(--text-on-primary, #fff);
  background: var(--primary-color);
  border-color: var(--primary-color);
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  gap: 0.6rem;
  padding: 0;
  margin: 0 0 1rem;
  list-style: none;
}

.tile {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.7rem 0.8rem;
  background: var(--card-background);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
}

.tile__label {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.tile__value {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text-color);
}

.indexing {
  margin-bottom: 1rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.indexing p {
  margin: 0.3rem 0 0;
}

.indexing .hint {
  font-size: 0.78rem;
}

.progress-bar {
  height: 4px;
  overflow: hidden;
  background: var(--border-color);
  border-radius: 999px;
}

.progress-fill {
  height: 100%;
  background: var(--primary-color);
  transition: width 0.2s ease;
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
