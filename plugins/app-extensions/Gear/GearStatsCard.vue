<template>
  <section v-if="rows.length" class="gsc" data-test="gear-stats">
    <header class="gsc__header">
      <h3 class="gsc__title">
        <i class="fas fa-shoe-prints" aria-hidden="true"></i>
        <span>{{ t('gear.stats.title') }}</span>
      </h3>
      <RouterLink to="/profile?tab=gear" class="gsc__manage">
        {{ t('gear.stats.manage') }}
        <i class="fas fa-arrow-right" aria-hidden="true"></i>
      </RouterLink>
    </header>

    <ul class="gsc__list">
      <li v-for="row in rows" :key="row.gear.id" :class="['gsc__row', `is-${row.level}`]">
        <div class="gsc__line">
          <i :class="['fas', KIND_ICON[row.gear.kind], 'gsc__kind']" aria-hidden="true"></i>
          <span class="gsc__name">{{ row.gear.name }}</span>
          <span class="gsc__usage">{{ usageText(row.gear) }}</span>
        </div>
        <div
          v-if="row.ratio !== null"
          class="gsc__bar"
          role="progressbar"
          :aria-valuenow="Math.round(row.ratio * 100)"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="t('gear.wearLabel')"
        >
          <span :style="{ width: `${Math.min(100, row.ratio * 100)}%` }"></span>
        </div>
        <span v-if="row.ratio !== null" class="gsc__note">
          <template v-if="row.level !== 'ok'">{{ t(`gear.wear.${row.level}`) }} · </template>
          {{ t('gear.stats.percent', { percent: Math.round(row.ratio * 100) }) }}
        </span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { canonicalSport } from '@/types/sport'
import { resolveGear, wearRatio } from '@/utils/gear'
import { KIND_ICON, useGear } from './useGear'

const props = defineProps<{
  /** The dashboard's sport filter; empty for every sport. */
  sport?: string
}>()

const { t } = useI18n()
const { gear, activities, usageOf, levelOf, usageText } = useGear()

/** Gear the dashboard's sport actually wore, so a ride's page does not list shoes. */
const wornForSport = computed(() => {
  if (!props.sport) return null
  const sport = canonicalSport(props.sport)
  const ids = new Set<string>()
  for (const a of activities.value) {
    if (a.deleted || canonicalSport(a.type) !== sport) continue
    for (const g of resolveGear(a, gear.value)) ids.add(g.id)
  }
  return ids
})

/** Gear in service, the most worn against its limit first. */
const rows = computed(() =>
  gear.value
    .filter(g => g.retiredAt === undefined && usageOf(g).count > 0)
    .filter(g => !wornForSport.value || wornForSport.value.has(g.id))
    .map(g => {
      const limited = !!(g.alertDistance || g.alertDuration)
      return { gear: g, level: levelOf(g), ratio: limited ? wearRatio(g, usageOf(g)) : null }
    })
    .sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1))
)
</script>

<style scoped>
/* The dashboard's card, restated: a plugin does not reach into another's files. */
.gsc {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: 0;
  box-shadow: var(--shadow-card);
  padding: 1rem 1.25rem;
  min-width: 0;
}

.gsc__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem 0.75rem;
  margin-bottom: 0.85rem;
}

.gsc__title {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: var(--font-weight-bold);
  color: var(--text-color);
}

.gsc__title i {
  font-size: 1rem;
  line-height: 1;
  color: var(--color-green-500);
}

.gsc__manage {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2.75rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-green-700);
  text-decoration: none;
}

.gsc__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: 1rem 1.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.gsc__row {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.gsc__line {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.gsc__kind {
  color: var(--color-green-600);
}

.gsc__name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gsc__usage {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--text-muted);
  white-space: nowrap;
}

.gsc__bar {
  height: 0.4rem;
  background: var(--surface-muted);
}

.gsc__bar span {
  display: block;
  height: 100%;
  background: var(--color-green-500);
}

.is-warn .gsc__bar span {
  background: var(--color-orange-500);
}

.is-over .gsc__bar span {
  background: var(--color-red-500);
}

.gsc__note {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.is-warn .gsc__note {
  color: var(--color-orange-700);
  font-weight: 600;
}

.is-over .gsc__note {
  color: var(--color-red-600);
  font-weight: 600;
}
</style>
