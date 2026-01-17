<template>
  <div class="qr-scanner-modal" v-if="isOpen" @click.self="close">
    <div class="scanner-container">
      <div class="scanner-header">
        <h3>Scanner un QR Code</h3>
        <button @click="close" class="close-btn">
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>

      <div class="scanner-body">
        <div v-if="!hasPermission && !permissionDenied" class="permission-request">
          <p>
            <i class="fas fa-camera permission-icon" aria-hidden="true"></i>
            L'accès à la caméra est nécessaire
          </p>
          <button @click="startScanning" class="start-btn">
            Activer la caméra
          </button>
        </div>

        <div v-if="permissionDenied" class="permission-denied">
          <p>
            <i class="fas fa-times-circle permission-icon error" aria-hidden="true"></i>
            Accès caméra refusé
          </p>
          <p class="text-sm">Veuillez autoriser l'accès dans les paramètres de votre navigateur</p>
          <button @click="switchToManual" class="manual-btn">
            Saisir l'URL manuellement
          </button>
        </div>

        <div v-if="scanning" class="scanner-viewport">
          <div id="qr-reader"></div>
          <p class="scanner-hint">Positionnez le QR code dans le cadre</p>
        </div>

        <div v-if="showManualInput" class="manual-input">
          <label>URL publique de votre ami:</label>
          <input
            v-model="manualUrl"
            type="url"
            placeholder="https://drive.google.com/..."
            class="url-input"
          />
          <button @click="addManually" class="add-btn" :disabled="!manualUrl">
            Ajouter
          </button>
        </div>

        <div v-if="scanning" class="scanner-actions">
          <button @click="switchToManual" class="secondary-btn">
            Saisir manuellement
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, watch } from 'vue';
import { Html5Qrcode } from 'html5-qrcode';
import { FriendService } from '@/services/FriendService';
import { ToastService } from '@/services/ToastService';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  close: [];
  friendAdded: [friendId: string];
}>();

const friendService = FriendService.getInstance();

const hasPermission = ref(false);
const permissionDenied = ref(false);
const scanning = ref(false);
const showManualInput = ref(false);
const manualUrl = ref('');

let html5QrCode: Html5Qrcode | null = null;

const startScanning = async () => {
  try {
    html5QrCode = new Html5Qrcode('qr-reader');

    const qrCodeSuccessCallback = async (decodedText: string) => {
      console.log('[QRScanner] Decoded:', decodedText);

      // Stop scanning
      await stopScanning();

      // Add friend
      await addFriendByUrl(decodedText);
    };

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 }
    };

    await html5QrCode.start(
      { facingMode: 'environment' },
      config,
      qrCodeSuccessCallback,
      undefined
    );

    hasPermission.value = true;
    scanning.value = true;
    permissionDenied.value = false;
  } catch (error) {
    console.error('[QRScanner] Error starting scanner:', error);
    permissionDenied.value = true;
    hasPermission.value = false;
    ToastService.push('Impossible d\'accéder à la caméra', { type: 'error', timeout: 4000 });
  }
};

const stopScanning = async () => {
  if (html5QrCode && scanning.value) {
    try {
      await html5QrCode.stop();
      scanning.value = false;
    } catch (error) {
      console.error('[QRScanner] Error stopping scanner:', error);
    }
  }
};

const addFriendByUrl = async (url: string) => {
  const friend = await friendService.addFriendByUrl(url);
  if (friend) {
    emit('friendAdded', friend.id);
    close();
  }
};

const switchToManual = () => {
  stopScanning();
  showManualInput.value = true;
};

const addManually = async () => {
  if (!manualUrl.value) return;
  await addFriendByUrl(manualUrl.value);
};

const close = () => {
  stopScanning();
  showManualInput.value = false;
  manualUrl.value = '';
  emit('close');
};

watch(() => props.isOpen, (newVal) => {
  if (!newVal) {
    stopScanning();
    showManualInput.value = false;
  }
});

onUnmounted(() => {
  stopScanning();
});
</script>

<style scoped>
.qr-scanner-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.scanner-container {
  background: white;
  border-radius: 1rem;
  max-width: 500px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.scanner-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.scanner-header h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #6b7280;
  padding: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: #111827;
}

.scanner-body {
  padding: 1.5rem;
}

.permission-request,
.permission-denied {
  text-align: center;
  padding: 2rem 1rem;
}

.permission-request p,
.permission-denied p {
  margin-bottom: 1rem;
  font-size: 1.125rem;
}

.text-sm {
  font-size: 0.875rem;
  color: #6b7280;
}

.permission-icon {
  font-size: 1.25rem;
  color: var(--color-green-600);
  margin-right: 0.5rem;
}

.permission-icon.error {
  color: #ef4444;
}

.start-btn,
.manual-btn,
.add-btn {
  padding: 0.75rem 1.5rem;
  background: var(--color-green-500);
  color: white;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  font-size: 1rem;
  transition: background 0.2s;
}

.start-btn:hover,
.add-btn:hover {
  background: var(--color-green-600);
}

.manual-btn {
  background: #6b7280;
  margin-top: 0.5rem;
}

.manual-btn:hover {
  background: #4b5563;
}

.scanner-viewport {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

#qr-reader {
  width: 100%;
  max-width: 350px;
  border-radius: 0.5rem;
  overflow: hidden;
}

.scanner-hint {
  text-align: center;
  color: #6b7280;
  font-size: 0.875rem;
}

.manual-input {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.manual-input label {
  font-weight: 500;
  color: #374151;
}

.url-input {
  padding: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-family: monospace;
}

.url-input:focus {
  outline: none;
  border-color: var(--color-green-500);
  ring: 2px;
  ring-color: var(--color-green-500);
}

.add-btn:disabled {
  background: #d1d5db;
  cursor: not-allowed;
}

.scanner-actions {
  margin-top: 1rem;
  display: flex;
  justify-content: center;
}

.secondary-btn {
  padding: 0.5rem 1rem;
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
}

.secondary-btn:hover {
  background: #e5e7eb;
}
</style>
