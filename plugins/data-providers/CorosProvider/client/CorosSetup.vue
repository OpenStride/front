// plugins/providers/GarminProvider/client/GarminSetupView.vue
<template>
  <DefaultProviderSetupView :provider-name="'Coros'" :is-connected="isConnected" />
</template>

<script setup lang="ts">
import DefaultProviderSetupView from '@/components/providers/DefaultProviderSetup.vue'
import { ref } from 'vue'

const isConnected = ref(false)
</script>
