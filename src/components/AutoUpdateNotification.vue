<template>
  <!-- Pas de template visible, juste un listener -->
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { getPWAUpdateService } from '@/services/PWAUpdateService'
import { ToastService } from '@/services/ToastService'
import type { PWAUpdateEvent } from '@/services/PWAUpdateService'

const { t } = useI18n()
const updateService = getPWAUpdateService()

const handleUpdateInstalling = (evt: Event) => {
  const customEvent = evt as CustomEvent<PWAUpdateEvent>

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
