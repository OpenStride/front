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
  // `duration` is not an option — the toast takes `timeout`, so this value was
  // silently dropped and the notice used the default lifetime.
  ToastService.push(t('update.autoUpdating'), {
    type: 'info',
    timeout: 3000
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
