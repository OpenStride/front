<template>
  <div class="gear-tab" data-test="gear-tab">
    <header class="gear-tab__head">
      <div>
        <h2>{{ t('gear.title') }}</h2>
        <p class="gear-tab__intro">{{ t('gear.intro') }}</p>
      </div>
      <button
        v-if="!editing"
        type="button"
        class="gt-primary"
        data-test="gear-add"
        @click="startCreate"
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
        {{ t('gear.add') }}
      </button>
    </header>

    <GearForm
      v-if="editing"
      :initial="editing === 'new' ? null : editing"
      :sports="sportChoices"
      @save="onSave"
      @cancel="editing = null"
    />

    <p v-if="loaded && !gear.length && !editing" class="gear-tab__empty">
      {{ t('gear.empty') }}
    </p>

    <section v-for="group in groups" :key="group.key" class="gear-tab__group">
      <h3 v-if="group.items.length && group.key === 'retired'">{{ t('gear.retiredTitle') }}</h3>
      <ul class="gear-tab__list">
        <li
          v-for="g in group.items"
          :key="g.id"
          :class="['gt-card', `is-${levelOf(g)}`]"
          data-test="gear-card"
        >
          <div class="gt-card__head">
            <i :class="['fas', KIND_ICON[g.kind], 'gt-card__icon']" aria-hidden="true"></i>
            <div class="gt-card__title">
              <strong>{{ g.name }}</strong>
              <span class="gt-card__sports">{{ sportsText(g) }}</span>
            </div>
            <div class="gt-card__tools">
              <button
                type="button"
                class="gt-icon"
                :aria-label="t('gear.edit')"
                :title="t('gear.edit')"
                @click="editing = g"
              >
                <i class="fas fa-pen" aria-hidden="true"></i>
              </button>
              <button
                type="button"
                class="gt-icon"
                :aria-label="g.retiredAt === undefined ? t('gear.retire') : t('gear.reactivate')"
                :title="g.retiredAt === undefined ? t('gear.retire') : t('gear.reactivate')"
                data-test="gear-retire"
                @click="toggleRetired(g)"
              >
                <i
                  :class="['fas', g.retiredAt === undefined ? 'fa-box-archive' : 'fa-rotate-left']"
                  aria-hidden="true"
                ></i>
              </button>
              <button
                type="button"
                class="gt-icon"
                :aria-label="t('gear.delete')"
                :title="t('gear.delete')"
                @click="remove(g)"
              >
                <i class="fas fa-trash" aria-hidden="true"></i>
              </button>
            </div>
          </div>

          <p class="gt-card__usage">
            <span class="gt-card__figures">{{ usageText(g) }}</span>
            · {{ t('gear.outings', usageOf(g).count) }}
          </p>

          <div v-if="limitOf(g)" class="gt-wear">
            <div
              class="gt-wear__bar"
              role="progressbar"
              :aria-valuenow="Math.round(ratioOf(g) * 100)"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-label="t('gear.wearLabel')"
            >
              <span :style="{ width: `${Math.min(100, ratioOf(g) * 100)}%` }"></span>
            </div>
            <span class="gt-wear__text">
              <template v-if="levelOf(g) !== 'ok'">{{ t(`gear.wear.${levelOf(g)}`) }} · </template>
              {{ t('gear.ofLimit', { percent: Math.round(ratioOf(g) * 100), limit: limitOf(g) }) }}
            </span>
          </div>

          <p class="gt-card__dates">
            {{ t('gear.since', { date: formatDate(g.activeFrom, dateOptions) }) }}
            <template v-if="g.retiredAt !== undefined">
              · {{ t('gear.retiredOn', { date: formatDate(g.retiredAt, dateOptions) }) }}
            </template>
          </p>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Gear, GearInput } from '@/types/gear'
import { canonicalSport } from '@/types/sport'
import { formatSportType } from '@/utils/sportLabels'
import { formatDate } from '@/utils/dateFormat'
import { formatCompactDuration } from '@/utils/duration'
import { wearRatio } from '@/utils/gear'
import GearForm from './GearForm.vue'
import { KIND_ICON, useGear } from './useGear'

