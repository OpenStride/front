<template>
  <div class="bg-white rounded-lg shadow p-4">
    <h3 class="text-lg font-semibold mb-2">{{ t('graphs.elevationProfile') }}</h3>
    <p class="text-gray-500">{{ t('graphs.comingSoon') }}</p>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
// Tu pourras ajouter des props comme : defineProps<{ activity: any }>()
</script>
