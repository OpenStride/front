<template>
  <section class="section-card" data-test="records">
    <div class="card-head">
      <h3 class="card-title">{{ t('statistics.records.titleFor', { sport: sportLabel }) }}</h3>
      <RecordPeriodFilter v-model="selectedPeriod" />
    </div>

    <div v-if="computing" class="computing">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progress + '%' }"></div>
      </div>
      <p class="computing-text">{{ t('statistics.records.computing') }} {{ progress }}%</p>
    </div>

    <p v-else-if="records.length === 0" class="empty">
      {{
        selectedPeriod === 'all'
          ? t('statistics.records.noRecordsHint')
          : t('statistics.records.noRecordsPeriodHint')
      }}
    </p>

    <!-- A list of links rather than a table: each record is a way into the
         outing that set it, and six columns never fitted a phone. -->
    <ul v-else class="records">
      <li v-for="r in rows" :key="r.distance">
        <RouterLink :to="`/activity-details/${r.activityId}`" class="record">
          <span class="dist">{{ r.label }}</span>
          <span class="main">
            <span class="time">{{ r.time }}</span>
            <span class="sub">{{ r.metric }} · {{ r.date }}</span>
          </span>
          <span v-if="r.isNew" class="badge">{{ t('statistics.records.new') }}</span>
          <i class="fas fa-chevron-right chevron" aria-hidden="true"></i>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { usePluginContext } from '@/composables/usePluginContext'
import { formatDate } from '@/utils/dateFormat'
import { formatRecordTime } from '@/utils/duration'
import { primaryMetricSpec } from '@/utils/activityMetrics'
import { formatSportType } from '@/utils/sportLabels'
import type { Activity } from '@/types/activity'
import { usePersonalRecords } from '../composables/usePersonalRecords'
import RecordPeriodFilter from './RecordPeriodFilter.vue'
import { toMs, type RecordPeriod } from '../types'

/** A record younger than this wears a badge: the one worth noticing. */
const NEW_DAYS = 30

const { t } = useI18n()
const { units } = usePluginContext()

const props = defineProps<{
  /** Already filtered to `selectedSport`; records only mean something per sport. */
  activities: Activity[]
  selectedSport: string
}>()

const selectedPeriod = ref<RecordPeriod>('all')

const { records, computing, progress } = usePersonalRecords(
  toRef(props, 'activities'),
  toRef(props, 'selectedSport'),
  selectedPeriod
)

const sportLabel = computed(() => formatSportType(props.selectedSport))

const rows = computed(() => {
  const cutoff = Date.now() - NEW_DAYS * 86_400_000
  return records.value.map(r => {
    // Pace for a runner, speed for a cyclist: the sport says which.
    const spec = primaryMetricSpec(props.selectedSport, { speed: r.speed })
    return {
      distance: r.distance,
      activityId: r.activityId,
      label: r.distanceLabel,
      time: formatRecordTime(r.duration),
      metric: spec ? units.format(spec.dimension, spec.si).text : '',
      date: formatDate(toMs(r.date), { day: 'numeric', month: 'short', year: 'numeric' }),
      isNew: toMs(r.date) >= cutoff
    }
  })
})
</script>

<style scoped>
.card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 0.6rem;
}

.card-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-color);
}

.computing {
  padding: 1rem 0;
}

.progress-bar {
  height: 6px;
  background: var(--color-green-100);
  border-radius: var(--radius-sm);
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.progress-fill {
  height: 100%;
  background: var(--color-green-500);
  transition: width 0.3s ease;
}

.computing-text {
  font-size: 0.85rem;
  color: var(--text-faint);
  text-align: center;
  margin: 0;
}

.empty {
  margin: 0.5rem 0 0;
  font-size: 0.9rem;
  color: var(--text-faint);
}

.records {
  list-style: none;
  margin: 0;
  padding: 0;
}

.records li + li {
  border-top: 1px solid var(--border-subtle);
}

.record {
  display: grid;
  grid-template-columns: 5rem 1fr auto auto;
  align-items: center;
  gap: 0.8rem;
  min-height: 3.4rem;
  padding: 0.3rem 0.2rem;
  text-decoration: none;
  color: var(--text-color);
}

.record:hover,
.record:focus-visible {
  background: var(--surface-2);
}

.dist {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1rem;
}

.main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.time {
  font-family: var(--font-mono);
  font-size: 1.1rem;
  font-weight: 500;
}

.sub {
  font-size: 0.82rem;
  color: var(--text-faint);
}

.badge {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-white);
  background: var(--color-green-600);
  padding: 0.15rem 0.55rem;
  border-radius: var(--radius-pill);
}

.chevron {
  color: var(--text-faint);
  font-size: 0.8rem;
}
</style>
