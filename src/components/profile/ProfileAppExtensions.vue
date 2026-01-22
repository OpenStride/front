<template>
  <div class="space-y-6">
    <h2 class="text-2xl font-bold">{{ t('appExtensions.title', 'App Extensions') }}</h2>
    <p class="text-gray-600">
      {{
        t('appExtensions.description', 'Manage widgets and features displayed throughout the app')
      }}
    </p>

    <!-- Extensions List -->
    <section>
      <ul v-if="!loading" class="space-y-3">
        <li
          v-for="plugin in allPlugins"
          :key="plugin.id"
          class="flex items-center justify-between bg-white p-4 rounded-lg shadow hover:shadow-md transition"
        >
          <div class="flex items-center space-x-4 flex-1">
            <!-- Icon -->
            <i
              v-if="plugin.icon"
              :class="plugin.icon"
              class="text-2xl text-gray-700"
              aria-hidden="true"
            ></i>
            <i v-else class="fas fa-puzzle-piece text-2xl text-gray-400" aria-hidden="true"></i>

            <!-- Label & Description -->
            <div class="flex-1">
              <div class="font-semibold text-gray-900">{{ plugin.label }}</div>
              <div v-if="plugin.description" class="text-sm text-gray-600 mt-1">
                {{ plugin.description }}
              </div>
            </div>
          </div>

          <!-- Toggle Switch -->
          <label class="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              :checked="enabledPluginIds.includes(plugin.id)"
              @change="handleToggle(plugin.id)"
              :disabled="isToggling"
              class="sr-only peer"
              role="switch"
              :aria-checked="enabledPluginIds.includes(plugin.id)"
              :aria-label="`Toggle ${plugin.label}`"
            />
            <div
              class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"
            ></div>
          </label>
        </li>
      </ul>

      <div v-else class="text-center text-gray-500 py-8 bg-gray-50 rounded-lg">
        <i class="fas fa-spinner fa-spin text-2xl mb-2" aria-hidden="true"></i>
        <p>{{ t('common.loading') }}</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { allAppPlugins } from '@/services/ExtensionPluginRegistry'
import type { ExtensionPlugin } from '@/types/extension'
import { AppExtensionPluginManager } from '@/services/AppExtensionPluginManager'

const { t } = useI18n()

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
    // Reload page to apply changes (PWA-friendly)
    window.location.reload()
  } catch (error) {
    console.error('Failed to toggle plugin:', error)
    isToggling.value = false
  }
}
</script>
