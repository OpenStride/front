<template>
  <div class="max-w-3xl mx-auto py-10 px-4 space-y-10">
    <section>
      <h1 class="text-2xl font-bold mb-4">{{ t('storageProviders.title') }}</h1>
      <ul v-if="userStoragePlugins.length" class="space-y-4">
        <li
          v-for="plugin in userStoragePlugins"
          :key="plugin.id"
          class="flex items-center justify-between bg-white p-4 rounded shadow hover:shadow-md transition"
        >
          <div class="flex items-center space-x-4">
            <img :src="plugin.icon" alt="logo" class="w-6 h-6" />
            <span class="font-semibold">{{ plugin.label }}</span>
          </div>
          <router-link
            :to="`/storage-provider/${plugin.id}`"
            class="inline-flex items-center gap-2 px-4 py-1.5 border border-green-600 text-green-600 rounded-md text-sm font-medium hover:bg-green-600 hover:text-white transition-colors duration-200"
          >
            <i class="fas fa-cog"></i>
            {{ t('common.configure') }}
          </router-link>
        </li>
      </ul>
      <p v-else class="text-gray-500">{{ t('storageProviders.noPlugins') }}</p>
    </section>

    <section>
      <h2 class="text-xl font-semibold mb-4">{{ t('storageProviders.available') }}</h2>
      <ul class="space-y-4">
        <li
          v-for="plugin in availableBackups"
          :key="plugin.id"
          class="flex items-center justify-between bg-gray-50 p-4 rounded border border-gray-200"
        >
          <div class="flex items-center space-x-4">
            <img :src="plugin.icon" alt="logo" class="w-6 h-6" />
            <span>{{ plugin.label }}</span>
          </div>
          <button
            @click="installBackup(plugin.id)"
            class="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
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
import { allStoragePlugins } from '@/services/StoragePluginRegistry'
import type { StoragePlugin } from '@/types/storage'
import { StoragePluginManager } from '@/services/StoragePluginManager'

const { t } = useI18n()

const manager = StoragePluginManager.getInstance()

// 1️⃣ stocke directement les plugins de l'utilisateur
const userStoragePlugins = ref<StoragePlugin[]>([])

// 2️⃣ listes dérivées
const availableBackups = computed(() =>
  allStoragePlugins.filter(p => !userStoragePlugins.value.find(up => up.id === p.id))
)

onMounted(async () => {
  userStoragePlugins.value = await manager.getMyStoragePlugins()
})

async function installBackup(id: string) {
  // ici tu ajoutes l'id dans tes settings via le manager
  await manager.enablePlugin(id) // <-- méthode à implémenter
  userStoragePlugins.value = await manager.getMyStoragePlugins()
}
</script>
