<template>
  <div class="profile-container">
    <!-- Tabs Navigation -->
    <nav class="profile-tabs" role="tablist" aria-label="Profile sections">
      <button
        v-for="tab in allTabs"
        :key="tab.id"
        :class="['profile-tab', { active: activeTab === tab.id }]"
        :aria-selected="activeTab === tab.id"
        :aria-controls="`panel-${tab.id}`"
        role="tab"
        @click="selectTab(tab.id)"
      >
        <i :class="tab.icon" aria-hidden="true"></i>
        <span class="tab-label">{{ t(tab.labelKey) }}</span>
      </button>
    </nav>

    <!-- Content Area -->
    <div class="profile-content">
      <div
        v-for="tab in allTabs"
        :key="tab.id"
        v-show="activeTab === tab.id"
        :id="`panel-${tab.id}`"
        role="tabpanel"
        :aria-labelledby="`tab-${tab.id}`"
      >
        <component :is="tab.component" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { getActiveAppPlugins } from '@/services/ExtensionPluginRegistry'
import ProfileAthlete from '@/components/profile/ProfileAthlete.vue'
import ProfilePreferences from '@/components/profile/ProfilePreferences.vue'
import ProfileDataSources from '@/components/profile/ProfileDataSources.vue'
import ProfileCloudBackup from '@/components/profile/ProfileCloudBackup.vue'
import ProfileAppExtensions from '@/components/profile/ProfileAppExtensions.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// Allow dynamic tab IDs from plugins
type TabId = string

interface Tab {
  id: TabId
  labelKey: string
  icon: string
  component: any
}

const tabs: Tab[] = [
  {
    id: 'profile',
    labelKey: 'profile.tabs.profile',
    icon: 'fas fa-user',
    component: ProfileAthlete
  },
  {
    id: 'preferences',
    labelKey: 'profile.tabs.preferences',
    icon: 'fas fa-cog',
    component: ProfilePreferences
  },
  {
    id: 'data-sources',
    labelKey: 'profile.tabs.dataSources',
    icon: 'fas fa-database',
    component: ProfileDataSources
  },
  {
    id: 'cloud-backup',
    labelKey: 'profile.tabs.cloudBackup',
    icon: 'fas fa-cloud',
    component: ProfileCloudBackup
  },
  {
    id: 'app-extensions',
    labelKey: 'profile.tabs.appExtensions',
    icon: 'fas fa-puzzle-piece',
    component: ProfileAppExtensions
  }
]

// Load dynamic tabs from plugins
const dynamicTabs = ref<Tab[]>([])

// Combine static and dynamic tabs
const allTabs = computed(() => [...tabs, ...dynamicTabs.value])

const activeTab = ref<TabId>('profile')

// Initialize active tab from query param and load dynamic tabs
onMounted(async () => {
  // Load plugins with profile.tabs slot
  const plugins = await getActiveAppPlugins()

  // Extract tabs from plugins that have tabMetadata
  const pluginTabs = await Promise.all(
    plugins
      .filter(p => p.slots?.['profile.tabs'] && (p as any).tabMetadata)
      .map(async (plugin: any) => {
        const metadata = plugin.tabMetadata
        const loaders = plugin.slots['profile.tabs']
        const loader = Array.isArray(loaders) ? loaders[0] : loaders
        const component = await loader()

        return {
          id: metadata.tabId,
          labelKey: metadata.tabLabelKey,
          icon: metadata.tabIcon,
          component: component.default || component  // Extract component from ES module
        }
      })
  )

  dynamicTabs.value = pluginTabs.filter((tab: Tab) => tab.id && tab.labelKey && tab.icon)

  // Initialize active tab from query param
  const tabParam = route.query.tab as TabId
  if (tabParam && allTabs.value.some(t => t.id === tabParam)) {
    activeTab.value = tabParam
  }
})

// Watch for route query changes
watch(() => route.query.tab, (newTab) => {
  if (newTab && allTabs.value.some(t => t.id === newTab)) {
    activeTab.value = newTab as TabId
  }
})

// Update URL when tab changes
const selectTab = (tabId: TabId) => {
  activeTab.value = tabId
  router.push({ query: { tab: tabId } })
}
</script>

<style scoped>
.profile-container {
  display: flex;
  min-height: calc(100vh - 80px);
  background-color: #f9fafb;
}

/* Desktop: Vertical tabs on the left */
@media (min-width: 768px) {
  .profile-tabs {
    display: flex;
    flex-direction: column;
    width: 20%;
    min-width: 200px;
    background-color: white;
    border-right: 1px solid #e5e7eb;
    padding: 1.5rem 0;
  }

  .profile-content {
    flex: 1;
    padding: 2rem;
    overflow-y: auto;
  }

  .profile-tab {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s;
    color: #6b7280;
    font-size: 0.95rem;
    border-left: 3px solid transparent;
    width: 100%;
  }

  .profile-tab:hover {
    background-color: #f3f4f6;
    color: #374151;
  }

  .profile-tab.active {
    background-color: #ecfdf5;
    color: #059669;
    border-left-color: #059669;
    font-weight: 600;
  }

  .profile-tab i {
    font-size: 1.1rem;
    width: 1.5rem;
    text-align: center;
  }

  .tab-label {
    display: inline;
  }
}

/* Mobile: Horizontal scrollable tabs on top */
@media (max-width: 767px) {
  .profile-container {
    flex-direction: column;
  }

  .profile-tabs {
    display: flex;
    overflow-x: auto;
    background-color: white;
    border-bottom: 1px solid #e5e7eb;
    padding: 0.5rem 1rem;
    gap: 0.5rem;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .profile-tabs::-webkit-scrollbar {
    display: none;
  }

  .profile-content {
    padding: 1rem;
    overflow-y: auto;
  }

  .profile-tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.75rem 1rem;
    border: none;
    background: transparent;
    cursor: pointer;
    transition: all 0.2s;
    color: #6b7280;
    font-size: 0.75rem;
    white-space: nowrap;
    border-bottom: 2px solid transparent;
    min-width: fit-content;
  }

  .profile-tab:hover {
    color: #374151;
  }

  .profile-tab.active {
    color: #059669;
    border-bottom-color: #059669;
    font-weight: 600;
  }

  .profile-tab i {
    font-size: 1.25rem;
  }

  .tab-label {
    font-size: 0.7rem;
  }
}
</style>
