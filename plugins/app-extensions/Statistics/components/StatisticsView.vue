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

    <div v-else class="statistics-sections">
      <CalendarHeatmap :activities="filteredActivities" />
      <TrendsSection :activities="filteredActivities" />
      <DistributionSection
        :activities="filteredActivities"
        :all-activities="allActivities"
        :selected-sport="selectedSport"
      />
      <PersonalRecordsSection :activities="filteredActivities" :selected-sport="selectedSport" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useStatisticsData } from '../composables/useStatisticsData'
import SportFilter from './SportFilter.vue'
import TrendsSection from './TrendsSection.vue'
import DistributionSection from './DistributionSection.vue'
import PersonalRecordsSection from './PersonalRecordsSection.vue'
import CalendarHeatmap from './CalendarHeatmap.vue'

const { t } = useI18n()
const { allActivities, filteredActivities, selectedSport, sportOptions, loading } =
  useStatisticsData()
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
  gap: 1.5rem;
}
</style>
