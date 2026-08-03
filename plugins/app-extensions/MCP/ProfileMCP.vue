<template>
  <div class="profile-panel">
    <section>
      <h3>{{ t('profile.mcp.title') }}</h3>
      <p class="panel-lead">{{ t('profile.mcp.description') }}</p>

      <!-- Publishing rides on the same cloud space as the public profile, so
           without one there is nothing for an assistant to read. -->
      <div v-if="!isGDriveConnected" class="notice">
        <p class="notice__title">
          <i class="fas fa-circle-info" aria-hidden="true"></i>
          {{ t('profile.mcp.gdriveRequired') }}
        </p>
        <p class="notice__text">{{ t('profile.mcp.gdriveRequiredHelp') }}</p>
        <button @click="goToCloudBackup" class="btn btn--notice">
          <i class="fas fa-cloud" aria-hidden="true"></i>
          {{ t('profile.mcp.goToCloudBackup') }}
        </button>
      </div>
    </section>

    <template v-if="isGDriveConnected">
      <section>
        <h3><span class="step">1</span>{{ t('profile.mcp.step1Title') }}</h3>
        <p class="panel-lead">{{ t('profile.mcp.step1Help') }}</p>

        <div class="card">
          <button @click="handlePublish" :disabled="publishing" class="btn btn--primary">
            <i
              :class="['fas', publishing ? 'fa-spinner fa-spin' : 'fa-sync-alt']"
              aria-hidden="true"
            ></i>
            {{ publishing ? t('profile.mcp.publishing') : t('profile.mcp.publishData') }}
          </button>

          <p v-if="lastSyncTime" class="field-hint">
            <i class="fas fa-check" aria-hidden="true"></i>
            {{ t('profile.mcp.lastSync') }} : {{ formatDate(lastSyncTime) }}
          </p>
        </div>
      </section>

      <section v-if="manifestUrl">
        <h3><span class="step">2</span>{{ t('profile.mcp.step2Title') }}</h3>
        <p class="panel-lead">{{ t('profile.mcp.step2Help') }}</p>

        <div class="card url-card">
          <input ref="urlInput" :value="manifestUrl" readonly @click="selectAll" class="url" />
          <button
            @click="copyToClipboard"
            class="btn"
            :class="copied ? 'btn--primary' : 'btn--quiet'"
          >
            <i :class="['fas', copied ? 'fa-check' : 'fa-copy']" aria-hidden="true"></i>
            {{ copied ? t('profile.mcp.copied') : t('profile.mcp.copy') }}
          </button>
        </div>
      </section>

      <section>
        <h3><span class="step">3</span>{{ t('profile.mcp.step3Title') }}</h3>

        <details class="card config">
          <summary class="config__summary">
            <i class="fas fa-book" aria-hidden="true"></i>
            {{ t('profile.mcp.showConfig') }}
            <i class="fas fa-chevron-down config__chevron" aria-hidden="true"></i>
          </summary>

          <p class="field-hint">{{ t('profile.mcp.configIntro') }}</p>

          <div class="platforms" role="tablist">
            <button
              v-for="platform in platforms"
              :key="platform.id"
              role="tab"
              :aria-selected="selectedPlatform === platform.id"
              :class="['platform', { active: selectedPlatform === platform.id }]"
              @click="selectedPlatform = platform.id"
            >
              {{ platform.name }}
            </button>
          </div>

          <div class="code">
            <div class="code__head">
              <span class="code__path">
                <i class="fas fa-file-code" aria-hidden="true"></i>
                {{ currentPlatformPath }}
              </span>
              <button @click="copyConfig" class="code__copy">
                <i class="fas fa-copy" aria-hidden="true"></i>
                {{ t('profile.mcp.copyConfig') }}
              </button>
            </div>
            <pre class="code__body"><code>{{ configCode }}</code></pre>
          </div>

          <ol class="steps">
            <li>{{ t('profile.mcp.configStep1') }}</li>
            <li>{{ t('profile.mcp.configStep2') }}</li>
            <li>{{ t('profile.mcp.configStep3') }}</li>
          </ol>
        </details>
      </section>

      <section v-if="stats">
        <h3>{{ t('profile.mcp.statsTitle') }}</h3>
        <div class="stats">
          <div class="stat">
            <span class="stat__value">{{ stats.totalActivities }}</span>
            <span class="stat__label">{{ t('profile.mcp.totalActivities') }}</span>
          </div>
          <div class="stat">
            <span class="stat__value">{{ formatDistance(stats.totalDistance) }}</span>
            <span class="stat__label">{{ t('profile.mcp.totalDistance') }}</span>
          </div>
          <div class="stat">
            <span class="stat__value">{{ formatCompactDuration(stats.totalDuration) }}</span>
            <span class="stat__label">{{ t('profile.mcp.totalDuration') }}</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { usePluginContext } from '@/composables/usePluginContext'
