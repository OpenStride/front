<template>
  <section v-if="loaded && gear.length" class="ag" data-test="activity-gear">
    <div class="ag__row">
      <span class="ag__label">{{ t('gear.activity.label') }}</span>

      <ul v-if="resolved.length" class="ag__chips">
        <li
          v-for="g in resolved"
          :key="g.id"
          :class="['ag__chip', `is-${levelOf(g)}`]"
          data-test="gear-chip"
        >
          <i :class="['fas', KIND_ICON[g.kind]]" aria-hidden="true"></i>
          <span class="ag__name">{{ g.name }}</span>
          <span class="ag__usage">{{ usageText(g) }}</span>
        </li>
      </ul>
      <span v-else class="ag__none">{{ t('gear.activity.none') }}</span>

      <span v-if="isDefault && resolved.length" class="ag__hint">{{
        t('gear.activity.byDefault')
      }}</span>

      <p v-for="g in alerts" :key="`alert-${g.id}`" :class="['ag__alert', `is-${levelOf(g)}`]">
        <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
        {{ t('gear.activity.alert', { name: g.name, status: t(`gear.wear.${levelOf(g)}`) }) }}
      </p>

      <button
        type="button"
        class="ag__edit"
        :aria-expanded="open"
        data-test="gear-edit"
        @click="toggle"
      >
        <i class="fas fa-pen" aria-hidden="true"></i>
        {{ t('gear.activity.change') }}
      </button>
    </div>

    <form v-if="open" class="ag__panel" data-test="gear-panel" @submit.prevent="save">
      <fieldset>
        <legend>{{ t('gear.activity.pick') }}</legend>
        <label v-for="g in choices" :key="g.id" class="ag__option">
          <input v-model="picked" type="checkbox" :value="g.id" />
          <i :class="['fas', KIND_ICON[g.kind]]" aria-hidden="true"></i>
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
  </section>
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
const alerts = computed(() => resolved.value.filter(g => levelOf(g) !== 'ok'))

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
.ag {
  padding: 0.9rem 1.375rem;
  background: var(--surface);
  border-top: 1px solid var(--border-subtle);
}

.ag__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
}

.ag__label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.ag__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ag__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.3rem 0.7rem;
  border-radius: var(--radius-pill);
  background: var(--surface-muted);
  color: var(--text-color);
  font-size: 0.9rem;
}

.ag__chip > .fas {
  color: var(--color-green-600);
}

.ag__name,
.ag__usage {
  white-space: nowrap;
}

.ag__name {
  font-weight: 600;
}

.ag__usage {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--text-muted);
}

.ag__chip.is-warn {
  box-shadow: inset 0 0 0 1px var(--color-orange-500);
}
.ag__chip.is-warn .ag__usage,
.ag__alert.is-warn {
  color: var(--color-orange-700);
}

.ag__chip.is-over {
  background: var(--color-red-50);
  box-shadow: inset 0 0 0 1px var(--color-red-500);
}
.ag__chip.is-over .ag__usage,
.ag__alert.is-over {
  color: var(--color-red-600);
}

.ag__alert {
  flex-basis: 100%;
  order: 1;
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
}

.ag__none,
.ag__hint {
  font-size: 0.85rem;
  color: var(--text-faint);
}

.ag__edit {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2.75rem;
  padding: 0 0.5rem;
  border: 0;
  background: none;
  color: var(--color-green-700);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.ag__panel {
  margin-top: 0.75rem;
  padding: 0.9rem 1rem;
  background: var(--surface-muted);
  border-radius: var(--radius-md);
}

.ag__panel fieldset {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  border: 0;
}

.ag__panel legend {
  margin-bottom: 0.4rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.ag__option {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 2.75rem;
  cursor: pointer;
}

.ag__option .fas {
  width: 1.1rem;
  color: var(--color-green-600);
}

.ag__option small {
  color: var(--text-faint);
}

.ag__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
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
