<template>
  <div class="update-toast-container">
    <transition name="fade-in">
      <div v-if="showToast" class="update-toast">
        <div class="toast-content">
          <i class="fas fa-arrow-circle-up" aria-hidden="true"></i>
          <div class="text">
            <strong>{{ t('update.newVersionAvailable') }}</strong>
          </div>
        </div>
        <div class="toast-actions">
          <button class="btn-later" @click="defer">
            {{ t('update.later') }}
          </button>
          <button class="btn-update" @click="accept">
            {{ t('update.updateNow') }}
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { getPWAUpdateService } from '@/services/PWAUpdateService'
import type { PWAUpdateEvent } from '@/services/PWAUpdateService'

const { t } = useI18n()
const updateService = getPWAUpdateService()

const showToast = ref(false)

const handleUpdateAvailable = (evt: Event) => {
  showToast.value = true
}

const accept = async () => {
  showToast.value = false
  await updateService.acceptUpdate()
}

const defer = () => {
  showToast.value = false
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
.update-toast-container {
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  z-index: 3000;
  pointer-events: none;
  width: min(90vw, 420px);
}

.update-toast {
  width: 100%;
  background: color-mix(in srgb, var(--color-green-500) 95%, transparent);
  color: #fff;
  padding: 16px;
  border-radius: 10px;
  box-shadow: 0 6px 18px -4px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(6px) saturate(140%);
  -webkit-backdrop-filter: blur(6px) saturate(140%);
  pointer-events: auto;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.toast-content {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.toast-content i {
  font-size: 24px;
  flex-shrink: 0;
}

.text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.text strong {
  font-size: 15px;
  font-weight: 600;
}

.toast-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn-update,
.btn-later {
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
  font-family: inherit;
}

.btn-update {
  background: white;
  color: var(--color-green-700);
  font-weight: 600;
}

.btn-update:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(255, 255, 255, 0.3);
  background: var(--color-green-50);
}

.btn-update:active {
  transform: translateY(0);
}

.btn-later {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.btn-later:hover {
  background: rgba(255, 255, 255, 0.3);
}

.btn-later:active {
  background: rgba(255, 255, 255, 0.15);
}

.fade-in-enter-active,
.fade-in-leave-active {
  transition: all 0.3s ease;
}

.fade-in-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.95);
}

.fade-in-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.95);
}
</style>
