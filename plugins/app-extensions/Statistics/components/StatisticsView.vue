<template>
  <div class="statistics-page">
    <div class="statistics-header">
      <h2 class="statistics-title">
        <i class="fas fa-chart-bar" aria-hidden="true"></i>
        {{ t('statistics.title') }}
      </h2>
      <SportFilter v-if="sportOptions.length > 1" v-model="selectedSport" :options="sportOptions" />
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

    <div v-else class="dash-grid">
      <!-- The coup d'œil first: the running totals and record count, at a glance,
           before any chart asks to be read. -->
      <DashboardSummary
        class="cell-full"
        :activities="filteredActivities"
        :selected-sport="selectedSport"
      />

      <!-- The activity calendar sits right under the summary — the shape of the
           training block, before the sections that break it down. -->
      <CalendarHeatmap class="cell-full" :activities="filteredActivities" />

      <!-- Plugins that answer the same question as this page render here (the
           metric tracker). Full width: it is where a figure becomes a curve. -->
      <component
        :is="section"
        v-for="(section, i) in sectionComponents"
        :key="`section-${i}`"
        class="cell-full"
        :sport="selectedSport"
      />

      <!-- The two breakdowns share a row on the desktop grid. -->
      <TrendsSection class="cell-half" :activities="filteredActivities" />
      <DistributionSection
        class="cell-half"
        :activities="filteredActivities"
        :all-activities="allActivities"
        :selected-sport="selectedSport"
      />

      <PersonalRecordsSection
        class="cell-full"
        :activities="filteredActivities"
        :selected-sport="selectedSport"
      />

      <!-- What the reader chose to follow closes the page. -->
      <CustomAggregatesSection
        class="cell-full"
        :selected-sport="selectedSport"
        :activities="filteredActivities"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSlotExtensions } from '@/composables/useSlotExtensions'
import { useStatisticsData } from '../composables/useStatisticsData'
import SportFilter from './SportFilter.vue'
import DashboardSummary from './DashboardSummary.vue'
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
</script>

<style scoped>
.statistics-page {
  max-width: 1120px;
  margin: 0 auto;
  padding: 1.5rem 1rem 3rem;
}

.statistics-header {
  margin-bottom: 1.5rem;
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

/* A two-column dashboard grid rather than one tall column: the summary and the
   calendar span the full width, the two breakdowns share a row, and everything
   collapses to a single column on a phone. `align-items: start` keeps a short
   card from stretching to match a tall neighbour in its row. */
.dash-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.25rem;
  align-items: start;
}

/* A card never widens the column it sits in. A grid item's automatic minimum
   size is its min-content, so one wide child — the calendar's year of 12px
   cells, a chart's own width — used to push the track past the viewport and
   drag every other card off-screen with it. The tracks are already
   `minmax(0, …)`; this is the same floor on the items. */
.dash-grid > * {
  min-width: 0;
}

.cell-full {
  grid-column: 1 / -1;
}

.cell-half {
  grid-column: span 1;
}

@media (max-width: 720px) {
  /* `minmax(0, 1fr)`, not `1fr`: a bare `1fr` is `minmax(auto, 1fr)`, whose
     floor is the widest card's min-content — which is how the phone layout
     ended up 828px wide inside a 390px screen. */
  .dash-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .cell-half {
    grid-column: 1 / -1;
  }
}
</style>
