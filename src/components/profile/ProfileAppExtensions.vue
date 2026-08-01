<template>
  <div class="profile-panel">
    <section>
      <h3>{{ t('appExtensions.title') }}</h3>
      <p class="panel-lead">{{ t('appExtensions.description') }}</p>

      <ul v-if="!loading" class="stack">
        <li v-for="plugin in allPlugins" :key="plugin.id" class="ext">
          <i :class="plugin.icon || 'fas fa-puzzle-piece'" class="ext__icon" aria-hidden="true"></i>

          <div class="ext__text">
            <span class="ext__label">{{ labelOf(plugin) }}</span>
            <span v-if="descriptionOf(plugin)" class="ext__desc">{{ descriptionOf(plugin) }}</span>
          </div>

          <label class="switch">
            <input
              type="checkbox"
              :checked="enabledPluginIds.includes(plugin.id)"
              @change="handleToggle(plugin.id)"
              :disabled="isToggling"
              role="switch"
              :aria-checked="enabledPluginIds.includes(plugin.id)"
              :aria-label="t('appExtensions.toggle', { name: labelOf(plugin) })"
            />
            <span class="switch__track" aria-hidden="true"></span>
          </label>
        </li>
      </ul>

      <p v-else class="panel-empty">
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        {{ t('common.loading') }}
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { allAppPlugins } from '@/services/ExtensionPluginRegistry'
import type { ExtensionPlugin } from '@/types/extension'
import { AppExtensionPluginManager } from '@/services/AppExtensionPluginManager'

const { t, te } = useI18n()

/**
 * An extension's user-facing name comes from the locale, keyed by its id.
 *
 * Nine plugins declared an English `label` and `description` in their
 * `index.ts`, and the tab showed all nine in English to a French reader —
 * the mirror of the hardcoded French toasts the contracts test now guards.
 * Indexing on the id keeps the translations in the locale files, where a
 * translator can reach them, and leaves the declared string as the fallback
 * for a plugin nobody has translated yet.
 */
const labelOf = (p: ExtensionPlugin) =>
  te(`extensions.${p.id}.label`) ? t(`extensions.${p.id}.label`) : p.label

const descriptionOf = (p: ExtensionPlugin) =>
  te(`extensions.${p.id}.description`) ? t(`extensions.${p.id}.description`) : p.description

const manager = AppExtensionPluginManager.getInstance()
const allPlugins = ref<ExtensionPlugin[]>(allAppPlugins)
const enabledPluginIds = ref<string[]>([])
const loading = ref(true)
const isToggling = ref(false)

onMounted(async () => {
  await loadPluginStates()
  loading.value = false
})

async function loadPluginStates() {
  enabledPluginIds.value = await manager.getEnabledPluginIds()
}

async function handleToggle(pluginId: string) {
  if (isToggling.value) return

  isToggling.value = true
  try {
    await manager.togglePlugin(pluginId)
    // Sync settings to cloud before reload so the change persists remotely
    const { StorageService } = await import('@/services/StorageService')
    await StorageService.getInstance().triggerBackup([
      { store: 'settings', key: 'enabledAppExtensions' }
    ])
    // Reload page to apply changes (PWA-friendly)
    window.location.reload()
  } catch (error) {
    console.error('Failed to toggle plugin:', error)
    isToggling.value = false
  }
}
</script>

<style scoped>
.ext {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.875rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
}

.ext__icon {
  width: 1.5rem;
  flex-shrink: 0;
  text-align: center;
  font-size: 1.125rem;
  color: var(--color-green-600);
}

/* The description used to run under the toggle, which floated on top of it. */
.ext__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.ext__label {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-ink);
}

.ext__desc {
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--text-muted);
}

/* ===== Switch ===== */
.switch {
  position: relative;
  flex-shrink: 0;
  width: 2.75rem;
  height: 1.5rem;
  cursor: pointer;
}

.switch input {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
}

.switch__track {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--color-gray-300);
  transition: background 0.2s;
}

.switch__track::after {
  content: '';
  position: absolute;
  top: 0.125rem;
  left: 0.125rem;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  background: var(--color-white);
  box-shadow: 0 1px 2px rgba(30, 30, 46, 0.25);
  transition: transform 0.2s;
}

.switch input:checked + .switch__track {
  background: var(--color-green-600);
}

.switch input:checked + .switch__track::after {
  transform: translateX(1.25rem);
}

.switch input:focus-visible + .switch__track {
  outline: 2px solid var(--color-green-400);
  outline-offset: 2px;
}

.switch input:disabled + .switch__track {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
