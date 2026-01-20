<template>
  <div class="space-y-4 p-4 bg-white shadow max-w-xl mx-auto rounded">
    <div class="flex items-center space-x-2">
      <img src="../assets/logo.png" alt="Google Drive" class="w-8 h-8" />
      <h1 class="text-2xl font-bold">Google Drive</h1>
    </div>
    <div v-if="isConnected == 0" class="mt-6 text-center space-y-4">
      <!-- loading -->
      <p class="text-sm text-gray-600">Vérification de la connexion à Google Drive...</p>
    </div>
    <div v-else-if="isConnected == 1" class="mt-6 space-y-4">
      <div v-if="backupFilePresent == 1" class="text-sm text-gray-600">
        <p><i class="fas fa-check-circle"></i> fichier de sauvegarde présent sur Google Drive.</p>
      </div>
      <div v-if="backupFilePresent == 0" class="text-sm text-gray-600">
        <p>verification en cours...</p>
      </div>
      <div v-else-if="backupFilePresent == -1" class="text-sm text-gray-600">
        <button @click="createBackupFile"
          class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
          Créer un fichier de sauvegarde
        </button>
      </div>

      <p class="text-sm text-gray-600"><i class="fas fa-check-circle"></i> La connexion est active</p>
      <div class="text-center space-y-2">
        <!-- 1ère ligne : Refresh & Reconnect côte à côte -->
        <div class="flex justify-center gap-2">
          <button @click="onRefresh" :disabled="isRefreshing" :class="[
            'inline-flex items-center gap-2 px-5 py-2.5 font-medium rounded-lg shadow-sm transition',
            isRefreshing ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700',
            !isRefreshing && isRefreshed ? 'bg-green-600' : ''
          ]" class="text-white">
            <i class="fas fa-refresh" :class="{ 'animate-spin': isRefreshing }"></i>
            <span>
              {{ isRefreshing
                ? 'Refreshing…'
                : isRefreshed
                  ? 'Refreshed'
                  : 'Refresh' }}
            </span>
          </button>

          <button @click="oauthSignIn"
            class="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white font-medium rounded-lg shadow-sm hover:bg-green-700 transition">
            <i class="fas fa-plug"></i>
            Reconnect
          </button>
        </div>

        <!-- 2ᵉ ligne : Disconnect centré sous les 2 premiers -->
        <div>
          <button v-if="isConnected" @click="disconnectGoogleDrive"
            class="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-200 text-gray-700 font-medium rounded-lg shadow-sm hover:bg-gray-300 transition">
            <i class="fas fa-unlink"></i>
            Disconnect
          </button>
        </div>
      </div>

    </div>
    <div v-else-if="isConnected == -1" class="mt-6 text-center space-y-4">
      <button @click="oauthSignIn"
        class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
        Connexion
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';

import { GoogleDriveAuthService } from './GoogleDriveAuthService';
import { GoogleDriveFileService } from './GoogleDriveFileService';
import { getSyncService } from '@/services/SyncService';
import { IndexedDBService } from '@/services/IndexedDBService';

const isRefreshing = ref(false)
const isRefreshed = ref(false)

let googleDriveAuthService: GoogleDriveAuthService | null = null;
let googleDriveFileService: GoogleDriveFileService | null = null;
let dbService: IndexedDBService | null = null;
const isConnected = ref(0); // 0 = pending, 1 = connected, -1 = disconnected
const backupFilePresent = ref(0); // 0 = pending, 1 = present, -1 = not present

const oauthSignIn = async () => {
  if (!googleDriveAuthService) return;
  const uri = await googleDriveAuthService.getOauthSignInUri();
  if (uri) {
    window.location.href = uri;
  } else {
    console.error('Failed to get OAuth sign-in URI');
  }
}

const createBackupFile = async () => {

};

async function onRefresh() {
  isRefreshing.value = true
  isRefreshed.value = false
  try {
    await refreshFromGoogleDrive()
    isRefreshed.value = true
    setTimeout(() => {
      isRefreshed.value = false
    }, 2000)
  } catch (e) {
    console.error(e)
  } finally {
    isRefreshing.value = false
  }
}

const refreshFromGoogleDrive = async () => {
  const syncService = getSyncService();
  await syncService.syncNow();
};

const disconnectGoogleDrive = async () => {
  if (!dbService) return;
  await dbService.deleteData('gdrive_access_token');
  await dbService.deleteData('gdrive_refresh_token');
  await dbService.deleteData('gdrive_access_token_expire_timestamp');
  isConnected.value = -1;
};

onMounted(async () => {
  dbService = await IndexedDBService.getInstance();
  googleDriveAuthService = await GoogleDriveAuthService.getInstance();

  let accessToken = await googleDriveAuthService.getAccessToken();

  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  if (code) {
    accessToken = await googleDriveAuthService.getAccessTokenFromCode(code);
  }

  if (accessToken) {
    isConnected.value = 1;
  } else {
    isConnected.value = -1;
  }

  if (isConnected.value == 1) {
    googleDriveFileService = await GoogleDriveFileService.getInstance();
    const file = await googleDriveFileService.ensureBackupFile("backup.json");
    if (file) {
      backupFilePresent.value = 1;
    } else {
      backupFilePresent.value = -1;
    }
  }

});
</script>