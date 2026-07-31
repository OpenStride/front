<template>
  <!-- Structurally the twin of the data-sources panel, and now literally so:
       same markup, same primitives, same words for the same acts. -->
  <div class="profile-panel">
    <section>
      <h3>{{ t('storageProviders.myPlugins') }}</h3>
      <ul v-if="userStoragePlugins.length" class="stack">
        <li v-for="plugin in userStoragePlugins" :key="plugin.id" class="row-card">
          <img :src="plugin.icon" :alt="t('app.providerLogo')" class="row-card__icon" />
          <span class="row-card__label">{{ plugin.label }}</span>
          <router-link :to="`/storage-provider/${plugin.id}`" class="btn btn--outline">
            <i class="fas fa-cog" aria-hidden="true"></i>
            {{ t('common.configure') }}
          </router-link>
        </li>
      </ul>
      <p v-else class="panel-empty">{{ t('storageProviders.noPlugins') }}</p>
    </section>

    <section>
      <h3>{{ t('storageProviders.available') }}</h3>
      <ul class="stack">
        <li v-for="plugin in availableBackups" :key="plugin.id" class="row-card">
          <img :src="plugin.icon" :alt="t('app.providerLogo')" class="row-card__icon" />
          <span class="row-card__label">{{ plugin.label }}</span>
          <button @click="installBackup(plugin.id)" class="btn btn--primary">
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
  // Sync settings to cloud so the change persists remotely
  const { StorageService } = await import('@/services/StorageService')
  await StorageService.getInstance().triggerBackup([
    { store: 'settings', key: 'enabledStoragePlugins' }
  ])
  userStoragePlugins.value = await manager.getMyStoragePlugins()
}
</script>
