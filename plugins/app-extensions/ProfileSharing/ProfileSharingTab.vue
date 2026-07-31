<template>
  <section class="sharing">
    <header class="sharing__head">
      <h3 class="sharing__title">{{ t('profile.myPublicProfile') }}</h3>
      <p class="sharing__lead">{{ t('profile.myPublicProfileLead') }}</p>
    </header>

    <!-- What the section is for, so it comes first rather than under a
         privacy dropdown and a publish button -->
    <div v-if="publicUrl" class="card card--center">
      <p class="card__label">{{ t('profile.scanToFollow') }}</p>
      <QRCodeDisplay :url="publicUrl" />
    </div>

    <!-- Publishing needs a cloud provider that can host public files. Saying so
         here beats letting the button fail with "upload error". -->
    <div v-if="!checkingSupport && !canPublish" class="notice" data-test="publish-requires-storage">
      <p class="notice__title">
        <i class="fas fa-circle-info" aria-hidden="true"></i>
        {{ t('profile.publishNeedsStorage') }}
      </p>
      <p class="notice__text">{{ t('profile.publishNeedsStorageHelp') }}</p>
      <router-link to="/profile?tab=cloud-backup" class="btn btn--notice">
        <i class="fas fa-cloud" aria-hidden="true"></i>
        {{ t('profile.connectStorage') }}
      </router-link>
    </div>

    <button
      v-else
      @click="publishData"
      :disabled="publishing || checkingSupport"
      class="btn btn--primary btn--block"
      data-test="publish-button"
    >
      <i class="fas fa-cloud-arrow-up" aria-hidden="true"></i>
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
    <div v-if="publicUrl" class="card">
      <label class="toggle">
        <input
          type="checkbox"
          :checked="autoPublish"
          @change="toggleAutoPublish"
          data-test="auto-publish-toggle"
        />
        <span class="toggle__label">{{ t('profile.autoPublish') }}</span>
      </label>
      <p class="card__hint">{{ t('profile.autoPublishHint') }}</p>
    </div>

    <div class="card">
      <label class="card__label" for="default-privacy">{{ t('profile.defaultPrivacy') }}</label>
      <select
        id="default-privacy"
        v-model="defaultPrivacy"
        @change="saveDefaultPrivacy"
        class="select"
      >
        <option value="private">{{ t('profile.private') }}</option>
        <option value="public">{{ t('profile.public') }}</option>
      </select>
      <p class="card__hint">{{ t('profile.privacyHint') }}</p>
    </div>
  </section>
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
  const privacySetting = await storage.getData<string>('defaultPrivacy')
  defaultPrivacy.value = (privacySetting as 'public' | 'private') || 'private'

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

<style scoped>
/* The tokens below are the same ones the friends list uses, so the two halves
   of this tab read as one section rather than two components that met. */
.sharing {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.sharing__head {
  margin-bottom: 0.25rem;
}

.sharing__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.0625rem;
  font-weight: 700;
  color: var(--color-ink);
}

.sharing__lead {
  margin: 0.25rem 0 0;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--text-muted);
}

.card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
}

.card--center {
  align-items: center;
}

.card__label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-ink);
}

.card__hint {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--text-faint);
}

.toggle {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  cursor: pointer;
}

.toggle input {
  width: 1.0625rem;
  height: 1.0625rem;
  accent-color: var(--color-green-600);
  flex-shrink: 0;
}

.toggle__label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-ink);
}

.select {
  width: 100%;
  padding: 0.625rem 0.75rem;
  font-size: 0.875rem;
  color: var(--color-ink);
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.select:focus {
  outline: 2px solid var(--color-green-400);
  outline-offset: 1px;
}

/* The app already has a warning tone — the setup banner uses it a few pixels
   above this block. Tailwind's amber was a second one on the same screen. */
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
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
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

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  border: none;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.2s;
}

.btn--block {
  width: 100%;
}

.btn--primary {
  background: var(--color-green-600);
  color: var(--color-white);
}

.btn--primary:hover:not(:disabled) {
  background: var(--color-green-700);
}

.btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--notice {
  align-self: flex-start;
  background: var(--color-yellow-500);
  color: var(--color-white);
}

.btn--notice:hover {
  background: var(--color-yellow-600);
}
</style>
