<template>
  <section v-if="!loading" class="section-card custom-aggregates" data-test="custom-aggregates">
    <div class="section-header">
      <h3 class="section-title">
        <i class="fas fa-chart-line" aria-hidden="true"></i>
        {{ t('customAggregates.title') }}
      </h3>

      <button
        type="button"
        class="btn-icon"
        :class="{ 'btn-icon--on': managing }"
        :aria-expanded="managing"
        :aria-label="t('customAggregates.manage')"
        :title="t('customAggregates.manage')"
        data-test="aggregate-manage"
        @click="managing = !managing"
      >
        <i class="fas fa-gear" aria-hidden="true"></i>
      </button>
    </div>

    <div v-if="indexing" class="indexing" data-test="aggregate-indexing">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progress + '%' }"></div>
      </div>
      <p>{{ t('customAggregates.indexing') }} {{ progress }}%</p>
      <p class="hint">{{ t('customAggregates.indexingHint') }}</p>
    </div>

    <AggregateManager
      v-if="managing"
      :aggregates="aggregates"
      :suggestions="suggestions"
      :report="report"
      :editing="editing"
      :edited="edited"
      @add-preset="addPreset"
      @toggle-pin="togglePin"
      @edit="startEdit"
      @remove="onDelete"
      @create="startCreate"
      @save="onSave"
      @cancel="stopEditing"
    />

    <!-- The dashboard shows what the reader chose to follow, and nothing else.
         Everything defined lives behind the gear; showing all of it here would
         make the page grow with every experiment rather than with every
         decision. -->
    <ul v-if="shown.length" class="cards" data-test="aggregate-cards">
      <li v-for="aggregate in shown" :key="aggregate.id">
        <AggregateCard :aggregate="aggregate" />
      </li>
    </ul>

    <p v-else-if="!managing && !indexing" class="empty" data-test="aggregate-empty">
      {{ aggregates.length ? t('customAggregates.noneShown') : t('customAggregates.empty') }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePluginContext } from '@/composables/usePluginContext'
import { useActivityMetricsIndex } from '@/composables/useActivityMetricsIndex'
import type { CapabilityReport } from '@/composables/useSampleCapabilities'
import type { Activity } from '@/types/activity'
import type { CustomAggregate } from '@/types/customAggregate'
import { availablePresets, type AggregatePreset } from '../aggregatePresets'
import AggregateCard from './AggregateCard.vue'
import AggregateManager from './AggregateManager.vue'
import type { Draft } from './AggregateEditForm.vue'

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
const loading = ref(true)
const managing = ref(false)
const editing = ref(false)
const edited = ref<CustomAggregate | null>(null)

const sportScope = computed(() => props.selectedSport || undefined)

/** Pinning decides what the dashboard shows — that is all it means. */
const shown = computed(() =>
  aggregates.value.filter(a => a.pinned).sort((a, b) => a.label.localeCompare(b.label))
)

const suggestions = computed(() =>
  availablePresets(
    report.value,
    new Set(aggregates.value.map(a => a.presetId).filter((id): id is string => !!id))
  )
)

async function refresh() {
  aggregates.value = await ctx.aggregates.list()
}

async function loadReport() {
  report.value = await ctx.aggregates.capabilities(sportScope.value)
}

/**
 * Accept a suggestion: one click, no form.
 *
 * The name is resolved from the locale here and stored as plain text, because
 * from this point it is the reader's — they can rename it, and a key would
 * overwrite that on the next locale change.
 */
async function addPreset(preset: AggregatePreset) {
  if (!report.value) return

  await ctx.aggregates.create({
    ...preset.build(report.value),
    label: t(preset.labelKey),
    icon: preset.icon,
    presetId: preset.id,
    sports: sportScope.value ? [sportScope.value] : undefined
  })

  await runIndex()
  await refresh()
}

async function togglePin(aggregate: CustomAggregate) {
  await ctx.aggregates.update(aggregate.id, { pinned: !aggregate.pinned })
  await refresh()
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
/* The card shell itself comes from the global `.section-card`, like every
   other section of this page. */

.section-header {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.section-title {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
}

.section-title i {
  color: var(--color-green-500);
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(26rem, 1fr));
  gap: 0.8rem;
  padding: 0;
  margin: 0;
  list-style: none;
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

.empty {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.btn-icon {
  display: inline-flex;
  gap: 0.4rem;
  align-items: center;
  padding: 0.45rem 0.7rem;
  font-size: 0.9rem;
  color: var(--text-color);
  cursor: pointer;
  background: var(--background-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm, 6px);
}

.btn-icon--on {
  color: var(--text-on-primary, #fff);
  background: var(--primary-color);
  border-color: var(--primary-color);
}
</style>
