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
      <div class="burger-menu" @click="toggleMenu">☰</div>
    </div>
    <nav :class="['nav-menu', { active: isMenuOpen }]">
      <span class="close-menu" @click="closeMenu">✖</span>
      <router-link to="/my-activities" @click="closeMenu">{{ t('navigation.myActivities') }}</router-link>
      <router-link to="/profile" @click="closeMenu">{{ t('navigation.profile') }}</router-link>
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
import { ref } from "vue";
import { useI18n } from 'vue-i18n';
import { DataProviderService } from '@/services/DataProviderService';
import { StorageService } from '@/services/StorageService';

const { t } = useI18n();

const isMenuOpen = ref(false);
const refreshing = ref(false);
const dataProviderService = DataProviderService.getInstance();
const storageService = StorageService.getInstance();

const toggleMenu = () => {
  isMenuOpen.value = !isMenuOpen.value;
};

const closeMenu = () => {
  isMenuOpen.value = false;
};

// Lance un refresh des data providers puis une sync explicite des stores critiques.
// Pas d'appel direct aux plugins de storage: on passe par StorageService qui déclenchera ses flux habituels.
const onRefresh = async () => {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    await dataProviderService.triggerRefresh();
    // Sync explicite des stores principaux pour forcer la sauvegarde après fetch.
    await storageService.syncStores([
      { store: 'activities', key: '' },
      { store: 'activity_details', key: '' }
    ]);
    // Emit a custom event so views (e.g., MyActivities) can update without full page reload
    window.dispatchEvent(new CustomEvent('openstride:activities-refreshed'));
  } catch (e) {
    console.error('Refresh error', e);
  } finally {
    refreshing.value = false;
  }
};
</script>

<style src="@/assets/styles/appheader.css"></style>