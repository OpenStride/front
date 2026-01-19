<template>
  <div class="space-y-6">
    <h2 class="text-2xl font-bold">{{ t('storageProviders.title') }}</h2>

    <!-- Connected Storage Plugins -->
    <section>
      <h3 class="text-lg font-semibold mb-3">{{ t('storageProviders.myPlugins', 'My Cloud Backups') }}</h3>
      <ul v-if="userStoragePlugins.length" class="space-y-3">
        <li v-for="plugin in userStoragePlugins" :key="plugin.id"
          class="flex items-center justify-between bg-white p-4 rounded-lg shadow hover:shadow-md transition">
          <div class="flex items-center space-x-3">
            <img :src="plugin.icon" alt="logo" class="w-6 h-6" />
            <span class="font-semibold">{{ plugin.label }}</span>
          </div>
          <router-link :to="`/storage-provider/${plugin.id}`"
            class="inline-flex items-center gap-2 px-4 py-1.5 border border-green-600 text-green-600 rounded-md text-sm font-medium hover:bg-green-600 hover:text-white transition-colors duration-200">
            <i class="fas fa-cog"></i>
            {{ t('common.configure') }}
          </router-link>
        </li>
      </ul>
      <p v-else class="text-gray-500 bg-gray-50 p-4 rounded-lg border border-gray-200">
        {{ t('storageProviders.noPlugins') }}
      </p>
    </section>

    <!-- Available Storage Plugins -->
    <section>
      <h3 class="text-lg font-semibold mb-3">{{ t('storageProviders.available') }}</h3>
      <ul class="space-y-3">
        <li v-for="plugin in availableBackups" :key="plugin.id"
          class="flex items-center justify-between bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div class="flex items-center space-x-3">
            <img :src="plugin.icon" alt="logo" class="w-6 h-6" />
            <span>{{ plugin.label }}</span>
          </div>
          <button @click="installBackup(plugin.id)"
            class="bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 text-sm font-medium">
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
import { allStoragePlugins } from '@/services/StoragePluginRegistry'
import type { StoragePlugin } from '@/types/storage'
import { StoragePluginManager } from '@/services/StoragePluginManager'

const { t } = useI18n()

const manager = StoragePluginManager.getInstance()
const userStoragePlugins = ref<StoragePlugin[]>([])

const availableBackups = computed(() =>
  allStoragePlugins.filter(p => !userStoragePlugins.value.find(up => up.id === p.id))
)

onMounted(async () => {
  userStoragePlugins.value = await manager.getMyStoragePlugins()
})

async function installBackup(id: string) {
  await manager.enablePlugin(id)
  userStoragePlugins.value = await manager.getMyStoragePlugins()
}
</script>
