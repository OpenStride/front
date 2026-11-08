<template>
  <div class="gdrive-setup space-y-4 p-4 bg-white shadow max-w-xl mx-auto">
    <div class="flex items-center space-x-2">
      <img src="../assets/logo.png" alt="Google Drive" class="w-8 h-8" />
      <h1 class="text-2xl font-bold">Google Drive</h1>
    </div>
    <div v-if="isConnected == 0" class="mt-6 text-center space-y-4">
      <!-- loading -->
      <p class="text-sm text-gray-600">{{ t('gdrive.checking') }}</p>
    </div>
    <div v-else-if="isConnected == 1" class="mt-6 space-y-4">
      <div v-if="backupFilePresent == 1" class="text-sm text-gray-600">
        <p>
          <i class="fas fa-check-circle" aria-hidden="true"></i> {{ t('gdrive.backupPresent') }}
        </p>
      </div>
      <div v-if="backupFilePresent == 0" class="text-sm text-gray-600">
        <p>{{ t('gdrive.verifying') }}</p>
      </div>
      <div v-else-if="backupFilePresent == -1" class="text-sm text-gray-600">
        <button @click="createBackupFile" class="btn btn--primary">
          {{ t('gdrive.createBackup') }}
        </button>
      </div>

      <p class="text-sm text-gray-600">
        <i class="fas fa-check-circle" aria-hidden="true"></i> {{ t('gdrive.connected') }}
      </p>
      <div class="text-center space-y-2">
        <!-- 1ère ligne : Refresh & Reconnect côte à côte -->
        <div class="flex justify-center gap-2">
          <button @click="onRefresh" :disabled="isRefreshing" class="btn btn--primary">
            <i
              class="fas fa-refresh"
              :class="{ 'animate-spin': isRefreshing }"
              aria-hidden="true"
            ></i>
            <span>
              {{
                isRefreshing
                  ? t('gdrive.refreshing')
                  : isRefreshed
                    ? t('gdrive.refreshed')
                    : t('gdrive.refresh')
              }}
            </span>
          </button>

          <button @click="oauthSignIn" class="btn btn--quiet">
            <i class="fas fa-plug" aria-hidden="true"></i>
            {{ t('gdrive.reconnect') }}
          </button>
        </div>

        <!-- 2ᵉ ligne : Disconnect centré sous les 2 premiers -->
        <div>
          <button v-if="isConnected" @click="disconnectGoogleDrive" class="btn btn--quiet">
            <i class="fas fa-unlink" aria-hidden="true"></i>
            {{ t('gdrive.disconnect') }}
          </button>
        </div>

        <!-- Action avancée : forcer une resynchronisation complète -->
        <div class="pt-3 mt-2 border-t border-gray-100">
          <button
            @click="onForceResync"
            :disabled="isForcing"
            class="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 transition"
          >
            <i class="fas fa-rotate" :class="{ 'animate-spin': isForcing }" aria-hidden="true"></i>
            <span>{{ isForcing ? t('gdrive.resyncing') : t('gdrive.forceResync') }}</span>
          </button>
          <p class="text-xs text-gray-400 mt-1">
            {{ t('gdrive.forceResyncHint') }}
          </p>
        </div>
      </div>
    </div>
    <div v-else-if="isConnected == -1" class="mt-6 text-center space-y-4">
      <button @click="oauthSignIn" class="btn btn--primary">
        <i class="fas fa-plug" aria-hidden="true"></i>
        {{ t('gdrive.connect') }}
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { onMounted, ref } from 'vue'

import { GoogleDriveAuthService } from './GoogleDriveAuthService'
import { GoogleDriveFileService } from './GoogleDriveFileService'
import { usePluginContext } from '@/composables/usePluginContext'

const { t } = useI18n()

const isRefreshing = ref(false)
const isRefreshed = ref(false)
const isForcing = ref(false)

const { storage, sync } = usePluginContext()

let googleDriveAuthService: GoogleDriveAuthService | null = null
let googleDriveFileService: GoogleDriveFileService | null = null
const isConnected = ref(0) // 0 = pending, 1 = connected, -1 = disconnected
const backupFilePresent = ref(0) // 0 = pending, 1 = present, -1 = not present

const oauthSignIn = async () => {
  if (!googleDriveAuthService) return
  const uri = await googleDriveAuthService.getOauthSignInUri()
  if (uri) {
    window.location.href = uri
  } else {
    console.error('Failed to get OAuth sign-in URI')
  }
}

const createBackupFile = async () => {
  /* noop */
}

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
  await sync.syncNow()
}

async function onForceResync() {
  isForcing.value = true
  try {
    await sync.syncNow({ force: true })
  } catch (e) {
    console.error(e)
  } finally {
    isForcing.value = false
  }
}

const disconnectGoogleDrive = async () => {
  await storage.deleteData('gdrive_access_token')
  await storage.deleteData('gdrive_refresh_token')
  await storage.deleteData('gdrive_access_token_expire_timestamp')
  isConnected.value = -1
}

onMounted(async () => {
  googleDriveAuthService = await GoogleDriveAuthService.getInstance()

  let accessToken = await googleDriveAuthService.getAccessToken()

  const urlParams = new URLSearchParams(window.location.search)
  const code = urlParams.get('code')
  if (code) {
    accessToken = await googleDriveAuthService.getAccessTokenFromCode(code)
  }

  if (accessToken) {
    isConnected.value = 1
  } else {
    isConnected.value = -1
  }

  if (isConnected.value == 1) {
    googleDriveFileService = await GoogleDriveFileService.getInstance()
    const file = await googleDriveFileService.ensureBackupFile('backup.json')
    if (file) {
      backupFilePresent.value = 1
    } else {
      backupFilePresent.value = -1
    }
  }
})
</script>
