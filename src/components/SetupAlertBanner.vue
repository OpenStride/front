<template>
  <transition name="setup-banner">
    <div v-if="bannerType" class="setup-banner">
      <div class="setup-banner-content">
        <i
          :class="bannerType === 'provider' ? 'fas fa-database' : 'fas fa-cloud'"
          aria-hidden="true"
        ></i>
        <span class="setup-banner-message">
          {{
            bannerType === 'provider'
              ? t('setupBanner.noDataSource')
              : t('setupBanner.noCloudBackup')
          }}
        </span>
      </div>
      <div class="setup-banner-actions">
        <router-link
          :to="
            bannerType === 'provider' ? '/profile?tab=data-sources' : '/profile?tab=cloud-backup'
          "
          class="setup-banner-cta"
        >
          {{
            bannerType === 'provider'
              ? t('setupBanner.configureDataSource')
              : t('setupBanner.configureCloudBackup')
          }}
        </router-link>
        <button
          class="setup-banner-dismiss"
          @click="dismiss"
          :aria-label="t('setupBanner.dismiss')"
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { DataProviderPluginManager } from '@/services/DataProviderPluginManager'
import { StoragePluginManager } from '@/services/StoragePluginManager'
import { IndexedDBService } from '@/services/IndexedDBService'

const { t } = useI18n()

const bannerType = ref<'provider' | 'storage' | null>(null)

const DISMISS_KEY_PROVIDER = 'setup_banner_dismissed_provider'
const DISMISS_KEY_STORAGE = 'setup_banner_dismissed_storage'

async function checkStatus() {
  const db = await IndexedDBService.getInstance()

  const dataProviders = await DataProviderPluginManager.getInstance().getEnabledPlugins()
  const hasDataSource = dataProviders.length > 0

  if (!hasDataSource) {
    const dismissed = await db.getData(DISMISS_KEY_PROVIDER)
    bannerType.value = dismissed ? null : 'provider'
    return
  }

  const storagePlugins = await StoragePluginManager.getInstance().getEnabledPlugins()
  const hasCloudBackup = storagePlugins.length > 0

  if (!hasCloudBackup) {
    const dismissed = await db.getData(DISMISS_KEY_STORAGE)
    bannerType.value = dismissed ? null : 'storage'
    return
  }

  bannerType.value = null
}

async function dismiss() {
  if (!bannerType.value) return
  const db = await IndexedDBService.getInstance()
  const key = bannerType.value === 'provider' ? DISMISS_KEY_PROVIDER : DISMISS_KEY_STORAGE
  await db.saveData(key, true)
  bannerType.value = null
}

function handleRefresh() {
  checkStatus()
}

onMounted(() => {
  checkStatus()
  window.addEventListener('openstride:activities-refreshed', handleRefresh)
})

onUnmounted(() => {
  window.removeEventListener('openstride:activities-refreshed', handleRefresh)
})
</script>

<style scoped>
.setup-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.625rem 1.25rem;
  background: var(--color-yellow-100);
  border-left: 3px solid var(--color-yellow-500);
  color: var(--color-yellow-800);
  font-size: 0.875rem;
}

.setup-banner-content {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex: 1;
  min-width: 0;
}

.setup-banner-content i {
  font-size: 1rem;
  flex-shrink: 0;
}

.setup-banner-message {
  line-height: 1.4;
}

.setup-banner-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.setup-banner-cta {
  padding: 0.3125rem 0.875rem;
  background: var(--color-yellow-500);
  color: var(--color-white);
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  transition: background 0.2s;
}

.setup-banner-cta:hover {
  background: var(--color-yellow-600);
}

.setup-banner-dismiss {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border: none;
  background: none;
  color: var(--color-yellow-800);
  cursor: pointer;
  border-radius: 0.25rem;
  transition: background 0.2s;
  font-size: 0.875rem;
}

.setup-banner-dismiss:hover {
  background: rgba(0, 0, 0, 0.08);
}

/* Transition */
.setup-banner-enter-active {
  transition: all 0.3s ease;
}

.setup-banner-leave-active {
  transition: all 0.2s ease;
}

.setup-banner-enter-from {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.setup-banner-enter-to {
  max-height: 80px;
}

.setup-banner-leave-to {
  opacity: 0;
}

/* Mobile responsive */
@media (max-width: 37.5rem) {
  .setup-banner {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .setup-banner-actions {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
