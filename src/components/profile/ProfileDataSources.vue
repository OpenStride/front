<template>
  <div class="space-y-6">
    <h2 class="text-2xl font-bold">{{ t('dataProviders.title') }}</h2>

    <!-- Connected Providers -->
    <section data-test="connected-providers-section">
      <h3 class="text-lg font-semibold mb-3" data-test="connected-providers-title">
        {{ t('dataProviders.myProviders', 'My Data Sources') }}
      </h3>
      <ul v-if="userProviders.length" class="space-y-3" data-test="connected-providers-list">
        <li
          v-for="provider in userProviders"
          :key="provider.id"
          :data-test="`connected-provider-${provider.id}`"
          class="flex items-center justify-between bg-white p-4 rounded-lg shadow hover:shadow-md transition"
        >
          <div class="flex items-center space-x-3">
            <img :src="provider.icon" alt="logo" class="w-6 h-6" />
            <span class="font-semibold">{{ provider.label }}</span>
          </div>
          <router-link
            :to="`/data-provider/${provider.id}`"
            :data-test="`configure-provider-${provider.id}`"
            class="inline-flex items-center gap-2 px-4 py-1.5 border border-green-600 text-green-600 rounded-md text-sm font-medium hover:bg-green-600 hover:text-white transition-colors duration-200"
          >
            <i class="fas fa-cog" aria-hidden="true"></i>
            {{ t('common.configure') }}
          </router-link>
        </li>
      </ul>
      <p v-else class="text-gray-500 bg-gray-50 p-4 rounded-lg border border-gray-200" data-test="no-providers-message">
        {{ t('dataProviders.noProviders') }}
      </p>
    </section>

    <!-- Available Providers -->
    <section data-test="available-providers-section">
      <h3 class="text-lg font-semibold mb-3" data-test="available-providers-title">{{ t('dataProviders.available') }}</h3>
      <ul class="space-y-3" data-test="available-providers-list">
        <li
          v-for="provider in availableProviders"
          :key="provider.id"
          :data-test="`available-provider-${provider.id}`"
          class="flex items-center justify-between bg-gray-50 p-4 rounded-lg border border-gray-200"
        >
          <div class="flex items-center space-x-3">
            <img :src="provider.icon" alt="logo" class="w-6 h-6" />
            <span>{{ provider.label }}</span>
          </div>
          <button
            @click="installProvider(provider.id)"
            :data-test="`add-provider-${provider.id}`"
            class="bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 text-sm font-medium"
          >
            {{ t('common.add') }}
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { allProviderPlugins } from '@/services/ProviderPluginRegistry'
import type { ProviderPlugin } from '@/types/provider'
import { DataProviderPluginManager } from '@/services/DataProviderPluginManager'

const { t } = useI18n()

const manager = DataProviderPluginManager.getInstance()
const userProviders = ref<ProviderPlugin[]>([])

const availableProviders = computed(() =>
  allProviderPlugins.filter(p => !userProviders.value.find(up => up.id === p.id))
)

onMounted(async () => {
  userProviders.value = await manager.getMyDataProviderPlugins()
})

async function installProvider(id: string) {
  await manager.enablePlugin(id)
  userProviders.value = await manager.getMyDataProviderPlugins()
}
</script>
