<template>
  <div class="space-y-6">
    <h2 class="text-2xl font-bold">{{ t('profile.mcp.title') }}</h2>

    <p class="text-gray-600">
      {{ t('profile.mcp.description') }}
    </p>

    <!-- Warning if Google Drive not connected -->
    <div
      v-if="!isGDriveConnected"
      class="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3"
    >
      <i class="fas fa-exclamation-triangle text-yellow-600 mt-1" aria-hidden="true"></i>
      <div class="flex-1">
        <p class="font-semibold text-yellow-900">{{ t('profile.mcp.gdriveRequired') }}</p>
        <p class="text-sm text-yellow-800 mt-1">{{ t('profile.mcp.gdriveRequiredHelp') }}</p>
        <button
          @click="goToCloudBackup"
          class="mt-3 px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 text-sm font-medium"
        >
          <i class="fas fa-cloud mr-2" aria-hidden="true"></i>
          {{ t('profile.mcp.goToCloudBackup') }}
        </button>
      </div>
    </div>

    <!-- MCP Configuration -->
    <div v-else class="space-y-6">
      <!-- Step 1: Publish Data -->
      <div class="bg-white shadow rounded-xl p-6">
        <div class="flex items-start gap-3 mb-4">
          <div
            class="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold"
          >
            1
          </div>
          <div class="flex-1">
            <h3 class="text-lg font-semibold text-gray-900">
              {{ t('profile.mcp.step1Title') }}
            </h3>
            <p class="text-sm text-gray-600 mt-1">{{ t('profile.mcp.step1Help') }}</p>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <button
            @click="handlePublish"
            :disabled="publishing"
            class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
          >
            <i
              :class="['fas', publishing ? 'fa-spinner fa-spin' : 'fa-sync-alt', 'mr-2']"
              aria-hidden="true"
            ></i>
            {{ publishing ? t('profile.mcp.publishing') : t('profile.mcp.publishData') }}
          </button>

          <div v-if="lastSyncTime" class="text-sm text-gray-600">
            <i class="fas fa-check-circle text-green-600 mr-1" aria-hidden="true"></i>
            {{ t('profile.mcp.lastSync') }}: {{ formatDate(lastSyncTime) }}
          </div>
        </div>
      </div>

      <!-- Step 2: Copy Manifest URL -->
      <div v-if="manifestUrl" class="bg-white shadow rounded-xl p-6">
        <div class="flex items-start gap-3 mb-4">
          <div
            class="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold"
          >
            2
          </div>
          <div class="flex-1">
            <h3 class="text-lg font-semibold text-gray-900">
              {{ t('profile.mcp.step2Title') }}
            </h3>
            <p class="text-sm text-gray-600 mt-1">{{ t('profile.mcp.step2Help') }}</p>
          </div>
        </div>

        <div class="flex gap-2">
          <input
            ref="urlInput"
            :value="manifestUrl"
            readonly
            @click="selectAll"
            class="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-sm font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            @click="copyToClipboard"
            :class="[
              'px-4 py-2 rounded-md font-medium text-sm transition-colors',
              copied
                ? 'bg-green-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            ]"
          >
            <i :class="['fas', copied ? 'fa-check' : 'fa-copy', 'mr-2']" aria-hidden="true"></i>
            {{ copied ? t('profile.mcp.copied') : t('profile.mcp.copy') }}
          </button>
        </div>
      </div>

      <!-- Step 3: Configure MCP Client -->
      <div class="bg-white shadow rounded-xl p-6">
        <div class="flex items-start gap-3 mb-4">
          <div
            class="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold"
          >
            3
          </div>
          <div class="flex-1">
            <h3 class="text-lg font-semibold text-gray-900">
              {{ t('profile.mcp.step3Title') }}
            </h3>
          </div>
        </div>

        <details class="group">
          <summary
            class="flex items-center gap-2 cursor-pointer text-green-600 hover:text-green-700 font-medium mb-4"
          >
            <i class="fas fa-book" aria-hidden="true"></i>
            {{ t('profile.mcp.showConfig') }}
            <i
              class="fas fa-chevron-down group-open:rotate-180 transition-transform ml-auto"
              aria-hidden="true"
            ></i>
          </summary>

          <div class="space-y-4 pt-2">
            <p class="text-sm text-gray-600">{{ t('profile.mcp.configIntro') }}</p>

            <!-- Platform tabs -->
            <div class="flex gap-2 border-b border-gray-200">
              <button
                v-for="platform in platforms"
                :key="platform.id"
                @click="selectedPlatform = platform.id"
                :class="[
                  'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                  selectedPlatform === platform.id
                    ? 'border-green-600 text-green-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                ]"
              >
                {{ platform.name }}
              </button>
            </div>

            <!-- Config code -->
            <div class="relative">
              <div
                class="flex items-center justify-between px-3 py-2 bg-gray-800 text-gray-300 text-xs rounded-t-md"
              >
                <span class="flex items-center gap-2">
                  <i class="fas fa-file-code" aria-hidden="true"></i>
                  {{ currentPlatformPath }}
                </span>
                <button
                  @click="copyConfig"
                  class="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-white"
                >
                  <i class="fas fa-copy mr-1" aria-hidden="true"></i>
                  {{ t('profile.mcp.copyConfig') }}
                </button>
              </div>
              <pre
                class="p-4 bg-gray-900 text-gray-100 text-xs rounded-b-md overflow-x-auto"
              ><code>{{ configCode }}</code></pre>
            </div>

            <!-- Instructions -->
            <ol class="space-y-2 text-sm text-gray-600 list-decimal list-inside">
              <li>{{ t('profile.mcp.configStep1') }}</li>
              <li>{{ t('profile.mcp.configStep2') }}</li>
              <li>{{ t('profile.mcp.configStep3') }}</li>
            </ol>
          </div>
        </details>
      </div>

      <!-- Statistics -->
      <div v-if="stats" class="bg-white shadow rounded-xl p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <i class="fas fa-chart-bar text-green-600" aria-hidden="true"></i>
          {{ t('profile.mcp.statsTitle') }}
        </h3>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="bg-gray-50 rounded-lg p-4 text-center">
            <div class="text-3xl font-bold text-green-600">{{ stats.totalActivities }}</div>
            <div class="text-sm text-gray-600 mt-1">{{ t('profile.mcp.totalActivities') }}</div>
          </div>
          <div class="bg-gray-50 rounded-lg p-4 text-center">
            <div class="text-3xl font-bold text-green-600">
              {{ formatDistance(stats.totalDistance) }}
            </div>
            <div class="text-sm text-gray-600 mt-1">{{ t('profile.mcp.totalDistance') }}</div>
          </div>
          <div class="bg-gray-50 rounded-lg p-4 text-center">
            <div class="text-3xl font-bold text-green-600">
              {{ formatDuration(stats.totalDuration) }}
            </div>
            <div class="text-sm text-gray-600 mt-1">{{ t('profile.mcp.totalDuration') }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { FriendService } from '@/services/FriendService'
import { IndexedDBService } from '@/services/IndexedDBService'
import { StoragePluginManager } from '@/services/StoragePluginManager'

const { t } = useI18n()
const router = useRouter()

const manifestUrl = ref('')
const copied = ref(false)
const publishing = ref(false)
const isGDriveConnected = ref(false)
const lastSyncTime = ref<number | null>(null)
const urlInput = ref<HTMLInputElement>()
const selectedPlatform = ref('macos')
const stats = ref<{
  totalActivities: number
  totalDistance: number
  totalDuration: number
} | null>(null)

const platforms = [
  {
    id: 'macos',
    name: 'macOS',
    path: '~/Library/Application Support/Claude/claude_desktop_config.json'
  },
  {
    id: 'linux',
    name: 'Linux',
    path: '~/.config/Claude/claude_desktop_config.json'
  },
  {
    id: 'windows',
    name: 'Windows',
    path: '%APPDATA%\\Claude\\claude_desktop_config.json'
  }
]

const currentPlatformPath = computed(() => {
  return platforms.find((p) => p.id === selectedPlatform.value)?.path || ''
})

const configCode = computed(() => {
  const fileId = extractFileId(manifestUrl.value)
  const url = fileId ? `https://drive.google.com/uc?id=${fileId}` : 'YOUR_MANIFEST_URL'

  return `{
  "mcpServers": {
    "openstride": {
      "command": "npx",
      "args": ["-y", "openstride-mcp-server"],
      "env": {
        "OPENSTRIDE_MANIFEST_URL": "${url}"
      }
    }
  }
}`
})

onMounted(async () => {
  await loadMCPSettings()
})

async function loadMCPSettings() {
  try {
    // Check if Google Drive is connected
    const storageManager = StoragePluginManager.getInstance()
    const enabledPlugins = await storageManager.getMyStoragePlugins()
    const gdrivePlugin = enabledPlugins.find((p) => p.id === 'gdrive')
    isGDriveConnected.value = !!gdrivePlugin

    if (isGDriveConnected.value) {
      // Load manifest URL (use raw manifest URL, not wrapped share URL)
      const friendService = FriendService.getInstance()
      const url = await friendService.getMyManifestUrl()
      if (url) {
        manifestUrl.value = url
      }

      // Load stats from IndexedDB
      const db = await IndexedDBService.getInstance()
      const savedStats = await db.getData('publicDataStats')
      if (savedStats) {
        stats.value = savedStats
      }

      // Load last sync time
      const savedLastSync = await db.getData('lastPublicDataSync')
      if (savedLastSync) {
        lastSyncTime.value = savedLastSync
      }
    }
  } catch (error) {
    console.error('[ProfileMCP] Error loading settings:', error)
  }
}

async function handlePublish() {
  if (publishing.value) return

  publishing.value = true

  try {
    const friendService = FriendService.getInstance()
    const url = await friendService.publishPublicData()

    if (url) {
      // Get the raw manifest URL instead of the share URL
      const rawUrl = await friendService.getMyManifestUrl()
      if (rawUrl) {
        manifestUrl.value = rawUrl
      }
      lastSyncTime.value = Date.now()

      // Save last sync time
      const db = await IndexedDBService.getInstance()
      await db.saveData('lastPublicDataSync', lastSyncTime.value)

      // Reload stats
      await loadMCPSettings()
    }
  } catch (error) {
    console.error('[ProfileMCP] Error publishing:', error)
  } finally {
    publishing.value = false
  }
}

async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(manifestUrl.value)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (error) {
    console.error('[ProfileMCP] Error copying:', error)
  }
}

async function copyConfig() {
  try {
    await navigator.clipboard.writeText(configCode.value)
  } catch (error) {
    console.error('[ProfileMCP] Error copying config:', error)
  }
}

function selectAll() {
  urlInput.value?.select()
}

function goToCloudBackup() {
  router.push({ name: 'profile', query: { tab: 'cloud-backup' } })
}

function extractFileId(url: string): string | null {
  if (!url) return null
  try {
    const urlObj = new URL(url)
    const pathMatch = urlObj.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/)
    if (pathMatch) return pathMatch[1]
    const idParam = urlObj.searchParams.get('id')
    if (idParam) return idParam
    return null
  } catch {
    return null
  }
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function formatDistance(meters: number): string {
  const km = meters / 1000
  return `${km.toFixed(1)} km`
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}min`
  }
  return `${minutes}min`
}
</script>
