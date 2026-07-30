<template>
  <header class="header">
    <div
      class="logo"
      @click="$router.push('/')"
      @keydown.enter="$router.push('/')"
      @keydown.space.prevent="$router.push('/')"
      role="button"
      tabindex="0"
    >
      <img src="@/assets/logo.svg" :alt="t('app.logo')" />
      <h1 class="brand-name">
        <span class="normal">open</span><span class="secondary">Stride</span>
      </h1>
    </div>

    <div class="header-actions">
      <!-- On touch, pull-to-refresh replaces the icon button that used to sit
           here; the entry inside the menu stays as the reachable fallback. -->
      <div
        class="burger-menu"
        @click="toggleMenu"
        role="button"
        tabindex="0"
        @keydown.enter="toggleMenu"
        @keydown.space.prevent="toggleMenu"
      >
        <i class="fas fa-bars" aria-hidden="true"></i>
      </div>
    </div>
    <nav :class="['nav-menu', { active: isMenuOpen }]" data-no-pull-refresh>
      <button class="close-menu" @click="closeMenu" :aria-label="t('app.close')">
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
      <router-link to="/my-activities" @click="closeMenu">{{
        t('navigation.myActivities')
      }}</router-link>
      <component
        v-for="(comp, i) in navSlotComponents"
        :is="comp"
        :key="`nav-${i}`"
        @navigate="closeMenu"
      />
      <router-link to="/friends" @click="closeMenu">{{ t('navigation.friends') }}</router-link>
      <router-link to="/profile" @click="closeMenu">{{ t('navigation.profile') }}</router-link>
      <button class="refresh-btn" @click="onRefresh" :disabled="refreshing">
        <span :class="['icon', { spinning: refreshing }]" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
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

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { getSyncService } from '@/services/SyncService'
import { StorageService } from '@/services/StorageService'
import { ToastService } from '@/services/ToastService'
import { useSlotExtensions } from '@/composables/useSlotExtensions'
import { useAppRefresh } from '@/composables/useAppRefresh'

const { t } = useI18n()

const { components: navRaw } = useSlotExtensions('navigation.main')
// The registry already unwraps a module into its component.
const navSlotComponents = computed(() => navRaw.value)

const isMenuOpen = ref(false)
const syncService = getSyncService()
const storageService = StorageService.getInstance()

// Shared with the pull-to-refresh gesture: one request, one spinner.
const { refreshing, requestRefresh } = useAppRefresh()

const toggleMenu = () => {
  isMenuOpen.value = !isMenuOpen.value
}

const closeMenu = () => {
  isMenuOpen.value = false
}

/**
 * Event listeners for sync and backup notifications
 */
const handleSyncStarted = () => {
  ToastService.push(t('sync.started'), { type: 'info', timeout: 1000 })
}

const handleSyncInProgress = () => {
  ToastService.push(t('sync.inProgress'), { type: 'info', timeout: 2000 })
}

const handleSyncNoPlugins = () => {
  ToastService.push(t('sync.noStorage'), { type: 'warning', timeout: 3000 })
}

const handleSyncCompleted = (evt: Event) => {
  const detail = (evt as CustomEvent).detail
  if (detail.errors && detail.errors.length > 0) {
    ToastService.push(t('sync.partial', { count: detail.errors.length }, detail.errors.length), {
      type: 'warning',
      timeout: 4000
    })
  } else {
    ToastService.push(
      detail.activitiesSynced > 0
        ? t('sync.synced', { count: detail.activitiesSynced }, detail.activitiesSynced)
        : t('sync.upToDate'),
      { type: 'success', timeout: 3000 }
    )
  }
}

const handleSyncFailed = () => {
  ToastService.push(t('sync.failed'), { type: 'error', timeout: 4000 })
}

const handleSyncConflict = (evt: Event) => {
  const detail = (evt as CustomEvent).detail
  ToastService.push(t('sync.conflict', { title: detail.conflictActivity }), {
    type: 'warning',
    timeout: 5000
  })
}

const handleBackupCompleted = () => {
  ToastService.push(t('backup.completed'), { type: 'success', timeout: 3000 })
}

const handleBackupFailed = () => {
  ToastService.push(t('backup.failed'), { type: 'error', timeout: 5000 })
}

/**
 * Setup event listeners on mount
 */
onMounted(() => {
  // SyncService events (toast notifications)
  syncService.emitter.addEventListener('sync-started', handleSyncStarted)
  syncService.emitter.addEventListener('sync-in-progress', handleSyncInProgress)
  syncService.emitter.addEventListener('sync-no-plugins', handleSyncNoPlugins)
  syncService.emitter.addEventListener('sync-completed', handleSyncCompleted)
  syncService.emitter.addEventListener('sync-failed', handleSyncFailed)
  syncService.emitter.addEventListener('sync-conflict', handleSyncConflict)

  // StorageService events (toast notifications)
  storageService.emitter.addEventListener('backup-completed', handleBackupCompleted)
  storageService.emitter.addEventListener('backup-failed', handleBackupFailed)
})

/**
 * Cleanup event listeners on unmount
 */
onUnmounted(() => {
  // SyncService events
  syncService.emitter.removeEventListener('sync-started', handleSyncStarted)
  syncService.emitter.removeEventListener('sync-in-progress', handleSyncInProgress)
  syncService.emitter.removeEventListener('sync-no-plugins', handleSyncNoPlugins)
  syncService.emitter.removeEventListener('sync-completed', handleSyncCompleted)
  syncService.emitter.removeEventListener('sync-failed', handleSyncFailed)
  syncService.emitter.removeEventListener('sync-conflict', handleSyncConflict)

  // StorageService events
  storageService.emitter.removeEventListener('backup-completed', handleBackupCompleted)
  storageService.emitter.removeEventListener('backup-failed', handleBackupFailed)
})

const onRefresh = () => {
  requestRefresh()
}
</script>

<style src="@/assets/styles/appheader.css"></style>
