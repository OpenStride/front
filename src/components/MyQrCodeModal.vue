<template>
  <div v-if="isOpen" class="qr-modal" @click.self="close">
    <div class="qr-panel" role="dialog" aria-modal="true" :aria-label="t('myQr.title')">
      <div class="qr-header">
        <h3>{{ t('myQr.title') }}</h3>
        <button @click="close" class="close-btn" :aria-label="t('app.close')">
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>

      <div v-if="loading" class="qr-body">
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      </div>

      <!-- Published: the code is the whole point of the screen, so it comes first -->
      <div v-else-if="publicUrl" class="qr-body" data-test="my-qr-published">
        <p class="qr-help">{{ t('myQr.help') }}</p>
        <QRCodeDisplay :url="publicUrl" />
      </div>

      <!-- Not published: nothing to scan yet, so say what to do about it -->
      <div v-else class="qr-body" data-test="my-qr-unpublished">
        <i class="fas fa-qrcode empty-icon" aria-hidden="true"></i>
        <p class="qr-help">{{ t('myQr.notPublished') }}</p>
        <router-link to="/profile?tab=friends" class="publish-btn" @click="close">
          <i class="fas fa-upload" aria-hidden="true"></i>
          {{ t('myQr.publishAction') }}
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import QRCodeDisplay from '@/components/QRCodeDisplay.vue'
import { FriendService } from '@/services/FriendService'

const { t } = useI18n()

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const publicUrl = ref<string | null>(null)
const loading = ref(true)

const load = async () => {
  loading.value = true
  try {
    publicUrl.value = await FriendService.getInstance().getMyPublicUrl()
  } catch (error) {
    console.error('[MyQrCodeModal] Could not load public URL:', error)
    publicUrl.value = null
  } finally {
    loading.value = false
  }
}

// Re-read on each opening: the user may have published in between
watch(
  () => props.isOpen,
  open => {
    if (open) load()
  },
  { immediate: true }
)

const close = () => emit('close')
</script>

<style scoped>
.qr-modal {
  position: fixed;
  inset: 0;
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(30, 30, 46, 0.55);
}

.qr-panel {
  width: 100%;
  max-width: 420px;
  background: var(--surface);
  border-radius: 0;
  box-shadow: var(--shadow-float);
  overflow: hidden;
}

.qr-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-subtle);
}

.qr-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-color);
}

.close-btn {
  background: none;
  border: none;
  padding: 0.25rem;
  font-size: 1.2rem;
  color: var(--text-muted);
  cursor: pointer;
}

.close-btn:hover {
  color: var(--text-color);
}

.qr-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 1.5rem 1.25rem;
  text-align: center;
}

.qr-help {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.empty-icon {
  font-size: 2.5rem;
  color: var(--text-faint);
}

.publish-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.7rem 1.25rem;
  border-radius: var(--radius-md);
  background: var(--color-green-500);
  color: var(--color-white);
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
}

.publish-btn:hover {
  background: var(--color-green-600);
}
</style>
