<!-- src/views/ProviderSetupView.vue -->
<template>
  <div v-if="setupComponent">
    <component :is="setupComponent" />
  </div>
  <p v-else>Provider not found.</p>
</template>

<script setup lang="ts">
import { shallowRef, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { allStoragePlugins } from '@/services/StoragePluginRegistry'

const route = useRoute()
const setupComponent = shallowRef<any>(null)

onMounted(async () => {
  const plugin = allStoragePlugins.find(p => p.id === route.params.id)
  if (plugin) {
    setupComponent.value = await plugin.setupComponent()
  }
})
</script>