import { formatCompactDuration } from '@/utils/duration'

const { t } = useI18n()
const router = useRouter()
const { friends, storage, plugins, units } = usePluginContext()

const manifestUrl = ref('')
const copied = ref(false)
const publishing = ref(false)
const isGDriveConnected = ref(false)
const lastSyncTime = ref<number | null>(null)
const urlInput = ref<HTMLInputElement>()
const selectedPlatform = ref('macos')
/** What `publishPublicData` records about the last publish. */
interface PublicDataStats {
  totalActivities: number
  totalDistance: number
  totalDuration: number
}

const stats = ref<PublicDataStats | null>(null)

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
  return platforms.find(p => p.id === selectedPlatform.value)?.path || ''
})

const configCode = computed(() => {
  const fileId = extractFileId(manifestUrl.value)
  const url = fileId ? `https://drive.google.com/uc?id=${fileId}` : 'YOUR_MANIFEST_URL'

  return `{
  "mcpServers": {
    "openstride": {
      "command": "npx",
      "args": ["-y", "@openstride/mcp-server"],
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
    isGDriveConnected.value = await plugins.isPluginActive('gdrive')

    if (isGDriveConnected.value) {
      // Load manifest URL (use raw manifest URL, not wrapped share URL)
      const url = await friends.getMyManifestUrl()
      if (url) {
        manifestUrl.value = url
      }

      // Load stats from storage
      const savedStats = await storage.getData<PublicDataStats>('publicDataStats')
      if (savedStats) {
        stats.value = savedStats
      }

      // Load last sync time
      const savedLastSync = await storage.getData<number>('lastPublicDataSync')
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
    const url = await friends.publishPublicData()

    if (url) {
      // Get the raw manifest URL instead of the share URL
      const rawUrl = await friends.getMyManifestUrl()
      if (rawUrl) {
        manifestUrl.value = rawUrl
      }
      lastSyncTime.value = Date.now()

      // Save last sync time
      await storage.saveData('lastPublicDataSync', lastSyncTime.value)

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
  return units.format('distance', meters).text
}


</script>

<style scoped>
/* Layout, cards, notices and buttons come from profile.css. */
.step {
  display: inline-grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background: var(--color-green-600);
  color: var(--color-white);
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}

.notice {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--color-yellow-50);
  border: 1px solid var(--color-yellow-200);
  border-radius: var(--radius-md);
}

.notice__title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-yellow-800);
}

.notice__text {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--color-yellow-800);
}

.btn--notice {
  align-self: flex-start;
  background: var(--color-yellow-500);
  color: var(--color-white);
}

.btn--notice:hover {
  background: var(--color-yellow-600);
}

.url-card {
  flex-direction: row;
  align-items: center;
}

.url {
  flex: 1;
  min-width: 0;
  padding: 0.5rem 0.625rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--text-muted);
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}

/* ===== Config ===== */
.config__summary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-green-700);
  list-style: none;
}

.config__chevron {
  margin-left: auto;
  transition: transform 0.2s;
}

.config[open] .config__chevron {
  transform: rotate(180deg);
}

.platforms {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  border-bottom: 1px solid var(--border-subtle);
}

.platform {
  padding: 0.5rem 0.75rem;
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  font-family: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
}

.platform.active {
  border-bottom-color: var(--color-green-600);
  color: var(--color-green-700);
}

.code {
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.code__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--color-ink);
  color: var(--color-gray-300);
  font-size: 0.75rem;
}

.code__path {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.code__copy {
  flex-shrink: 0;
  padding: 0.25rem 0.5rem;
  border: none;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.14);
  color: var(--color-white);
  font-family: inherit;
  font-size: 0.6875rem;
  cursor: pointer;
}

.code__copy:hover {
  background: rgba(255, 255, 255, 0.24);
}

.code__body {
  margin: 0;
  padding: 0.875rem;
  background: #14141f;
  color: var(--color-gray-100);
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  line-height: 1.5;
  overflow-x: auto;
}

.steps {
  margin: 0;
  padding-left: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--text-muted);
}

/* ===== Stats ===== */
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
  gap: 0.5rem;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.875rem 0.5rem;
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  text-align: center;
}

.stat__value {
  font-family: var(--font-mono);
  font-size: 1.375rem;
  font-weight: 700;
  color: var(--color-green-700);
}

.stat__label {
  font-size: 0.75rem;
  line-height: 1.35;
  color: var(--text-muted);
}
</style>
