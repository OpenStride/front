<template>
  <div class="space-y-4 p-4 bg-white shadow max-w-xl mx-auto rounded">
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
          <i class="fas fa-check-circle" aria-hidden="true"></i> fichier de sauvegarde présent sur
          Google Drive.
        </p>
      </div>
      <div v-if="backupFilePresent == 0" class="text-sm text-gray-600">
        <p>{{ t('gdrive.verifying') }}</p>
      </div>
      <div v-else-if="backupFilePresent == -1" class="text-sm text-gray-600">
        <button
          @click="createBackupFile"
          class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          Créer un fichier de sauvegarde
        </button>
      </div>

      <p class="text-sm text-gray-600">
        <i class="fas fa-check-circle" aria-hidden="true"></i> La connexion est active
      </p>
      <div class="text-center space-y-2">
        <!-- 1ère ligne : Refresh & Reconnect côte à côte -->
        <div class="flex justify-center gap-2">
          <button
            @click="onRefresh"
            :disabled="isRefreshing"
            :class="[
              'inline-flex items-center gap-2 px-5 py-2.5 font-medium rounded-lg shadow-sm transition',
              isRefreshing ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700',
              !isRefreshing && isRefreshed ? 'bg-green-600' : ''
            ]"
            class="text-white"
          >
            <i
              class="fas fa-refresh"
              :class="{ 'animate-spin': isRefreshing }"
              aria-hidden="true"
            ></i>
            <span>
              {{ isRefreshing ? 'Refreshing…' : isRefreshed ? 'Refreshed' : 'Refresh' }}
            </span>
          </button>

          <button
            @click="oauthSignIn"
            class="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white font-medium rounded-lg shadow-sm hover:bg-green-700 transition"
          >
            <i class="fas fa-plug" aria-hidden="true"></i>
            Reconnect
          </button>
        </div>

        <!-- 2ᵉ ligne : Disconnect centré sous les 2 premiers -->
        <div>
          <button
            v-if="isConnected"
            @click="disconnectGoogleDrive"
            class="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-200 text-gray-700 font-medium rounded-lg shadow-sm hover:bg-gray-300 transition"
          >
            <i class="fas fa-unlink" aria-hidden="true"></i>
            Disconnect
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
            <span>{{
              isForcing ? 'Resynchronisation…' : 'Forcer une resynchronisation complète'
            }}</span>
          </button>
          <p class="text-xs text-gray-400 mt-1">
            Ignore l'optimisation et relit l'intégralité des données distantes.
          </p>
        </div>
      </div>
    </div>
    <div v-else-if="isConnected == -1" class="mt-6 text-center space-y-4">
      <button
        @click="oauthSignIn"
        class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
      >
        Connexion
      </button>
    </div>

    <p v-if="signInError" class="text-sm text-center text-red-600">
      <i class="fas fa-triangle-exclamation" aria-hidden="true"></i> {{ signInError }}
    </p>
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

const signInError = ref('')

const oauthSignIn = async () => {
  if (!googleDriveAuthService) return
  signInError.value = ''
  try {
    // On native this returns having already exchanged the code: the sign-in
    // happens in a system browser and comes back through a deep link, because
    // Google refuses its sign-in page inside an embedded WebView. On the web
    // nothing changes — the page navigates away and comes back with a ?code=.
    const { handled, url } = await googleDriveAuthService.signIn()
    if (handled) {
      await refreshConnectionState()
      return
    }
    if (url) window.location.href = url
    else signInError.value = t('gdrive.signInUnavailable')
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    if (reason === 'cancelled') return
    signInError.value =
      reason === 'VITE_GOOGLE_NATIVE_CLIENT_ID is not set'
        ? t('gdrive.signInUnavailable')
        : t('gdrive.signInFailed', { message: reason })
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

/** Read the connection state from a token, and pick up the backup file with it. */
async function refreshConnectionState(accessToken?: string | null) {
  const token = accessToken ?? (await googleDriveAuthService?.getAccessToken())
  isConnected.value = token ? 1 : -1
  if (isConnected.value !== 1) return

  googleDriveFileService = await GoogleDriveFileService.getInstance()
  backupFilePresent.value = (await googleDriveFileService.ensureBackupFile('backup.json')) ? 1 : -1
}

onMounted(async () => {
  googleDriveAuthService = await GoogleDriveAuthService.getInstance()

  let accessToken = await googleDriveAuthService.getAccessToken()

  const urlParams = new URLSearchParams(window.location.search)
  const code = urlParams.get('code')
  if (code) {
    accessToken = await googleDriveAuthService.getAccessTokenFromCode(code)
  }

  await refreshConnectionState(accessToken)
})
</script>
