<template>
  <div></div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { getPWAUpdateService } from '@/services/PWAUpdateService'
import { ToastService } from '@/services/ToastService'
const { t } = useI18n()
const updateService = getPWAUpdateService()

const handleUpdateInstalling = () => {
  // Afficher une notification avant le reload
  ToastService.push(t('update.autoUpdating'), {
    type: 'info',
    duration: 3000
  })

  console.log('[AutoUpdateNotification] Update installing, reload imminent...')
}

onMounted(() => {
  updateService.emitter.addEventListener('update-installing', handleUpdateInstalling)
})

onUnmounted(() => {
  updateService.emitter.removeEventListener('update-installing', handleUpdateInstalling)
})
</script>
