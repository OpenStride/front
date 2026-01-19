<template>
  <div class="max-w-3xl mx-auto py-10 px-4 space-y-10">
    <section>
      <h1 class="text-2xl font-bold mb-4">{{ t('dataProviders.title') }}</h1>
      <ul v-if="userProviders.length" class="space-y-4">
        <li v-for="provider in userProviders" :key="provider.id"
          class="flex items-center justify-between bg-white p-4 rounded shadow hover:shadow-md transition">
          <div class="flex items-center space-x-4">
            <img :src="provider.icon" alt="logo" class="w-6 h-6" />
            <span class="font-semibold">{{ provider.label }}</span>
          </div>
          <router-link :to="`/data-provider/${provider.id}`"
            class="inline-flex items-center gap-2 px-4 py-1.5 border border-green-600 text-green-600 rounded-md text-sm font-medium hover:bg-green-600 hover:text-white transition-colors duration-200">
            <i class="fas fa-cog"></i>
            {{ t('common.configure') }}
          </router-link>
        </li>
      </ul>
      <p v-else class="text-gray-500">{{ t('dataProviders.noProviders') }}</p>
    </section>

    <section>
      <h2 class="text-xl font-semibold mb-4">{{ t('dataProviders.available') }}</h2>
      <ul class="space-y-4">
        <li v-for="provider in availableProviders" :key="provider.id"
          class="flex items-center justify-between bg-gray-50 p-4 rounded border border-gray-200">
          <div class="flex items-center space-x-4">
            <img :src="provider.icon" alt="logo" class="w-6 h-6" />
            <span>{{ provider.label }}</span>
          </div>
          <button @click="installProvider(provider.id)"
            class="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700">
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
const userDataProviderPlugins = ref<ProviderPlugin[]>([]);

const userProviders = ref<string[]>([])

const availableProviders = computed(() =>
  allProviderPlugins.filter(p => !userProviders.value.find(up => up.id === p.id))
)

onMounted(async () => {
  userProviders.value = await manager.getMyDataProviderPlugins()
})


async function installProvider(id: string) {
  await manager.enablePlugin(id);
  userProviders.value = await manager.getMyDataProviderPlugins()
}
</script>
