<template>
  <section class="ga" data-test="gear-assign">
    <header class="ga__head">
      <h3>{{ t('gear.assign.title', { name: target.name }) }}</h3>
      <button
        type="button"
        class="ga__close"
        :aria-label="t('common.cancel')"
        :title="t('common.cancel')"
        @click="emit('close')"
      >
        <i class="fas fa-xmark" aria-hidden="true"></i>
      </button>
    </header>

    <!-- Narrow the outings first: a sport, a period, and for a trail pair the
         climb that tells a trail from a road run the watch got wrong. -->
    <div class="ga__filters">
      <label class="ga__field">
        <span>{{ t('gear.assign.sport') }}</span>
        <select v-model="sport" data-test="assign-sport">
          <option value="">{{ t('filters.allSports') }}</option>
          <option v-for="s in sportChoices" :key="s" :value="s">{{ formatSportType(s) }}</option>
        </select>
      </label>
      <label class="ga__field">
        <span>{{ t('filters.dateFrom') }}</span>
        <input v-model="from" type="date" data-test="assign-from" />
      </label>
      <label class="ga__field">
        <span>{{ t('filters.dateTo') }}</span>
        <input v-model="to" type="date" data-test="assign-to" />
      </label>
      <label class="ga__field">
        <span>{{ t('gear.assign.climb', { unit: climbUnit }) }}</span>
        <input
          v-model.number="climbMin"
          type="number"
          min="0"
          step="5"
          inputmode="numeric"
          :placeholder="t('filters.min')"
          data-test="assign-climb"
        />
      </label>
    </div>

    <div class="ga__bar">
      <span class="ga__count">{{ t('gear.assign.count', candidates.length) }}</span>
      <button
        v-if="candidates.length"
        type="button"
        class="ga__link"
        data-test="assign-all"
        @click="toggleAll"
      >
        {{ allPicked ? t('gear.assign.none') : t('gear.assign.all') }}
      </button>
    </div>

    <ul class="ga__list">
      <li v-for="row in candidates" :key="row.activity.id">
        <label class="ga__row">
          <input v-model="picked" type="checkbox" :value="row.activity.id" />
          <span class="ga__main">
            <span class="ga__title">{{
              row.activity.title || formatSportType(row.activity.type)
            }}</span>
            <span class="ga__meta">
              {{ row.date }} · {{ formatSportType(row.activity.type) }} · {{ row.distance }}
              <template v-if="row.climb !== null"> · {{ row.climb }} {{ climbUnit }}</template>
            </span>
          </span>
          <span class="ga__worn" :class="{ 'is-target': row.wearsTarget }">{{ row.worn }}</span>
        </label>
      </li>
    </ul>

    <!-- A trail pair put on runs: the same gesture can file them as trails. -->
    <label v-if="retypeTo && toRetype.length" class="ga__retype" data-test="assign-retype">
      <input v-model="retype" type="checkbox" />
      {{ t('gear.assign.retype', { count: toRetype.length, sport: formatSportType(retypeTo) }) }}
    </label>

    <div class="ga__actions">
      <button
        type="button"
        class="ga__primary"
        :disabled="!picked.length || busy"
        data-test="assign-apply"
        @click="apply"
      >
        {{ t('gear.assign.apply', picked.length) }}
      </button>
      <button type="button" class="ga__secondary" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Activity } from '@/types/activity'
import type { Gear } from '@/types/gear'
import { canonicalSport, matchesSportScope, sportScopes, topSportScope } from '@/types/sport'
import { applyGearPick, resolveGear } from '@/utils/gear'
import { formatSportType } from '@/utils/sportLabels'
import { formatDate } from '@/utils/dateFormat'
import { fromDayKey, getDayKey } from '@/utils/dateKeys'
import { toMs } from '@/utils/timeRange'
import { DERIVED, useActivityMetricsIndex } from '@/composables/useActivityMetricsIndex'
import { usePluginContext } from '@/composables/usePluginContext'

const props = defineProps<{
  target: Gear
  gear: Gear[]
  activities: Activity[]
}>()
const emit = defineEmits<{ close: []; done: [] }>()

const { t } = useI18n()
const ctx = usePluginContext()
const { derived, ensureIndex } = useActivityMetricsIndex()

const own = computed(() =>
  props.activities.filter(a => !a.deleted && !a.provider?.startsWith('friend_'))
)
const sportChoices = computed(() => sportScopes(own.value.map(a => a.type)))

/** The widest menu choice its default sports fall under: trail shoes start on all running. */
function initialSport(): string {
  const first = props.target.sports[0]
  return first ? topSportScope(first, sportChoices.value) : ''
}

const sport = ref(initialSport())
const from = ref(getDayKey(new Date(props.target.activeFrom)))
const to = ref(getDayKey(new Date(props.target.retiredAt ?? Date.now())))
const climbMin = ref<number | ''>('')
const picked = ref<string[]>([])
const retype = ref(false)
const busy = ref(false)

