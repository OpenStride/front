<template>
  <div v-if="gear.length" class="gba">
    <button
      type="button"
      class="gba__open"
      :disabled="!ids.length"
      data-test="gear-bulk-open"
      @click="open = true"
    >
      <i class="fas fa-shoe-prints" aria-hidden="true"></i>
      {{ t('gear.bulk.open') }}
    </button>

    <div v-if="open" class="gba__backdrop" @click.self="open = false">
      <form
        class="gba__sheet"
        role="dialog"
        aria-modal="true"
        :aria-label="t('gear.bulk.title', ids.length)"
        data-test="gear-bulk-sheet"
        @submit.prevent="apply"
        @keydown.esc="open = false"
      >
        <h3>{{ t('gear.bulk.title', ids.length) }}</h3>
        <p class="gba__help">{{ t('gear.bulk.help') }}</p>
        <fieldset>
          <legend class="gba__sr">{{ t('gear.activity.pick') }}</legend>
          <label v-for="g in choices" :key="g.id" class="gba__option">
            <input v-model="picked" type="checkbox" :value="g.id" />
            <i :class="['fas', KIND_ICON[g.kind]]" aria-hidden="true"></i>
            <span>{{ g.name }}</span>
            <small v-if="g.retiredAt !== undefined">{{ t('gear.retired') }}</small>
          </label>
        </fieldset>
        <div class="gba__actions">
          <button
            type="submit"
            class="gba__primary"
            :disabled="!picked.length || busy"
            data-test="gear-bulk-apply"
          >
            {{ t('gear.bulk.apply') }}
          </button>
          <button
            type="button"
            class="gba__secondary"
            :disabled="busy"
            data-test="gear-bulk-default"
            @click="backToDefault"
          >
            {{ t('gear.activity.useDefault') }}
          </button>
          <button type="button" class="gba__secondary" @click="open = false">
            {{ t('common.cancel') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Activity } from '@/types/activity'
import { applyGearPick } from '@/utils/gear'
import { KIND_ICON, useGear } from './useGear'

const props = defineProps<{ ids: string[] }>()
const emit = defineEmits<{ done: [] }>()

const { t } = useI18n()
const { ctx, gear } = useGear()

const open = ref(false)
const busy = ref(false)
const picked = ref<string[]>([])

const choices = computed(() =>
  [...gear.value].sort(
    (a, b) => Number(a.retiredAt !== undefined) - Number(b.retiredAt !== undefined)
  )
)

async function finish(count: number) {
  ctx.notifications.notify(t('gear.bulk.done', count), { type: 'success' })
  open.value = false
  picked.value = []
  emit('done')
}

async function apply() {
  busy.value = true
  try {
    const chosen = gear.value.filter(g => picked.value.includes(g.id))
    const activities = (
      await Promise.all(props.ids.map(id => ctx.activity.getActivity(id)))
    ).filter((a): a is Activity => !!a)
    // Outings that end up with the same gear are written in one call.
    const groups = new Map<string, { gearIds: string[]; ids: string[] }>()
    for (const a of activities) {
      const gearIds = applyGearPick(a, gear.value, chosen)
      const key = [...gearIds].sort().join('|')
      const group = groups.get(key) ?? { gearIds, ids: [] }
      group.ids.push(a.id)
      groups.set(key, group)
    }
    for (const { gearIds, ids } of groups.values()) await ctx.activity.setGear(ids, gearIds)
    await finish(activities.length)
  } finally {
    busy.value = false
  }
}

async function backToDefault() {
  busy.value = true
  try {
    await ctx.activity.setGear(props.ids, null)
    await finish(props.ids.length)
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.gba__open {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
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

.gba__open:disabled {
  opacity: 0.5;
  cursor: default;
}

.gba__backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: color-mix(in srgb, var(--color-ink) 40%, transparent);
}

.gba__sheet {
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
  padding: 1.25rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom));
  background: var(--surface);
  box-shadow: var(--shadow-float);
}

.gba__sheet h3 {
  margin: 0 0 0.25rem;
}

.gba__help {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.gba__sheet fieldset {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  border: 0;
}

.gba__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.gba__option {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 2.75rem;
  cursor: pointer;
}

.gba__option .fas {
  width: 1.1rem;
  color: var(--color-green-600);
}

.gba__option small {
  color: var(--text-faint);
}

.gba__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
}

.gba__primary,
.gba__secondary {
  min-height: 2.75rem;
  padding: 0 1rem;
  border-radius: var(--radius-sm);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.gba__primary {
  border: 0;
  background: var(--color-green-600);
  color: var(--color-white);
}

.gba__primary:disabled {
  opacity: 0.5;
  cursor: default;
}

.gba__secondary {
  border: 1px solid var(--border-subtle);
  background: var(--surface);
  color: var(--text-color);
}
</style>
