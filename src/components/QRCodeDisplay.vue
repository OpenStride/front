<template>
  <div class="qr-display">
    <div class="qr-container">
      <canvas ref="qrCanvas" class="qr-canvas"></canvas>
    </div>

    <!-- The link used to sit in a readonly input, truncated mid-URL and looking
         like something you were meant to type into -->
    <p class="url-text" data-test="share-url">{{ readableUrl }}</p>

    <div class="qr-actions">
      <button v-if="canShare" @click="shareUrl" class="share-btn" data-test="share-url-btn">
        <i class="fas fa-share-nodes" aria-hidden="true"></i>
        {{ t('myQr.share') }}
      </button>
      <button @click="copyToClipboard" class="copy-btn" data-test="copy-url-btn">
        <i :class="copied ? 'fas fa-check' : 'fas fa-clipboard'" aria-hidden="true"></i>
        {{ copied ? t('myQr.copied') : t('myQr.copy') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'

const { t } = useI18n()

const props = defineProps<{
  url: string
}>()

const qrCanvas = ref<HTMLCanvasElement | null>(null)
const copied = ref(false)

// Web Share hands the link to the phone's own messaging apps, which is how
// people actually send a link to a friend standing next to them
const canShare = computed(() => typeof navigator !== 'undefined' && 'share' in navigator)

/** Host + path only: the manifest query string is noise a human never reads */
const readableUrl = computed(() => {
  try {
    const parsed = new URL(props.url)
    return `${parsed.host}${parsed.pathname}`
  } catch {
    return props.url
  }
})

const generateQR = async () => {
  if (!qrCanvas.value || !props.url) return

  try {
    await QRCode.toCanvas(qrCanvas.value, props.url, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    })
  } catch (error) {
    console.error('[QRCodeDisplay] Error generating QR code:', error)
  }
}

const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(props.url)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (error) {
    console.error('[QRCodeDisplay] Failed to copy to clipboard:', error)
  }
}

const shareUrl = async () => {
  try {
    await navigator.share({
      title: t('myQr.shareTitle'),
      text: t('myQr.shareText'),
      url: props.url
    })
  } catch (error) {
    // AbortError just means the user closed the share sheet
    if ((error as Error)?.name !== 'AbortError') {
      console.error('[QRCodeDisplay] Share failed:', error)
      await copyToClipboard()
    }
  }
}

onMounted(() => {
  generateQR()
})

watch(
  () => props.url,
  () => {
    generateQR()
  }
)
</script>

<style scoped>
.qr-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.qr-container {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1rem;
  background: var(--color-white);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.qr-canvas {
  display: block;
  max-width: 100%;
  height: auto;
}

.url-text {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--text-muted);
  word-break: break-all;
  text-align: center;
}

.qr-actions {
  display: flex;
  gap: 0.5rem;
  width: 100%;
  max-width: 400px;
}

.share-btn,
.copy-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.7rem 1rem;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  transition: background 0.2s;
}

.share-btn {
  background: var(--color-green-500);
  color: var(--color-white);
}

.share-btn:hover {
  background: var(--color-green-600);
}

.copy-btn {
  background: var(--surface-2);
  color: var(--text-color);
}

.copy-btn:hover {
  background: var(--surface-muted);
}
</style>
