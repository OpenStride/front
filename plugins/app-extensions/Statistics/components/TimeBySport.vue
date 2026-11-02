<template>
  <section v-if="shares.length > 1" class="section-card" data-test="time-by-sport">
    <div class="card-head">
      <h3 class="card-title">{{ t('statistics.timeBySport.title') }}</h3>
      <span class="card-note">{{ t('statistics.timeBySport.note', { weeks: WEEKS }) }}</span>
    </div>

    <div class="bar" role="img" :aria-label="ariaLabel">
      <span
        v-for="s in shares"
        :key="s.sport"
        :style="{ width: `${s.percent}%`, background: s.color }"
      ></span>
    </div>

    <ul class="rows">
      <li v-for="s in shares" :key="s.sport">
        <span class="swatch" :style="{ background: s.color }" aria-hidden="true"></span>
        <span class="name">{{ s.label }}</span>
        <span class="value">{{ s.time }}</span>
        <span class="percent">{{ s.percent }} %</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatCompactDuration } from '@/utils/duration'
import { formatSportType } from '@/utils/sportLabels'
import type { Activity } from '@/types/activity'
import { timeBySport, weeklySeries } from '../dashboardData'
import { sportColor } from '../sportPalette'

const WEEKS = 12

const { t } = useI18n()

const props = defineProps<{
  activities: Activity[]
}>()

/**
 * Time, not distance: it is the one quantity every sport shares. A swimmer's
 * 3 km and a cyclist's 80 km would put the pool at 4 % of a week it filled.
 */
const shares = computed(() => {
  const rows = timeBySport(weeklySeries(props.activities, WEEKS))
  const total = rows.reduce((s, r) => s + r.duration, 0)
  return rows.map((r, rank) => ({
    sport: r.sport,
    label: formatSportType(r.sport),
    color: sportColor(rank),
    time: formatCompactDuration(r.duration),
    percent: total > 0 ? Math.round((r.duration / total) * 100) : 0
  }))
})

const ariaLabel = computed(() => shares.value.map(s => `${s.label} ${s.percent} %`).join(', '))
</script>

<style scoped>
.card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.3rem 1rem;
  margin-bottom: 0.9rem;
}

.card-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-color);
}

.card-note {
  font-size: 0.82rem;
  color: var(--text-faint);
}

.bar {
  display: flex;
  height: 1.6rem;
  gap: 2px;
}

.rows {
  list-style: none;
  margin: 0.9rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.rows li {
  display: grid;
  grid-template-columns: 0.8rem 1fr auto 3.5rem;
  align-items: center;
  gap: 0.7rem;
  min-height: 2.4rem;
  border-top: 1px solid var(--border-subtle);
}

.swatch {
  width: 0.8rem;
  height: 0.8rem;
}

.name {
  font-weight: 600;
  color: var(--text-color);
}

.value,
.percent {
  font-family: var(--font-mono);
  color: var(--text-color);
  text-align: right;
}

.percent {
  color: var(--text-faint);
}
</style>
