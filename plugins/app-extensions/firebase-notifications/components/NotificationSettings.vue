<template>
  <div class="notification-settings">
    <div class="setting-header">
      <i class="fas fa-bell" aria-hidden="true"></i>
      <h3>Notifications Push</h3>
    </div>

    <!-- Not supported warning -->
    <div v-if="!browserSupportsNotifications" class="warning-message">
      <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
      <span>Votre navigateur ne supporte pas les notifications push</span>
    </div>

    <!-- Firebase not configured warning -->
    <div v-else-if="!isFirebaseConfigured" class="warning-message">
      <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
      <span>Firebase n'est pas configuré. Consultez le README du plugin.</span>
    </div>

    <!-- Main controls -->
    <div v-else class="setting-controls">
      <div class="setting-row">
        <div class="setting-info">
          <label>Activer les notifications</label>
          <p class="setting-description">
            Recevoir une notification quand de nouvelles activités sont importées
          </p>
        </div>
        <label class="toggle-switch">
          <input
            type="checkbox"
            :checked="state.enabled"
            :disabled="loading"
            @change="toggleNotifications"
          />
          <span class="slider"></span>
        </label>
      </div>

      <!-- Permission status -->
      <div v-if="state.enabled" class="status-info">
        <div class="status-row">
          <span class="status-label">Statut:</span>
          <span :class="['status-badge', permissionClass]">
            {{ permissionText }}
          </span>
        </div>
        <div v-if="state.token" class="status-row token-info">
          <span class="status-label">Token FCM:</span>
          <code class="token-display">{{ truncatedToken }}</code>
        </div>
      </div>

      <!-- Error message -->
      <div v-if="errorMessage" class="error-message">
        <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
        <span>{{ errorMessage }}</span>
      </div>

      <!-- Success message -->
      <div v-if="successMessage" class="success-message">
        <i class="fas fa-check-circle" aria-hidden="true"></i>
        <span>{{ successMessage }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { NotificationService, type NotificationState } from '../services/NotificationService';
import { isFirebaseConfigured } from '../lib/firebase';

const notificationService = NotificationService.getInstance();
const browserSupportsNotifications = 'Notification' in window;
const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const state = ref<NotificationState>({
  enabled: false,
  token: null,
  tokenTimestamp: null,
  permissionStatus: 'default'
});

const permissionClass = computed(() => {
  switch (state.value.permissionStatus) {
    case 'granted': return 'status-granted';
    case 'denied': return 'status-denied';
    default: return 'status-default';
  }
});

const permissionText = computed(() => {
  switch (state.value.permissionStatus) {
    case 'granted': return 'Autorisées';
    case 'denied': return 'Refusées';
    default: return 'Non demandées';
  }
});

const truncatedToken = computed(() => {
  if (!state.value.token) return '';
  const token = state.value.token;
  return token.length > 20 ? `${token.substring(0, 20)}...` : token;
});

onMounted(async () => {
  if (notificationService) {
    await notificationService.initialize();
    await loadState();

    // Refresh token if needed (older than 30 days)
    await notificationService.refreshTokenIfNeeded();
  }
});

async function loadState() {
  if (!notificationService) return;
  state.value = await notificationService.getState();
}

async function toggleNotifications(event: Event) {
  if (!notificationService) return;

  const checkbox = event.target as HTMLInputElement;
  const shouldEnable = checkbox.checked;

  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    if (shouldEnable) {
      const result = await notificationService.enable();
      if (result.success) {
        successMessage.value = 'Notifications activées avec succès !';
        setTimeout(() => { successMessage.value = ''; }, 3000);
      } else {
        errorMessage.value = result.error || 'Erreur lors de l\'activation';
        checkbox.checked = false;
      }
    } else {
      await notificationService.disable();
      successMessage.value = 'Notifications désactivées';
      setTimeout(() => { successMessage.value = ''; }, 3000);
    }

    await loadState();
  } catch (error) {
    console.error('Toggle notifications error:', error);
    errorMessage.value = 'Une erreur est survenue';
    checkbox.checked = !shouldEnable;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.notification-settings {
  background-color: #ffffff;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.setting-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.setting-header i {
  color: var(--color-green-500, #88aa00);
  font-size: 1.25rem;
}

.setting-header h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #1f2937;
}

.warning-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background-color: #fef3c7;
  border-left: 4px solid #f59e0b;
  border-radius: 4px;
  color: #92400e;
  font-size: 0.875rem;
}

.warning-message i {
  color: #f59e0b;
}

.setting-controls {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.setting-info {
  flex: 1;
}

.setting-info label {
  display: block;
  font-weight: 500;
  color: #1f2937;
  margin-bottom: 0.25rem;
}

.setting-description {
  margin: 0;
  font-size: 0.875rem;
  color: #6b7280;
}

/* Toggle Switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 24px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #cbd5e1;
  transition: 0.3s;
  border-radius: 24px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: var(--color-green-500, #88aa00);
}

input:checked + .slider:before {
  transform: translateX(24px);
}

input:disabled + .slider {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Status Info */
.status-info {
  padding: 1rem;
  background-color: #f9fafb;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.status-label {
  font-weight: 500;
  color: #4b5563;
}

.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
}

.status-granted {
  background-color: #d1fae5;
  color: #065f46;
}

.status-denied {
  background-color: #fee2e2;
  color: #991b1b;
}

.status-default {
  background-color: #e5e7eb;
  color: #374151;
}

.token-info {
  flex-direction: column;
  align-items: flex-start;
}

.token-display {
  background-color: #ffffff;
  padding: 0.5rem;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.75rem;
  color: #374151;
  border: 1px solid #e5e7eb;
  word-break: break-all;
}

/* Messages */
.error-message,
.success-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 4px;
  font-size: 0.875rem;
}

.error-message {
  background-color: #fee2e2;
  border-left: 4px solid #dc2626;
  color: #991b1b;
}

.error-message i {
  color: #dc2626;
}

.success-message {
  background-color: #d1fae5;
  border-left: 4px solid var(--color-green-600, #6d8a00);
  color: #065f46;
}

.success-message i {
  color: var(--color-green-600, #6d8a00);
}
</style>
