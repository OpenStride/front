<template>
  <form class="gf" data-test="gear-form" @submit.prevent="submit">
    <h3>{{ initial ? t('gear.edit') : t('gear.add') }}</h3>

    <label class="gf__field">
      <span>{{ t('gear.form.name') }}</span>
      <input
        v-model.trim="name"
        type="text"
        required
        :placeholder="t('gear.form.namePlaceholder')"
        data-test="gear-name"
      />
    </label>

    <fieldset class="gf__field">
      <legend>{{ t('gear.form.kind') }}</legend>
      <div class="gf__kinds">
        <label v-for="k in GEAR_KINDS" :key="k" :class="['gf__kind', { 'is-on': kind === k }]">
          <input v-model="kind" type="radio" :value="k" class="gf__sr" @change="onKind" />
          <i :class="['fas', KIND_ICON[k]]" aria-hidden="true"></i>
          {{ t(`gear.kinds.${k}`) }}
        </label>
      </div>
    </fieldset>

    <!-- Road and trail shoes are two pairs: a new pair says which it is, so it
         does not become the default for both. -->
    <fieldset v-if="kind === 'shoes' && !initial" class="gf__field">
      <legend>{{ t('gear.form.terrain') }}</legend>
      <div class="gf__kinds">
        <label
          v-for="tr in TERRAINS"
          :key="tr"
          :class="['gf__kind', { 'is-on': terrain === tr }]"
          :data-test="`gear-terrain-${tr}`"
        >
          <input v-model="terrain" type="radio" :value="tr" class="gf__sr" @change="onTerrain" />
          <i :class="['fas', tr === 'road' ? 'fa-road' : 'fa-mountain']" aria-hidden="true"></i>
          {{ t(`gear.terrain.${tr}`) }}
        </label>
      </div>
    </fieldset>

    <fieldset class="gf__field">
      <legend>{{ t('gear.form.sports') }}</legend>
      <p class="gf__help">{{ t('gear.form.sportsHelp') }}</p>
      <div class="gf__sports">
        <label
          v-for="s in sportChoices"
          :key="s"
          :class="['gf__chip', { 'is-on': picked.includes(s) }]"
          :data-test="`gear-sport-${s}`"
        >
          <input v-model="picked" type="checkbox" :value="s" class="gf__sr" />
          {{ formatSportType(s) }}
        </label>
      </div>
    </fieldset>

    <div class="gf__grid">
      <label class="gf__field">
        <span>{{ t('gear.form.activeFrom') }}</span>
        <input v-model="activeFrom" type="date" required />
      </label>
      <label class="gf__field">
        <span>{{ t('gear.form.initialDistance', { unit: distanceUnit }) }}</span>
        <input
          v-model.number="initialDistance"
          type="number"
          min="0"
          step="any"
          inputmode="decimal"
        />
      </label>
      <label class="gf__field">
        <span>{{ t('gear.form.alertDistance', { unit: distanceUnit }) }}</span>
        <input
          v-model.number="alertDistance"
          type="number"
          min="0"
          step="any"
          inputmode="decimal"
          data-test="gear-alert-distance"
        />
      </label>
      <label class="gf__field">
        <span>{{ t('gear.form.alertDuration') }}</span>
        <input v-model.number="alertHours" type="number" min="0" step="any" inputmode="decimal" />
      </label>
    </div>
    <p class="gf__help">{{ t('gear.form.alertHelp') }}</p>

    <div class="gf__actions">
      <button type="submit" class="gf__primary" data-test="gear-submit">
        {{ t('common.save') }}
      </button>
      <button type="button" class="gf__secondary" @click="emit('cancel')">
        {{ t('common.cancel') }}
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePluginContext } from '@/composables/usePluginContext'
import {
  DEFAULT_ALERT_DISTANCE,
  GEAR_KINDS,
  type Gear,
  type GearInput,
  type GearKind
} from '@/types/gear'
import { SPORT_FAMILY, isSportType } from '@/types/sport'
import { formatSportType } from '@/utils/sportLabels'
import { fromDayKey, getDayKey } from '@/utils/dateKeys'
import { KIND_ICON } from './useGear'

const props = defineProps<{
  initial: Gear | null
  /** The reader's sports, most practised first. */
  sports: string[]
}>()
const emit = defineEmits<{ save: [input: GearInput]; cancel: [] }>()

const { t } = useI18n()
const { units } = usePluginContext()

const distanceUnit = computed(() => units.convert('distance', 1).unit)

/** SI → the reader's unit, rounded to what anyone would type. */
const shown = (si: number | undefined) =>
  si === undefined ? undefined : Math.round(units.convert('distance', si).value)

