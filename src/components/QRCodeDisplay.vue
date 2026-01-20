<template>
  <div class="qr-display">
    <div class="qr-container">
      <canvas ref="qrCanvas" class="qr-canvas"></canvas>
    </div>
    <div class="url-display">
      <input
        :value="url"
        readonly
        class="url-input"
        @click="copyToClipboard"
      />
      <button @click="copyToClipboard" class="copy-btn">
        <i v-if="copied" class="fas fa-check" aria-hidden="true"></i>
        <i v-else class="fas fa-clipboard" aria-hidden="true"></i>
        {{ copied ? ' Copié' : ' Copier' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import QRCode from 'qrcode';

const props = defineProps<{
  url: string;
}>();

const qrCanvas = ref<HTMLCanvasElement | null>(null);
const copied = ref(false);

const generateQR = async () => {
  if (!qrCanvas.value || !props.url) return;

  try {
    await QRCode.toCanvas(qrCanvas.value, props.url, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
  } catch (error) {
    console.error('[QRCodeDisplay] Error generating QR code:', error);
  }
};

const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(props.url);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (error) {
    console.error('[QRCodeDisplay] Failed to copy to clipboard:', error);
  }
};

onMounted(() => {
  generateQR();
});

watch(() => props.url, () => {
  generateQR();
});
</script>

<style scoped>
.qr-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: white;
  border-radius: 0.75rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.qr-container {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1rem;
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
}

.qr-canvas {
  display: block;
  max-width: 100%;
  height: auto;
}

.url-display {
  display: flex;
  gap: 0.5rem;
  width: 100%;
  max-width: 400px;
}

.url-input {
  flex: 1;
  padding: 0.5rem;
  font-size: 0.75rem;
  font-family: monospace;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  background: #f9fafb;
  cursor: pointer;
}

.url-input:focus {
  outline: none;
  border-color: var(--color-green-500);
  ring: 2px;
  ring-color: var(--color-green-500);
}

.copy-btn {
  padding: 0.5rem 1rem;
  background: var(--color-green-500);
  color: white;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background 0.2s;
}

.copy-btn:hover {
  background: var(--color-green-600);
}
</style>
