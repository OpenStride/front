<template>
  <div class="space-y-6">
    <h2 class="text-2xl font-bold">{{ t('profile.sharePrivacy') }}</h2>

    <!-- Privacy Settings -->
    <div class="bg-white shadow rounded-xl p-6 space-y-4">
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

    <!-- Publish Button -->
    <button
      @click="publishData"
      :disabled="publishing"
      class="w-full bg-green-600 text-white py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400"
    >
      {{
        publishing
          ? t('profile.publishing')
          : publicUrl
            ? t('profile.updateData')
            : t('profile.publishData')
      }}
    </button>

    <!-- QR Code Display -->
    <div v-if="publicUrl" class="mt-4">
      <p class="text-sm font-medium text-gray-700 text-center mb-2">
        {{ t('profile.scanToFollow') }}
      </p>
      <QRCodeDisplay :url="publicUrl" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePluginContext } from '@/composables/usePluginContext'
import QRCodeDisplay from '@/components/QRCodeDisplay.vue'
import type { FriendServiceEvent } from '@/types/friend'

const { t } = useI18n()
const { storage, notifications, friends } = usePluginContext()

// Privacy & Sharing state
const defaultPrivacy = ref<'public' | 'private'>('private')
const publicUrl = ref<string | null>(null)
const publishing = ref(false)

// Event listener for FriendService events
const handleFriendEvent = ((...args: unknown[]) => {
  const event = args[0] as Event
  const customEvent = event as CustomEvent<FriendServiceEvent>
  const { message, messageType } = customEvent.detail

  if (message && messageType) {
    notifications.notify(message, {
      type: messageType,
      timeout: messageType === 'error' ? 5000 : messageType === 'warning' ? 4000 : 3000
    })
  }
}) as (...args: unknown[]) => void

onMounted(async () => {
  // Load privacy settings
  const privacySetting = await storage.getData('defaultPrivacy')
  defaultPrivacy.value = (privacySetting as string as 'public' | 'private') || 'private'

  // Load public URL if available
  publicUrl.value = await friends.getMyPublicUrl()

  // Listen to FriendService events
  friends.onEvent('friend-event', handleFriendEvent)
})

onBeforeUnmount(() => {
  // Clean up event listener
  friends.offEvent('friend-event', handleFriendEvent)
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
    }
  } catch (error) {
    console.error('[ProfileSharingTab] Error publishing data:', error)
  } finally {
    publishing.value = false
  }
}
</script>
