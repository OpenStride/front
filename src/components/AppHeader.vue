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
      <router-link to="/" @click="closeMenu">Accueil</router-link>
      <router-link to="/profile" @click="closeMenu">Profile</router-link>
      <router-link to="/friends" @click="closeMenu">Amis</router-link>
      <router-link to="/data-providers" @click="closeMenu">Data Providers</router-link>
      <router-link to="/storage-providers" @click="closeMenu">Storage Providers</router-link>
      <router-link to="/my-activities" @click="closeMenu">Mes activites</router-link>
      <button class="refresh-btn" @click="onRefresh" :disabled="refreshing">
        <span :class="['icon', { spinning: refreshing }]" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4.5 8.5a7.5 7.5 0 0 1 12.4-3.9l1.1 1.1" />
            <path d="M18 3.5v4.2h-4.2" />
            <path d="M19.5 15.5a7.5 7.5 0 0 1-12.4 3.9L6 18.3" />
            <path d="M6 20.5v-4.2h4.2" />
          </svg>
        </span>
        <span class="label">Refresh</span>
      </button>
    </nav>
  </header>
</template>

<script setup>
import { ref } from "vue";
import { DataProviderService } from '@/services/DataProviderService';
import { getSyncService } from '@/services/SyncService';
import { FriendService } from '@/services/FriendService';

const isMenuOpen = ref(false);
const refreshing = ref(false);
const dataProviderService = DataProviderService.getInstance();
const syncService = getSyncService();
const friendService = FriendService.getInstance();

const toggleMenu = () => {
  isMenuOpen.value = !isMenuOpen.value;
};

const closeMenu = () => {
  isMenuOpen.value = false;
};

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