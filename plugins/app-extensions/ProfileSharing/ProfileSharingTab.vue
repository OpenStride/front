<template>
  <div class="space-y-6">
    <!-- A section of the friends tab, not a page of its own -->
    <h3 class="text-lg font-bold">{{ t('profile.sharePrivacy') }}</h3>

    <!-- What the section is for, so it comes first rather than under a
         privacy dropdown and a publish button -->
    <div v-if="publicUrl" class="bg-white shadow p-6 space-y-3">
      <p class="text-sm font-medium text-gray-700 text-center">
        {{ t('profile.scanToFollow') }}
      </p>
      <QRCodeDisplay :url="publicUrl" />
    </div>

    <!-- Publishing needs a cloud provider that can host public files. Saying so
         here beats letting the button fail with "upload error". -->
    <div
      v-if="!checkingSupport && !canPublish"
      class="border border-amber-300 bg-amber-50 p-4 space-y-3"
      data-test="publish-requires-storage"
    >
      <p class="text-sm font-medium text-amber-900">
        <i class="fas fa-circle-info mr-1" aria-hidden="true"></i>
        {{ t('profile.publishNeedsStorage') }}
      </p>
      <p class="text-xs text-amber-800">{{ t('profile.publishNeedsStorageHelp') }}</p>
      <router-link
        to="/profile?tab=cloud-backup"
        class="inline-flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700"
      >
        <i class="fas fa-cloud" aria-hidden="true"></i>
        {{ t('profile.connectStorage') }}
      </router-link>
    </div>

    <!-- Publish Button -->
    <button
      v-else
      @click="publishData"
      :disabled="publishing || checkingSupport"
      class="w-full bg-green-600 text-white py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400"
      data-test="publish-button"
    >
      {{
        publishing
          ? t('profile.publishing')
          : publicUrl
            ? t('profile.updateData')
            : t('profile.publishData')
      }}
    </button>

    <!-- Keeping the published copy fresh is the whole point of publishing: a
         profile frozen on the day it was created is what friends see otherwise. -->
    <div v-if="publicUrl" class="bg-white shadow p-6 space-y-3">
      <label class="flex items-center gap-3">
        <input
          type="checkbox"
          :checked="autoPublish"
          @change="toggleAutoPublish"
          class="h-4 w-4"
          data-test="auto-publish-toggle"
        />
        <span class="text-sm font-medium text-gray-700">{{ t('profile.autoPublish') }}</span>
      </label>
      <p class="text-xs text-gray-500">{{ t('profile.autoPublishHint') }}</p>
    </div>

    <!-- Privacy Settings -->
    <div class="bg-white shadow p-6 space-y-4">
      <label class="text-sm font-medium text-gray-700">{{ t('profile.defaultPrivacy') }}</label>
      <select
        v-model="defaultPrivacy"
        @change="saveDefaultPrivacy"
        class="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring focus:border-green-300"
      >
        <option value="private">{{ t('profile.private') }}</option>
        <option value="public">{{ t('profile.public') }}</option>
      </select>
      <p class="text-xs text-gray-500">
        {{ t('profile.privacyHint') }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePluginContext } from '@/composables/usePluginContext'
import QRCodeDisplay from '@/components/QRCodeDisplay.vue'

const { t } = useI18n()
const { storage, notifications, friends } = usePluginContext()

// Privacy & Sharing state
const defaultPrivacy = ref<'public' | 'private'>('private')
const publicUrl = ref<string | null>(null)
const publishing = ref(false)
const canPublish = ref(false)
const checkingSupport = ref(true)
const autoPublish = ref(false)

// Toasts for friend events are raised once by the app layout — not here
onMounted(async () => {
  // Load privacy settings
  const privacySetting = await storage.getData('defaultPrivacy')
  defaultPrivacy.value = (privacySetting as string as 'public' | 'private') || 'private'

  // Load public URL if available
  publicUrl.value = await friends.getMyPublicUrl()

  canPublish.value = await friends.canPublish()
  checkingSupport.value = false
  autoPublish.value = await friends.isAutoPublishEnabled()
})

// Privacy & Sharing functions
const saveDefaultPrivacy = async () => {
  await storage.saveData('defaultPrivacy', defaultPrivacy.value)
}

const publishData = async () => {
  publishing.value = true
  try {
    const url = await friends.publishPublicData()
    if (url) {
      publicUrl.value = url
      // The first publish arms auto-publish, so reflect the new state
      autoPublish.value = await friends.isAutoPublishEnabled()
    }
  } catch (error) {
    console.error('[ProfileSharingTab] Error publishing data:', error)
  } finally {
    publishing.value = false
  }
}

const toggleAutoPublish = async (event: Event) => {
  const enabled = (event.target as HTMLInputElement).checked
  await friends.setAutoPublish(enabled)
  autoPublish.value = enabled
  notifications.notify(enabled ? t('profile.autoPublishOn') : t('profile.autoPublishOff'), {
    type: 'info',
    timeout: 3000
  })
}
</script>
