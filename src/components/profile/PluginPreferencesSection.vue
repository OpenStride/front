<template>
  <section
    v-if="isLoading || preferences.length"
    class="plugin-prefs"
    data-test="plugin-preferences"
  >
    <h3 class="plugin-prefs__title">{{ t('preferences.pluginSection.title') }}</h3>
    <p class="plugin-prefs__intro">{{ t('preferences.pluginSection.intro') }}</p>

    <p v-if="isLoading" class="plugin-prefs__loading">
      <i class="fas fa-sync fa-spin" aria-hidden="true"></i>
      {{ t('preferences.pluginSection.loading') }}
    </p>

    <div
      v-for="preference in preferences"
      v-else
      :key="preference.storageKey"
      class="plugin-prefs__item"
    >
      <label class="plugin-prefs__label" :for="controlId(preference)">
        {{ translate(preference.declaration.label) }}
        <span class="plugin-prefs__owner">{{ preference.pluginLabel }}</span>
      </label>

      <select
        v-if="preference.declaration.type === 'select'"
        :id="controlId(preference)"
        class="plugin-prefs__control"
        :value="String(preference.value ?? '')"
        :data-test="`plugin-preference-${preference.storageKey}`"
        @change="onChange(preference, ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="option in preference.options" :key="option.value" :value="option.value">
          {{ translate(option.label) }}
        </option>
      </select>

      <input
        v-else-if="preference.declaration.type === 'boolean'"
        :id="controlId(preference)"
        type="checkbox"
        class="plugin-prefs__checkbox"
        :checked="preference.value === true"
        :data-test="`plugin-preference-${preference.storageKey}`"
        @change="onChange(preference, ($event.target as HTMLInputElement).checked)"
      />

      <input
        v-else-if="preference.declaration.type === 'number'"
        :id="controlId(preference)"
        type="number"
        class="plugin-prefs__control"
        :value="preference.value ?? ''"
        :data-test="`plugin-preference-${preference.storageKey}`"
        @change="onChange(preference, Number(($event.target as HTMLInputElement).value))"
      />

      <input
        v-else
        :id="controlId(preference)"
        type="text"
        class="plugin-prefs__control"
        :value="preference.value ?? ''"
        :data-test="`plugin-preference-${preference.storageKey}`"
        @change="onChange(preference, ($event.target as HTMLInputElement).value)"
      />

      <p v-if="preference.declaration.description" class="plugin-prefs__hint">
        {{ translate(preference.declaration.description) }}
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { listVisiblePreferences } from '@/services/PluginPreferencesRegistry'
import { PluginPreferencesService } from '@/services/PluginPreferencesService'
import type { PluginPreferenceValue, ResolvedPluginPreference } from '@/types/plugin-preferences'

const { t, te } = useI18n()

const preferences = ref<ResolvedPluginPreference[]>([])
const isLoading = ref(true)

/**
 * Declarations carry i18n keys, except for labels only known at runtime (a
 * plugin's own name among the choices of a select). Translate what resolves,
 * show the rest as-is.
 */
const translate = (label?: string): string => {
  if (!label) return ''
  return te(label) ? t(label) : label
}

const controlId = (preference: ResolvedPluginPreference): string =>
  `plugin-pref-${preference.storageKey.replace(/[^a-zA-Z0-9-]/g, '-')}`

const load = async () => {
  isLoading.value = true
  try {
    preferences.value = await listVisiblePreferences()
  } catch (error) {
    console.error('[PluginPreferences] Failed to load preferences', error)
    preferences.value = []
  } finally {
    isLoading.value = false
  }
}

const onChange = async (preference: ResolvedPluginPreference, value: PluginPreferenceValue) => {
  await PluginPreferencesService.getInstance().set(preference.storageKey, value)
  // Re-read rather than patching in place: a change can alter another
  // preference's resolved options.
  await load()
}

onMounted(load)
</script>

<style scoped>
.plugin-prefs {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-subtle);
}

.plugin-prefs__title {
  font-family: var(--font-display);
  font-size: 1.125rem;
  font-weight: 800;
  color: var(--text-color);
  margin: 0;
}

.plugin-prefs__intro,
.plugin-prefs__loading,
.plugin-prefs__hint {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.plugin-prefs__hint {
  color: var(--text-faint);
}

.plugin-prefs__item {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.plugin-prefs__label {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: var(--font-weight-bold);
  color: var(--text-color);
}

.plugin-prefs__owner {
  font-family: var(--font-condensed);
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--text-faint);
}

.plugin-prefs__control {
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-family: inherit;
  font-size: 0.9375rem;
  color: var(--text-color);
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.plugin-prefs__control:focus {
  outline: 2px solid var(--color-green-400);
  outline-offset: 1px;
}

.plugin-prefs__checkbox {
  width: 1.125rem;
  height: 1.125rem;
  accent-color: var(--color-green-500);
}
</style>
