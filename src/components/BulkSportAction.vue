<template>
  <div class="bsa">
    <!-- Kept small on purpose: correcting a sport is rare, so it sits behind
         an icon rather than beside the actions a selection is usually for. -->
    <button
      type="button"
      class="bsa__open"
      :disabled="!ids.length"
      :aria-label="t('feed.select.changeSport')"
      :title="t('feed.select.changeSport')"
      data-test="bulk-sport-open"
      @click="open = true"
    >
      <i class="fas fa-ellipsis" aria-hidden="true"></i>
    </button>

    <div v-if="open" class="bsa__backdrop" @click.self="open = false">
      <form
        class="bsa__sheet"
        role="dialog"
        aria-modal="true"
        :aria-label="t('feed.select.sportTitle', ids.length)"
        data-test="bulk-sport-sheet"
        @submit.prevent="apply"
        @keydown.esc="open = false"
      >
        <h3>{{ t('feed.select.sportTitle', ids.length) }}</h3>
        <p class="bsa__help">{{ t('feed.select.sportHelp') }}</p>
        <select v-model="sport" class="bsa__select" required data-test="bulk-sport-select">
          <option value="" disabled>{{ t('feed.select.sportPick') }}</option>
          <optgroup v-if="mine.length" :label="t('feed.select.sportMine')">
            <option v-for="s in mine" :key="s" :value="s">{{ formatSportType(s) }}</option>
          </optgroup>
          <optgroup :label="t('feed.select.sportOthers')">
            <option v-for="s in others" :key="s" :value="s">{{ formatSportType(s) }}</option>
          </optgroup>
        </select>
        <div class="bsa__actions">
          <button
            type="submit"
            class="bsa__primary"
            :disabled="!sport || busy"
            data-test="bulk-sport-apply"
          >
            {{ t('feed.select.apply') }}
          </button>
          <button type="button" class="bsa__secondary" @click="open = false">
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
import { SPORT_TYPES, canonicalSport, isSportType } from '@/types/sport'
import { formatSportType } from '@/utils/sportLabels'
import { getActivityService } from '@/services/ActivityService'
import { ToastService } from '@/services/ToastService'

const props = defineProps<{
  ids: string[]
  /** The sports the reader's own activities carry, to list first. */
  sports: string[]
}>()
const emit = defineEmits<{ done: [] }>()

const { t } = useI18n()

const open = ref(false)
const busy = ref(false)
const sport = ref('')

const byLabel = (a: string, b: string) => formatSportType(a).localeCompare(formatSportType(b))

/** Real sports only: a menu choice such as "road running" is no sport to store. */
const mine = computed(() =>
  [...new Set(props.sports.map(canonicalSport))].filter(isSportType).sort(byLabel)
)
const others = computed(() => SPORT_TYPES.filter(s => !mine.value.includes(s)).sort(byLabel))

async function apply() {
  if (!sport.value) return
  busy.value = true
  try {
    const service = await getActivityService()
    await service.setSport(props.ids, sport.value)
    ToastService.push(t('feed.select.sportDone', props.ids.length), { type: 'success' })
    open.value = false
    sport.value = ''
    emit('done')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.bsa__open {
  width: 2.75rem;
  height: 2.75rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-muted);
  font-size: 1.1rem;
  cursor: pointer;
}

.bsa__open:disabled {
  opacity: 0.4;
  cursor: default;
}

.bsa__backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: color-mix(in srgb, var(--color-ink) 40%, transparent);
}

.bsa__sheet {
  width: 100%;
  max-width: 600px;
  padding: 1.25rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom));
  background: var(--surface);
  box-shadow: var(--shadow-float);
}

.bsa__sheet h3 {
  margin: 0 0 0.25rem;
}

.bsa__help {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.bsa__select {
  width: 100%;
  min-height: 2.75rem;
  padding: 0 0.75rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-color);
  font: inherit;
}

.bsa__actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.bsa__primary,
.bsa__secondary {
  min-height: 2.75rem;
  padding: 0 1rem;
  border-radius: var(--radius-sm);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.bsa__primary {
  border: 0;
  background: var(--color-green-600);
  color: var(--color-white);
}

.bsa__primary:disabled {
  opacity: 0.5;
  cursor: default;
}

.bsa__secondary {
  border: 1px solid var(--border-subtle);
  background: var(--surface);
  color: var(--text-color);
}
</style>
