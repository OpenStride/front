<template>
  <section
    v-if="alerts.length"
    class="galert"
    data-test="gear-alert"
    :aria-label="t('gear.alert.title')"
  >
    <div v-for="g in alerts" :key="g.id" :class="['galert__row', `is-${levelOf(g)}`]">
      <i class="fas fa-triangle-exclamation galert__icon" aria-hidden="true"></i>
      <div class="galert__text">
        <strong>{{ t(`gear.alert.${levelOf(g)}`, { name: g.name }) }}</strong>
        <span>{{ t('gear.alert.detail', { usage: usageText(g), limit: limitText(g) }) }}</span>
      </div>
      <div class="galert__actions">
        <button type="button" class="galert__btn" data-test="gear-alert-retire" @click="retire(g)">
          {{ t('gear.retire') }}
        </button>
        <button
          type="button"
          class="galert__btn galert__btn--quiet"
          data-test="gear-alert-later"
          @click="later(g)"
        >
          {{ t('gear.alert.later') }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Gear } from '@/types/gear'
import type { WearLevel } from '@/utils/gear'
import { formatCompactDuration } from '@/utils/duration'
import { useGear } from './useGear'

/** Settings key: the level each gear's alert was put off at. */
const DISMISSED_KEY = 'gearAlertsDismissed'

const { t } = useI18n()
const { ctx, gear, levelOf, usageText, distanceText } = useGear()

const dismissed = ref<Record<string, WearLevel>>({})
onMounted(async () => {
  dismissed.value = (await ctx.storage.getData<Record<string, WearLevel>>(DISMISSED_KEY)) ?? {}
})

/**
 * Gear in service past 80 % of its limit. "Later" holds an alert at its level:
 * the same gear speaks again once it crosses into red.
 */
const alerts = computed(() =>
  gear.value.filter(g => {
    const level = levelOf(g)
    return level !== 'ok' && dismissed.value[g.id] !== level
  })
)

function limitText(g: Gear): string {
  if (g.alertDistance) return distanceText(g.alertDistance)
  return formatCompactDuration(g.alertDuration)
}

async function later(g: Gear) {
  dismissed.value = { ...dismissed.value, [g.id]: levelOf(g) }
  await ctx.storage.saveData(DISMISSED_KEY, dismissed.value)
}

async function retire(g: Gear) {
  await ctx.gear.update(g.id, { retiredAt: Date.now() })
}
</script>

<style scoped>
.galert {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.galert__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-left: 4px solid var(--color-orange-500);
  box-shadow: var(--shadow-card);
}

.galert__row.is-over {
  border-left-color: var(--color-red-500);
}

.galert__icon {
  color: var(--color-orange-500);
}

.is-over .galert__icon {
  color: var(--color-red-500);
}

.galert__text {
  flex: 1;
  min-width: 12rem;
  display: flex;
  flex-direction: column;
  font-size: 0.9rem;
}

.galert__text span {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.galert__actions {
  display: flex;
  gap: 0.25rem;
}

.galert__btn {
  min-height: 2.75rem;
  padding: 0 0.75rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-color);
  font-family: var(--font-main);
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0;
  cursor: pointer;
}

.galert__btn--quiet {
  border-color: transparent;
  color: var(--text-muted);
}
</style>
