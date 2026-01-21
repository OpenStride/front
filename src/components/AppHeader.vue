<template>
  <header class="header">
    <div class="logo" @click="$router.push('/')" role="button" tabindex="0">
      <img src="@/assets/logo.svg" alt="Logo" />
      <h1 class="brand-name"><span class="normal">open</span><span class="secondary">Stride</span></h1>
    </div>

    <div class="header-actions">
      <!-- Mobile refresh button next to burger -->
      <button class="refresh-icon-btn" @click="onRefresh" :disabled="refreshing" aria-label="Refresh" title="Refresh">
        <span :class="['icon', { spinning: refreshing }]" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <!-- Double refresh arrows -->
            <path d="M4.5 8.5a7.5 7.5 0 0 1 12.4-3.9l1.1 1.1" />
            <path d="M18 3.5v4.2h-4.2" />
            <path d="M19.5 15.5a7.5 7.5 0 0 1-12.4 3.9L6 18.3" />
            <path d="M6 20.5v-4.2h4.2" />
          </svg>
        </span>
      </button>
      <div class="burger-menu" @click="toggleMenu">
        <i class="fas fa-bars" aria-hidden="true"></i>
      </div>
    </div>
    <nav :class="['nav-menu', { active: isMenuOpen }]">
      <span class="close-menu" @click="closeMenu">
        <i class="fas fa-times" aria-hidden="true"></i>
      </span>
      <router-link to="/" @click="closeMenu">{{ t('navigation.home') }}</router-link>
      <router-link to="/profile" @click="closeMenu">{{ t('navigation.profile') }}</router-link>
      <router-link to="/friends" @click="closeMenu">{{ t('navigation.friends') }}</router-link>
      <router-link to="/data-providers" @click="closeMenu">{{ t('navigation.dataProviders') }}</router-link>
      <router-link to="/storage-providers" @click="closeMenu">{{ t('navigation.storageProviders') }}</router-link>
      <router-link to="/app-extensions" @click="closeMenu">{{ t('navigation.appExtensions') }}</router-link>
      <router-link to="/my-activities" @click="closeMenu">{{ t('navigation.myActivities') }}</router-link>
      <button class="refresh-btn" @click="onRefresh" :disabled="refreshing">
        <span :class="['icon', { spinning: refreshing }]" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4.5 8.5a7.5 7.5 0 0 1 12.4-3.9l1.1 1.1" />
            <path d="M18 3.5v4.2h-4.2" />
            <path d="M19.5 15.5a7.5 7.5 0 0 1-12.4 3.9L6 18.3" />
            <path d="M6 20.5v-4.2h4.2" />
          </svg>
        </span>
        <span class="label">{{ t('common.refresh') }}</span>
      </button>
    </nav>
  </header>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { useI18n } from 'vue-i18n';
import { DataProviderService } from '@/services/DataProviderService';
import { getSyncService } from '@/services/SyncService';
import { StorageService } from '@/services/StorageService';
import { FriendService } from '@/services/FriendService';
import { ToastService } from '@/services/ToastService';

const { t } = useI18n();

const isMenuOpen = ref(false);
const refreshing = ref(false);
const dataProviderService = DataProviderService.getInstance();
const syncService = getSyncService();
const storageService = StorageService.getInstance();
const friendService = FriendService.getInstance();

const toggleMenu = () => {
  isMenuOpen.value = !isMenuOpen.value;
};

const closeMenu = () => {
  isMenuOpen.value = false;
};

/**
 * Event listeners for sync and backup notifications
 */
const handleSyncStarted = () => {
  ToastService.push('Synchronisation...', { type: 'info', timeout: 1000 });
};

const handleSyncInProgress = () => {
  ToastService.push('Synchronisation déjà en cours', { type: 'info', timeout: 2000 });
};

const handleSyncNoPlugins = () => {
  ToastService.push('Aucun stockage distant configuré', { type: 'warning', timeout: 3000 });
};

const handleSyncCompleted = (evt) => {
  const detail = evt.detail;
  if (detail.errors && detail.errors.length > 0) {
    ToastService.push(
      `⚠️ Synchronisation partielle (${detail.errors.length} erreur(s))`,
      { type: 'warning', timeout: 4000 }
    );
  } else {
    ToastService.push(
      detail.activitiesSynced > 0
        ? `✅ ${detail.activitiesSynced} activité(s) synchronisée(s)`
        : '✅ Tout est à jour',
      { type: 'success', timeout: 3000 }
    );
  }
};

const handleSyncFailed = () => {
  ToastService.push('❌ Échec de la synchronisation', { type: 'error', timeout: 4000 });
};

const handleSyncConflict = (evt) => {
  const detail = evt.detail;
  ToastService.push(
    `⚠️ "${detail.conflictActivity}" modifiée sur 2 appareils. Version la plus récente appliquée.`,
    { type: 'warning', timeout: 5000 }
  );
};

const handleBackupCompleted = () => {
  ToastService.push('Sauvegarde terminée', { type: 'success', timeout: 3000 });
};

const handleBackupFailed = () => {
  ToastService.push('Echec de la sauvegarde', { type: 'error', timeout: 5000 });
};

/**
 * Setup event listeners on mount
 */
onMounted(() => {
  // SyncService events
  syncService.emitter.addEventListener('sync-started', handleSyncStarted);
  syncService.emitter.addEventListener('sync-in-progress', handleSyncInProgress);
  syncService.emitter.addEventListener('sync-no-plugins', handleSyncNoPlugins);
  syncService.emitter.addEventListener('sync-completed', handleSyncCompleted);
  syncService.emitter.addEventListener('sync-failed', handleSyncFailed);
  syncService.emitter.addEventListener('sync-conflict', handleSyncConflict);

  // StorageService events
  storageService.emitter.addEventListener('backup-completed', handleBackupCompleted);
  storageService.emitter.addEventListener('backup-failed', handleBackupFailed);
});

/**
 * Cleanup event listeners on unmount
 */
onUnmounted(() => {
  // SyncService events
  syncService.emitter.removeEventListener('sync-started', handleSyncStarted);
  syncService.emitter.removeEventListener('sync-in-progress', handleSyncInProgress);
  syncService.emitter.removeEventListener('sync-no-plugins', handleSyncNoPlugins);
  syncService.emitter.removeEventListener('sync-completed', handleSyncCompleted);
  syncService.emitter.removeEventListener('sync-failed', handleSyncFailed);
  syncService.emitter.removeEventListener('sync-conflict', handleSyncConflict);

  // StorageService events
  storageService.emitter.removeEventListener('backup-completed', handleBackupCompleted);
  storageService.emitter.removeEventListener('backup-failed', handleBackupFailed);
});

/**
 * Manual refresh flow:
 * 1. Refresh data providers (fetch new activities from Garmin, Coros, etc.)
 * 2. Sync to remote storage (incremental sync with conflict detection)
 * 3. Sync friends' activities
 * 4. Notify views to reload
 */
const onRefresh = async () => {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    // 1. Refresh data providers (fetch new activities)
    await dataProviderService.triggerRefresh();

    // 2. Sync to remote storage (NEW: uses version-based incremental sync)
    await syncService.syncNow();

    // 3. Sync friends' activities
    await friendService.refreshAllFriends();

    // 4. Emit event for views to reload
    window.dispatchEvent(new CustomEvent('openstride:activities-refreshed'));
  } catch (e) {
    console.error('Refresh error', e);
  } finally {
    refreshing.value = false;
  }
};
</script>

<style src="@/assets/styles/appheader.css"></style>