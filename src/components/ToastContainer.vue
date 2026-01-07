<template>
  <div class="toast-container">
    <div v-for="t in toasts" :key="t.id" :class="['toast', t.type]" @click="dismiss(t.id)">
      <span class="msg">{{ t.message }}</span>
      <button class="close" aria-label="Fermer" @click.stop="dismiss(t.id)">×</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ToastService } from '@/services/ToastService';
import { computed } from 'vue';
const toasts = computed(() => ToastService.toasts);
const dismiss = (id: number) => ToastService.remove(id);
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
  background: rgba(34,34,34,0.88);
  color: #fff;
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 14px;
  line-height: 1.3;
  box-shadow: 0 6px 18px -4px rgba(0,0,0,0.35);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  backdrop-filter: blur(6px) saturate(140%);
  -webkit-backdrop-filter: blur(6px) saturate(140%);
  pointer-events: auto;
  cursor: pointer;
  opacity: 0;
  transform: translateY(12px) scale(.98);
  animation: fadeIn .25s forwards;
  border: 1px solid rgba(255,255,255,0.07);
}
.toast.success { background: rgba(24,121,78,0.88); }
.toast.error { background: rgba(180,35,24,0.9); }
.toast.info { background: rgba(3,105,161,0.9); }
.toast.warning { background: rgba(180,83,9,0.9); }
.toast .close { background: transparent; border: none; color: #fff; cursor: pointer; font-size: 16px; line-height: 1; padding: 0; }
.toast:active { transform: translateY(2px) scale(.97); }
@keyframes fadeIn { to { opacity: 1; transform: translateY(0) scale(1);} }
</style>