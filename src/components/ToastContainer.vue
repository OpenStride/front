<template>
  <div class="toast-container">
    <div v-for="t in toasts" :key="t.id" :class="['toast', t.type]" @click="dismiss(t.id)">
      <span class="msg">{{ t.message }}</span>
      <button class="close" :aria-label="translate('app.close')" @click.stop="dismiss(t.id)">
        ×
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ToastService } from '@/services/ToastService'
import { computed } from 'vue'

const { t: translate } = useI18n()
const toasts = computed(() => ToastService.toasts)
const dismiss = (id: number) => ToastService.remove(id)
</script>

<style scoped>
.toast-container {
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column-reverse;
  gap: 10px;
  z-index: 3000;
  pointer-events: none;
  width: min(90vw, 420px);
}
.toast {
  width: 100%;
  /* --color-ink #1e1e2e = rgb(30, 30, 46), kept translucent for the glass effect */
  background: rgba(30, 30, 46, 0.9);
  color: var(--color-white);
  padding: 12px 16px;
  border-radius: var(--radius-md);
  font-size: 14px;
  line-height: 1.3;
  box-shadow: 0 10px 30px -8px rgba(30, 30, 46, 0.45);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  backdrop-filter: blur(6px) saturate(140%);
  -webkit-backdrop-filter: blur(6px) saturate(140%);
  pointer-events: auto;
  cursor: pointer;
  opacity: 0;
  transform: translateY(12px) scale(0.98);
  animation: fadeIn 0.25s forwards;
  border: 1px solid rgba(255, 255, 255, 0.07);
}
.toast.success {
  /* --color-green-600 #4d7314 = rgb(77, 115, 20) — OpenStride olive */
  background: rgba(77, 115, 20, 0.94);
}
.toast.error {
  background: rgba(180, 35, 24, 0.9);
}
.toast.info {
  background: rgba(3, 105, 161, 0.9);
}
.toast.warning {
  background: rgba(180, 83, 9, 0.9);
}
.toast .close {
  background: transparent;
  border: none;
  color: var(--color-white);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0;
}
.toast:active {
  transform: translateY(2px) scale(0.97);
}
@keyframes fadeIn {
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
