<template>
  <!-- No <h2> here: the tab strip a few pixels above already says "Data
       sources", and the panel repeating it produced three headings for one
       list. The panel is labelled by its tab through aria-labelledby. -->
  <div class="profile-panel">
    <InstallPrompt variant="gate" />

    <section data-test="connected-providers-section">
      <h3 data-test="connected-providers-title">{{ t('dataProviders.myProviders') }}</h3>
      <ul v-if="userProviders.length" class="stack" data-test="connected-providers-list">
        <li
          v-for="provider in userProviders"
          :key="provider.id"
          :data-test="`connected-provider-${provider.id}`"
          class="row-card"
        >
          <img :src="provider.icon" :alt="t('app.providerLogo')" class="row-card__icon" />
          <span class="row-card__label">{{ provider.label }}</span>
          <router-link
            :to="`/data-provider/${provider.id}`"
            :data-test="`configure-provider-${provider.id}`"
            class="btn btn--outline"
          >
            <i class="fas fa-cog" aria-hidden="true"></i>
            {{ t('common.configure') }}
          </router-link>
        </li>
      </ul>
      <p v-else class="panel-empty" data-test="no-providers-message">
        {{ t('dataProviders.noProviders') }}
      </p>
    </section>

    <section data-test="available-providers-section">
      <h3 data-test="available-providers-title">{{ t('dataProviders.available') }}</h3>
      <ul class="stack" data-test="available-providers-list">
        <li
          v-for="provider in availableProviders"
          :key="provider.id"
          :data-test="`available-provider-${provider.id}`"
          class="row-card"
        >
          <img :src="provider.icon" :alt="t('app.providerLogo')" class="row-card__icon" />
          <span class="row-card__label">{{ provider.label }}</span>
          <button
            @click="installProvider(provider.id)"
            :data-test="`add-provider-${provider.id}`"
            class="btn btn--primary"
          >
            {{ t('common.add') }}
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import InstallPrompt from '@/components/InstallPrompt.vue'
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { installableProviderPlugins } from '@/services/ProviderPluginRegistry'
import type { ProviderPlugin } from '@/types/provider'
import { DataProviderPluginManager } from '@/services/DataProviderPluginManager'

const { t } = useI18n()

const manager = DataProviderPluginManager.getInstance()
const userProviders = ref<ProviderPlugin[]>([])

const availableProviders = computed(() =>
  installableProviderPlugins.filter(p => !userProviders.value.find(up => up.id === p.id))
)

onMounted(async () => {
  userProviders.value = await manager.getMyDataProviderPlugins()
})

async function installProvider(id: string) {
  await manager.enablePlugin(id)
  // Sync settings to cloud so the change persists remotely
  const { StorageService } = await import('@/services/StorageService')
  await StorageService.getInstance().triggerBackup([
    { store: 'settings', key: 'enabledDataProviderPlugins' }
  ])
  userProviders.value = await manager.getMyDataProviderPlugins()
}
</script>
