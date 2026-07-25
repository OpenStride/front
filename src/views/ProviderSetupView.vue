<!-- src/views/ProviderSetupView.vue -->
<template>
  <div v-if="setupComponent">
    <component :is="setupComponent" />
  </div>
  <p v-else>{{ t('setup.providerNotFound') }}</p>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { shallowRef, onMounted, type Component as VueComponent } from 'vue'
import { useRoute } from 'vue-router'
import { allProviderPlugins } from '@/services/ProviderPluginRegistry'

const { t } = useI18n()

const route = useRoute()
const setupComponent = shallowRef<VueComponent | null>(null)

onMounted(async () => {
  const plugin = allProviderPlugins.find(p => p.id === route.params.id)
  if (plugin) {
    setupComponent.value = await plugin.setupComponent()
  }
})
</script>
