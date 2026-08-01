<template>
  <div class="friends-actions">
    <nav class="quick-actions" :aria-label="t('friends.actions')">
      <button class="chip" data-test="open-my-qr" @click="qrOpen = true">
        <i class="fas fa-qrcode" aria-hidden="true"></i>
        {{ t('friends.quickQr') }}
      </button>
      <button class="chip primary" data-test="open-scanner" @click="scannerOpen = true">
        <i class="fas fa-user-plus" aria-hidden="true"></i>
        {{ t('friends.quickAdd') }}
      </button>
      <router-link to="/profile?tab=friends" class="chip" data-test="manage-friends">
        <i class="fas fa-users-gear" aria-hidden="true"></i>
        {{ t('friends.quickManage') }}
      </router-link>
    </nav>

    <!-- Scanning navigates to /add-friend for confirmation; nothing to reload here -->
    <QRScanner :is-open="scannerOpen" @close="scannerOpen = false" />
    <MyQrCodeModal :is-open="qrOpen" @close="qrOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import QRScanner from '@/components/QRScanner.vue'
import MyQrCodeModal from '@/components/MyQrCodeModal.vue'

/**
 * Everything one can do about friends, in one slim row.
 *
 * These three lived on a `/friends` page whose only other content was a feed of
 * friends' activities — the same cards the list already shows under its Friends
 * scope. The page went; the actions had to stay somewhere reachable, so they
 * follow the scope that needs them.
 *
 * Self-contained on purpose, modals included: the host renders it and owes it
 * nothing.
 */
const { t } = useI18n()

const scannerOpen = ref(false)
const qrOpen = ref(false)
</script>

<style scoped>
/* Slim by design: one line of chips, scrolled sideways rather than stacked when
   a translation makes them too wide for a narrow phone */
.quick-actions {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  scrollbar-width: none;
}

.quick-actions::-webkit-scrollbar {
  display: none;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--text-color);
  font-size: 0.8rem;
  font-weight: 600;
  /* Global button styling uppercases labels; the third chip is a link, so
     without this the row read "MON QR / AJOUTER / Gérer" */
  text-transform: none;
  letter-spacing: 0;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.2s;
}

.chip:hover {
  background: var(--surface-muted);
}

.chip.primary {
  background: var(--color-green-500);
  border-color: var(--color-green-500);
  color: var(--color-white);
}

.chip.primary:hover {
  background: var(--color-green-600);
}
</style>