// Height per distance in the reader's units, as the feed's climb filter reads it.
const metresPerDistanceUnit = computed(() => 1 / ctx.units.convert('distance', 1).value)
const climbUnit = computed(
  () => `${ctx.units.convert('elevation', 0).unit}/${ctx.units.convert('distance', 0).unit}`
)
const climbOf = (a: Activity): number | null => {
  const ascent = derived.value.get(a.id)?.[DERIVED.ascent]
  if (ascent === undefined || !(a.distance > 0)) return null
  return Math.round(
    ctx.units.convert('elevation', (ascent / a.distance) * metresPerDistanceUnit.value).value
  )
}

const inRange = computed(() => {
  const start = fromDayKey(from.value, 'start') ?? -Infinity
  const end = fromDayKey(to.value, 'end') ?? Infinity
  return own.value
    .filter(a => matchesSportScope(sport.value, a.type))
    .filter(a => {
      const at = toMs(a.startTime)
      return at >= start && at <= end
    })
    .sort((a, b) => toMs(b.startTime) - toMs(a.startTime))
})

// The climb lives in the details: the local index lifts it once for these outings.
watch(
  inRange,
  list => {
    if (list.length) void ensureIndex(list).catch(() => undefined)
  },
  { immediate: true }
)

const candidates = computed(() =>
  inRange.value
    .map(a => ({ activity: a, climb: climbOf(a) }))
    .filter(row => climbMin.value === '' || (row.climb !== null && row.climb >= climbMin.value))
    .map(({ activity, climb }) => {
      const worn = resolveGear(activity, props.gear)
      return {
        activity,
        climb,
        date: formatDate(toMs(activity.startTime), {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        }),
        distance: ctx.units.format('distance', activity.distance || 0).text,
        worn: worn.length ? worn.map(g => g.name).join(', ') : t('gear.activity.none'),
        wearsTarget: worn.some(g => g.id === props.target.id)
      }
    })
)

// What is picked stays among what is listed.
watch(candidates, rows => {
  const shown = new Set(rows.map(r => r.activity.id))
  picked.value = picked.value.filter(id => shown.has(id))
})

const allPicked = computed(
  () => candidates.value.length > 0 && picked.value.length === candidates.value.length
)
function toggleAll() {
  picked.value = allPicked.value ? [] : candidates.value.map(r => r.activity.id)
}

/** A gear made for one sport only offers to file the outings it is put on under it. */
const retypeTo = computed(() =>
  props.target.sports.length === 1 ? canonicalSport(props.target.sports[0]) : null
)
const toRetype = computed(() =>
  retypeTo.value
    ? own.value.filter(
        a => picked.value.includes(a.id) && canonicalSport(a.type) !== retypeTo.value
      )
    : []
)

async function apply() {
  busy.value = true
  try {
    const chosen = own.value.filter(a => picked.value.includes(a.id))
    // Outings that end up with the same gear are written in one call.
    const groups = new Map<string, { gearIds: string[]; ids: string[] }>()
    for (const a of chosen) {
      const gearIds = applyGearPick(a, props.gear, [props.target])
      const key = [...gearIds].sort().join('|')
      const group = groups.get(key) ?? { gearIds, ids: [] }
      group.ids.push(a.id)
      groups.set(key, group)
    }
    if (retype.value && retypeTo.value && toRetype.value.length) {
      await ctx.activity.setSport(
        toRetype.value.map(a => a.id),
        retypeTo.value
      )
    }
    for (const { gearIds, ids } of groups.values()) await ctx.activity.setGear(ids, gearIds)
    ctx.notifications.notify(t('gear.assign.done', chosen.length), { type: 'success' })
    emit('done')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.ga {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1rem 1.25rem;
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-card);
}

.ga__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.ga__head h3 {
  margin: 0;
}

.ga__close {
  width: 2.75rem;
  height: 2.75rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}

.ga__filters {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
  gap: 0.75rem;
}

.ga__field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.ga__field select,
.ga__field input {
  min-height: 2.75rem;
  padding: 0 0.6rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-color);
  font: inherit;
  font-size: 0.95rem;
}

.ga__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.ga__link {
  min-height: 2.75rem;
  border: 0;
  background: none;
  text-transform: none;
  letter-spacing: 0;
  color: var(--color-green-700);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.ga__list {
  max-height: 22rem;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--border-subtle);
}

.ga__list li {
  border-bottom: 1px solid var(--border-subtle);
}

.ga__row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 3rem;
  padding: 0.35rem 0.25rem;
  cursor: pointer;
}

.ga__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ga__title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ga__meta {
  font-size: 0.78rem;
  color: var(--text-faint);
}

.ga__worn {
  max-width: 35%;
  font-size: 0.78rem;
  color: var(--text-faint);
  text-align: right;
}

.ga__worn.is-target {
  color: var(--color-green-700);
  font-weight: 600;
}

.ga__retype {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 2.75rem;
  font-size: 0.9rem;
  cursor: pointer;
}

.ga__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.ga__primary,
.ga__secondary {
  min-height: 2.75rem;
  padding: 0 1rem;
  border-radius: var(--radius-sm);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.ga__primary {
  border: 0;
  background: var(--color-green-600);
  color: var(--color-white);
}

.ga__primary:disabled {
  opacity: 0.5;
  cursor: default;
}

.ga__secondary {
  border: 1px solid var(--border-subtle);
  background: var(--surface);
  color: var(--text-color);
}
</style>