const g = props.initial
const name = ref(g?.name ?? '')
const kind = ref<GearKind>(g?.kind ?? 'shoes')
type Terrain = 'road' | 'trail'
const TERRAINS: Terrain[] = ['road', 'trail']
const terrain = ref<Terrain>('road')
const picked = ref<string[]>(g ? [...g.sports] : shoeSports('road'))
const activeFrom = ref(getDayKey(new Date(g?.activeFrom ?? Date.now())))
const initialDistance = ref<number | undefined>(shown(g?.initialDistance))
const alertDistance = ref<number | undefined>(
  shown(g ? g.alertDistance : DEFAULT_ALERT_DISTANCE.shoes)
)
const alertHours = ref<number | undefined>(
  g?.alertDuration ? Math.round(g.alertDuration / 3600) : undefined
)

const TRAIL = 'trail_running'

/**
 * Road shoes default to the reader's running sports other than trail (treadmill
 * included), trail shoes to trail alone — offered even before a first trail
 * outing, since the pair usually comes first.
 */
function shoeSports(t: Terrain): string[] {
  if (t === 'trail') return [TRAIL]
  const road = props.sports.filter(
    s => isSportType(s) && SPORT_FAMILY[s] === 'running' && s !== TRAIL
  )
  return road.length ? road : ['running']
}

/** The usual sports of a new gear of this kind. */
function defaultSports(k: GearKind): string[] {
  if (k === 'shoes') return shoeSports(terrain.value)
  if (k === 'bike') return props.sports.filter(s => isSportType(s) && SPORT_FAMILY[s] === 'cycling')
  return []
}

/** The reader's sports, plus any a default picked that they have not done yet. */
const sportChoices = computed(() => [
  ...props.sports,
  ...picked.value.filter(s => !props.sports.includes(s))
])

function onTerrain() {
  picked.value = shoeSports(terrain.value)
}

/** A new gear's kind decides its usual sports and limit; an existing one keeps its own. */
function onKind() {
  if (g) return
  picked.value = defaultSports(kind.value)
  alertDistance.value = shown(DEFAULT_ALERT_DISTANCE[kind.value])
}

const toSI = (v: number | undefined | '') =>
  typeof v === 'number' && v > 0 ? units.toSI('distance', v) : undefined

function submit() {
  if (!name.value) return
  emit('save', {
    name: name.value,
    kind: kind.value,
    sports: [...picked.value],
    activeFrom: fromDayKey(activeFrom.value) ?? Date.now(),
    retiredAt: g?.retiredAt,
    initialDistance: toSI(initialDistance.value),
    initialDuration: g?.initialDuration,
    alertDistance: toSI(alertDistance.value),
    alertDuration:
      typeof alertHours.value === 'number' && alertHours.value > 0
        ? alertHours.value * 3600
        : undefined,
    notes: g?.notes
  })
}
</script>

<style scoped>
.gf {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem 1.25rem;
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-card);
}

.gf h3 {
  margin: 0;
}

.gf__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.gf__field legend {
  margin-bottom: 0.35rem;
}

.gf__field input[type='text'],
.gf__field input[type='date'],
.gf__field input[type='number'] {
  min-height: 2.75rem;
  padding: 0 0.75rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-color);
  font: inherit;
  font-size: 1rem;
}

.gf__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: 1rem;
}

.gf__help {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-faint);
}

.gf__kinds,
.gf__sports {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.gf__kind,
.gf__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.75rem;
  padding: 0 0.9rem;
  border: 1px solid var(--border-subtle);
  background: var(--surface);
  color: var(--text-color);
  font-size: 0.9rem;
  cursor: pointer;
}

.gf__kind {
  border-radius: var(--radius-sm);
}

.gf__chip {
  border-radius: var(--radius-pill);
}

.gf__kind.is-on,
.gf__chip.is-on {
  border-color: var(--color-green-600);
  background: var(--color-green-50);
  color: var(--color-green-700);
  font-weight: 600;
}

.gf__kind:focus-within,
.gf__chip:focus-within {
  outline: 2px solid var(--color-green-500);
  outline-offset: 2px;
}

.gf__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.gf__actions {
  display: flex;
  gap: 0.5rem;
}

.gf__primary,
.gf__secondary {
  min-height: 2.75rem;
  padding: 0 1rem;
  border-radius: var(--radius-sm);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.gf__primary {
  border: 0;
  background: var(--color-green-600);
  color: var(--color-white);
}

.gf__secondary {
  border: 1px solid var(--border-subtle);
  background: var(--surface);
  color: var(--text-color);
}
</style>
