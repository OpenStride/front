<template>
  <div class="statistics-page">
    <div class="statistics-header">
      <h2 class="statistics-title">
        <i class="fas fa-chart-bar" aria-hidden="true"></i>
        {{ t('statistics.title') }}
      </h2>
      <div class="statistics-actions">
        <SportFilter
          v-if="sportOptions.length > 1"
          v-model="selectedSport"
          :options="sportOptions"
        />
        <button
          type="button"
          class="btn-icon"
          :class="{ 'btn-icon--on': arranging }"
          :aria-expanded="arranging"
          :aria-label="t('statistics.layout.open')"
          :title="t('statistics.layout.open')"
          data-test="dashboard-settings-open"
          @click="arranging = !arranging"
        >
          <i class="fas fa-gear" aria-hidden="true"></i>
        </button>
      </div>
    </div>

    <div v-if="loading" class="statistics-loading">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      {{ t('common.loading') }}
    </div>

    <div v-else-if="allActivities.length === 0" class="statistics-empty">
      <i class="fas fa-chart-line" aria-hidden="true"></i>
      <p>{{ t('statistics.noData') }}</p>
      <p class="hint">{{ t('statistics.noDataHint') }}</p>
    </div>

    <div v-else class="statistics-sections">
      <DashboardSettings
        v-if="arranging"
        :layout="layout"
        @toggle="onToggle"
        @move="onMove"
        @reset="onReset"
      />

      <!-- Rendered in the order the reader arranged, not the order this file
           declares them in. The `v-if` chain rather than a component map: the
           blocks take different props, and a map would have to carry them as
           untyped bags. -->
      <template v-for="id in sections" :key="id">
        <CustomAggregatesSection
          v-if="id === 'aggregates'"
          :selected-sport="selectedSport"
          :activities="filteredActivities"
        />

        <!-- Plugins that answer the same question as this page render here. -->
        <component
          :is="section"
          v-for="(section, i) in id === 'extensions' ? sectionComponents : []"
          :key="`section-${i}`"
          :sport="selectedSport"
        />

        <SummarySection v-if="id === 'summary'" :selected-sport="selectedSport" />
        <CalendarHeatmap v-if="id === 'heatmap'" :activities="filteredActivities" />
        <TrendsSection v-if="id === 'trends'" :activities="filteredActivities" />
        <DistributionSection
          v-if="id === 'distribution'"
          :activities="filteredActivities"
          :all-activities="allActivities"
          :selected-sport="selectedSport"
        />
        <PersonalRecordsSection
          v-if="id === 'records'"
          :activities="filteredActivities"
          :selected-sport="selectedSport"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSlotExtensions } from '@/composables/useSlotExtensions'
import { usePluginContext } from '@/composables/usePluginContext'
import { useStatisticsData } from '../composables/useStatisticsData'
import {
  DEFAULT_LAYOUT,
  LAYOUT_STORAGE_KEY,
  moveSection,
  normalizeLayout,
  toggleSection,
  visibleSections,
  type DashboardLayout,
  type DashboardSectionId
} from '../dashboardLayout'
import DashboardSettings from './DashboardSettings.vue'
import SportFilter from './SportFilter.vue'
import SummarySection from './SummarySection.vue'
import TrendsSection from './TrendsSection.vue'
import DistributionSection from './DistributionSection.vue'
import PersonalRecordsSection from './PersonalRecordsSection.vue'
import CalendarHeatmap from './CalendarHeatmap.vue'
import CustomAggregatesSection from './CustomAggregatesSection.vue'

const { t } = useI18n()
const { allActivities, filteredActivities, selectedSport, sportOptions, loading } =
  useStatisticsData()

const { components: rawSections } = useSlotExtensions('statistics.sections')
const sectionComponents = computed(() => rawSections.value)

const ctx = usePluginContext()
const arranging = ref(false)
const layout = ref<DashboardLayout>(DEFAULT_LAYOUT)
const sections = computed(() => visibleSections(layout.value))

/**
 * The arrangement is a preference, so it lives in `settings` and rides the
 * backup like every other one — a reader who arranged their dashboard on the
 * phone should not have to do it again on the laptop.
 */
async function persist() {
  await ctx.storage.saveData(LAYOUT_STORAGE_KEY, layout.value)
}

function onToggle(id: DashboardSectionId) {
  layout.value = toggleSection(layout.value, id)
  void persist()
}

function onMove(id: DashboardSectionId, delta: -1 | 1) {
  layout.value = moveSection(layout.value, id, delta)
  void persist()
}

function onReset() {
  layout.value = { ...DEFAULT_LAYOUT, order: [...DEFAULT_LAYOUT.order] }
  void persist()
}

onMounted(async () => {
  layout.value = normalizeLayout(await ctx.storage.getData(LAYOUT_STORAGE_KEY))
})
</script>

<style scoped>
.statistics-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 1.5rem 1rem;
}

.statistics-header {
  margin-bottom: 1.5rem;
}

.statistics-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

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

.btn-icon--on {
  color: var(--text-on-primary, #fff);
  background: var(--primary-color);
  border-color: var(--primary-color);
}

.statistics-title {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-color);
  margin: 0 0 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.statistics-title i {
  color: var(--color-green-500);
}

.statistics-loading {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--text-color);
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.statistics-empty {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--text-color);
}

.statistics-empty i {
  font-size: 2.5rem;
  color: var(--color-green-300);
  margin-bottom: 1rem;
}

.statistics-empty p {
  margin: 0.3rem 0;
}

.statistics-empty .hint {
  font-size: 0.85rem;
  opacity: 0.7;
}

.statistics-sections {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* Mobile : les sections vont d'un bord à l'autre, comme les cartes de « Mes
   activités ». La marge latérale de la page disparaît donc, et l'en-tête la
   reprend pour lui seul. */
@media (max-width: 640px) {
  .statistics-page {
    padding-left: 0;
    padding-right: 0;
  }

  .statistics-header {
    padding: 0 1rem;
  }
}
</style>
