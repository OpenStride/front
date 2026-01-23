<template>
  <transition name="slide-down">
    <div v-if="showBanner" class="update-banner">
      <div class="banner-content">
        <i class="fas fa-arrow-circle-up" aria-hidden="true"></i>
        <div class="text">
          <strong>{{ t('update.newVersionAvailable') }}</strong>
          <span class="version">v{{ newVersion }}</span>
        </div>
        <div class="actions">
          <button class="btn-secondary" @click="defer">
            {{ t('update.later') }}
          </button>
          <button class="btn-primary" @click="accept">
            {{ t('update.updateNow') }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { getPWAUpdateService } from '@/services/PWAUpdateService'
import type { PWAUpdateEvent } from '@/services/PWAUpdateService'

const { t } = useI18n()
const updateService = getPWAUpdateService()

const showBanner = ref(false)
const newVersion = ref('')

const handleUpdateAvailable = (evt: Event) => {
  const customEvent = evt as CustomEvent<PWAUpdateEvent>
  newVersion.value = customEvent.detail.newVersion || ''
  showBanner.value = true
}

const accept = async () => {
  showBanner.value = false
  await updateService.acceptUpdate()
}

const defer = () => {
  showBanner.value = false
  updateService.deferUpdate()
}

onMounted(() => {
  updateService.emitter.addEventListener('update-available', handleUpdateAvailable)
})

onUnmounted(() => {
  updateService.emitter.removeEventListener('update-available', handleUpdateAvailable)
})
</script>

<style scoped>
.update-banner {
  position: fixed;
  top: 60px; /* Below AppHeader */
  left: 0;
  right: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 16px 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 2000;
}

.banner-content {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 16px;
}

.banner-content i {
  font-size: 24px;
}

.text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.version {
  font-size: 0.9em;
  opacity: 0.9;
}

.actions {
  display: flex;
  gap: 12px;
}

.btn-primary,
.btn-secondary {
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
  font-family: inherit;
}

.btn-primary {
  background: white;
  color: #667eea;
  font-weight: 600;
}

.btn-primary:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(255, 255, 255, 0.3);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.3);
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from {
  transform: translateY(-100%);
  opacity: 0;
}

.slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
