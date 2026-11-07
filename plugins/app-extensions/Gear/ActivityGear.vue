<template>
  <!-- One more tile under the outing's figures, full width: what it was done
       in. Wear shows in the colour of the figures alone, no sentence. -->
  <div v-if="loaded && gear.length" class="ag" data-test="activity-gear">
    <div class="ag__head">
      <span class="ag__label">{{ t('gear.activity.label') }}</span>
      <button
        type="button"
        class="ag__edit"
        :aria-expanded="open"
        :aria-label="t('gear.activity.change')"
        :title="t('gear.activity.change')"
        data-test="gear-edit"
        @click="toggle"
      >
        <i class="fas fa-pen" aria-hidden="true"></i>
      </button>
    </div>

    <ul v-if="resolved.length" class="ag__items">
      <li
        v-for="g in resolved"
        :key="g.id"
        :class="['ag__item', `is-${levelOf(g)}`]"
        data-test="gear-chip"
      >
        <i :class="['fas', KIND_ICON[g.kind], 'ag__kind']" aria-hidden="true"></i>
        <span class="ag__name">{{ g.name }}</span>
        <span class="ag__usage">
          {{ usageText(g) }}
          <span v-if="levelOf(g) !== 'ok'" class="ag__sr"
            >({{ t(`gear.wear.${levelOf(g)}`) }})</span
          >
        </span>
      </li>
    </ul>
    <span v-else class="ag__none">{{ t('gear.activity.none') }}</span>

    <form v-if="open" class="ag__panel" data-test="gear-panel" @submit.prevent="save">
      <fieldset>
        <legend class="ag__sr">{{ t('gear.activity.pick') }}</legend>
        <label v-for="g in choices" :key="g.id" class="ag__option">
          <input v-model="picked" type="checkbox" :value="g.id" />
          <i :class="['fas', KIND_ICON[g.kind], 'ag__kind']" aria-hidden="true"></i>
          <span>{{ g.name }}</span>
          <small v-if="g.retiredAt !== undefined">{{ t('gear.retired') }}</small>
        </label>
      </fieldset>
      <div class="ag__actions">
        <button type="submit" class="ag__primary" data-test="gear-save">
          {{ t('common.save') }}
        </button>
        <button
          v-if="!isDefault"
          type="button"
          class="ag__secondary"
          data-test="gear-reset"
          @click="reset"
        >
          {{ t('gear.activity.useDefault') }}
        </button>
        <button type="button" class="ag__secondary" @click="open = false">
          {{ t('common.cancel') }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Activity, ActivityDetails } from '@/types/activity'
import { isDefaultChoice, resolveGear } from '@/utils/gear'
import { KIND_ICON, useGear } from './useGear'

const props = defineProps<{ data: { activity: Activity; details?: ActivityDetails } }>()
const { t } = useI18n()
const { ctx, gear, activities, loaded, reload, levelOf, usageText } = useGear()

/** The activity as stored now: the page's copy predates any change made here. */
const activity = ref<Activity>(props.data.activity)
watch(
  () => props.data.activity,
  a => (activity.value = a)
)

const resolved = computed(() => resolveGear(activity.value, gear.value))
const isDefault = computed(() => isDefaultChoice(activity.value))

/** Gear in service first; retired gear stays pickable for an old outing. */
const choices = computed(() =>
  [...gear.value].sort(
    (a, b) => Number(a.retiredAt !== undefined) - Number(b.retiredAt !== undefined)
  )
)

const open = ref(false)
const picked = ref<string[]>([])

function toggle() {
  open.value = !open.value
  if (open.value) picked.value = resolved.value.map(g => g.id)
}

async function commit(gearIds: string[] | null) {
  await ctx.activity.setGear([activity.value.id], gearIds)
  activity.value = (await ctx.activity.getActivity(activity.value.id)) ?? activity.value
  open.value = false
  // Wear is counted from every activity, this one's new gear included.
  await reload()
}

const save = () => commit([...picked.value])
const reset = () => commit(null)

// Keep the usage line in step with the outing shown, not with a stale list.
watch(activity, a => {
  const i = activities.value.findIndex(x => x.id === a.id)
  if (i >= 0) activities.value.splice(i, 1, a)
})
</script>

<style scoped>
/* The summary tiles' look (StandardDetails' `atb__substat`), restated: a plugin
   does not reach into another's styles. */
.ag {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--border-subtle);
}

.ag__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 1.5rem;
}

.ag__label {
  font-family: var(--font-condensed);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.ag__edit {
  /* A 44 px target that sits in the tile's corner without growing it */
  width: 2.75rem;
  height: 2.75rem;
  margin: -0.65rem -0.75rem -0.65rem 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-faint);
  font-size: 0.85rem;
  cursor: pointer;
}

.ag__edit:hover,
.ag__edit[aria-expanded='true'] {
  color: var(--color-green-700);
}

.ag__items {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ag__item {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0 8px;
}

.ag__kind {
  width: 1.1rem;
  font-size: 0.85rem;
  color: var(--color-green-600);
}

.ag__name {
  font-weight: 600;
  color: var(--color-ink);
}

.ag__usage {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--text-muted);
  white-space: nowrap;
}

.is-warn .ag__usage {
  color: var(--color-orange-700);
  font-weight: 600;
}

.is-over .ag__usage {
  color: var(--color-red-600);
  font-weight: 600;
}

.ag__none {
  font-size: 14px;
  color: var(--text-faint);
}

.ag__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.ag__panel {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
}

.ag__panel fieldset {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  border: 0;
}

.ag__option {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 2.75rem;
  cursor: pointer;
}

.ag__option small {
  color: var(--text-faint);
}

.ag__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.ag__primary,
.ag__secondary {
  min-height: 2.75rem;
  padding: 0 1rem;
  border-radius: var(--radius-sm);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.ag__primary {
  border: 0;
  background: var(--color-green-600);
  color: var(--color-white);
}

.ag__secondary {
  border: 1px solid var(--border-subtle);
  background: var(--surface);
  color: var(--text-color);
}
</style>