const { t } = useI18n()
const { ctx, gear, activities, loaded, usageOf, levelOf, usageText, distanceText } = useGear()

const dateOptions: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }

/** `'new'` for the creation form, a gear for its edit form. */
const editing = ref<Gear | 'new' | null>(null)

function startCreate() {
  editing.value = 'new'
}

/** The sports the reader actually does, so the list is theirs and not the app's forty. */
const sportChoices = computed(() => {
  const counts = new Map<string, number>()
  for (const a of activities.value) {
    if (a.deleted) continue
    const s = canonicalSport(a.type)
    if (s) counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  for (const g of gear.value) for (const s of g.sports) if (!counts.has(s)) counts.set(s, 0)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s)
})

const groups = computed(() => {
  const byStart = (a: Gear, b: Gear) => b.activeFrom - a.activeFrom
  return [
    { key: 'active', items: gear.value.filter(g => g.retiredAt === undefined).sort(byStart) },
    { key: 'retired', items: gear.value.filter(g => g.retiredAt !== undefined).sort(byStart) }
  ]
})

function sportsText(g: Gear): string {
  return g.sports.length ? g.sports.map(formatSportType).join(', ') : t('gear.noDefault')
}

const ratioOf = (g: Gear) => wearRatio(g, usageOf(g))

function limitOf(g: Gear): string | null {
  if (g.alertDistance) return distanceText(g.alertDistance)
  if (g.alertDuration) return formatCompactDuration(g.alertDuration)
  return null
}

async function onSave(input: GearInput) {
  if (editing.value && editing.value !== 'new') await ctx.gear.update(editing.value.id, input)
  else await ctx.gear.create(input)
  editing.value = null
}

async function toggleRetired(g: Gear) {
  await ctx.gear.update(g.id, { retiredAt: g.retiredAt === undefined ? Date.now() : undefined })
}

async function remove(g: Gear) {
  if (!window.confirm(t('gear.confirmDelete', { name: g.name }))) return
  await ctx.gear.remove(g.id)
}
</script>

<style scoped>
.gear-tab {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.gear-tab__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.gear-tab__head h2 {
  margin: 0;
  font-family: var(--font-display);
}

.gear-tab__intro,
.gear-tab__empty {
  margin: 0.25rem 0 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.gear-tab__group h3 {
  margin: 0 0 0.75rem;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.gear-tab__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.gt-card {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: 0;
  box-shadow: var(--shadow-card);
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.gt-card__head {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.gt-card__icon {
  margin-top: 0.2rem;
  font-size: 1.1rem;
  color: var(--color-green-600);
}

.gt-card__title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.gt-card__sports,
.gt-card__dates {
  font-size: 0.8rem;
  color: var(--text-faint);
  margin: 0;
}

.gt-card__tools {
  display: flex;
}

.gt-icon {
  width: 2.75rem;
  height: 2.75rem;
  border: 0;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.gt-icon:hover {
  color: var(--color-green-700);
  background: var(--surface-muted);
}

.gt-card__usage {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-muted);
}

.gt-card__figures {
  font-family: var(--font-mono);
  font-size: 1.05rem;
  color: var(--text-color);
}

.gt-wear {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.gt-wear__bar {
  height: 0.4rem;
  background: var(--surface-muted);
}

.gt-wear__bar span {
  display: block;
  height: 100%;
  background: var(--color-green-500);
}

.gt-wear__text {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.is-warn .gt-wear__bar span {
  background: var(--color-orange-500);
}
.is-warn .gt-wear__text {
  color: var(--color-orange-700);
  font-weight: 600;
}

.is-over .gt-wear__bar span {
  background: var(--color-red-500);
}
.is-over .gt-wear__text {
  color: var(--color-red-600);
  font-weight: 600;
}

.gt-primary {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.75rem;
  padding: 0 1rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--color-green-600);
  color: var(--color-white);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
</style>
