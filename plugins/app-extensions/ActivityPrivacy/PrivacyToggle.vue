<template>
  <!-- One line, not a card: whether friends see this outing is a setting of
       it, not news about it. The switch says the state; the label says it in words. -->
  <div v-if="props.data?.activity?.id" class="pt" data-test="privacy-toggle">
    <i :class="['fas', isPublic ? 'fa-user-group' : 'fa-lock', 'pt__icon']" aria-hidden="true"></i>
    <span class="pt__label">{{ isPublic ? t('privacy.isPublic') : t('privacy.isPrivate') }}</span>
    <button
      type="button"
      role="switch"
      :aria-checked="isPublic"
      :aria-label="t('privacy.title')"
      :class="['pt__switch', { 'is-on': isPublic }]"
      :disabled="saving"
      data-test="privacy-switch"
      @click="togglePrivacy"
    >
      <span class="pt__knob"></span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref, onMounted, computed } from 'vue'
import { usePluginContext } from '@/composables/usePluginContext'
import type { Activity, ActivityDetails } from '@/types/activity'

const { t } = useI18n()

const props = defineProps<{
  data: { activity: Activity; details: ActivityDetails }
}>()

const { storage, notifications, friends } = usePluginContext()

const activity = computed(() => props.data?.activity)

const defaultPrivacy = ref<'public' | 'private'>('private')
const activityPrivacy = ref<'public' | 'private' | null>(null)
const saving = ref(false)

const isPublic = computed(() => {
  if (activityPrivacy.value !== null) {
    return activityPrivacy.value === 'public'
  }
  return defaultPrivacy.value === 'public'
})

// Friend events are surfaced app-wide by `useFriendEventToasts` in the layout.
// This component used to keep its own listener, reading a `message` field that
// had been removed from the event in favour of `messageKey` — so the condition
// guarding it was never true and the toast never fired. A duplicate that did
// nothing; the layout already does it, and does it through the locale.
onMounted(async () => {
  await loadPrivacySettings()
})

const loadPrivacySettings = async () => {
  if (!activity.value || !activity.value.id) {
    console.warn('[PrivacyToggle] Cannot load privacy settings: activity is undefined')
    return
  }

  // Load default privacy
  const defaultSetting = await storage.getData('defaultPrivacy')
  defaultPrivacy.value = (defaultSetting as string as 'public' | 'private') || 'private'

  // Load activity-specific override
  const override = await storage.getData(`activityPrivacy_${activity.value.id}`)
  if (override !== null && override !== undefined) {
    activityPrivacy.value = override === true || override === 'public' ? 'public' : 'private'
  }
}

const togglePrivacy = async () => {
  if (!activity.value || !activity.value.id) {
    console.warn('[PrivacyToggle] Cannot toggle privacy: activity is undefined')
    return
  }

  saving.value = true
  try {
    const newValue = !isPublic.value

    // Save override
    await storage.saveData(`activityPrivacy_${activity.value.id}`, newValue ? 'public' : 'private')
    activityPrivacy.value = newValue ? 'public' : 'private'

    notifications.notify(t(newValue ? 'privacy.nowPublic' : 'privacy.nowPrivate'), {
      type: 'success',
      timeout: 2000
    })

    // Trigger re-publication in background
    republishInBackground()
  } catch (error) {
    console.error('[PrivacyToggle] Error toggling privacy:', error)
    notifications.notify(t('privacy.toggleFailed'), { type: 'error', timeout: 3000 })
  } finally {
    saving.value = false
  }
}

const republishInBackground = () => {
  // Non-blocking re-publication
  setTimeout(async () => {
    try {
      await friends.publishPublicData()
    } catch (error) {
      console.error('[PrivacyToggle] Background republish failed:', error)
    }
  }, 500)
}
</script>

<style scoped>
.pt {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.75rem;
  padding: 0 1rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.pt__icon {
  width: 1rem;
  color: var(--text-faint);
}

.pt__label {
  flex: 1;
}

/* A control's radius (`--radius-sm`), like the other toggles of the app. */
.pt__switch {
  position: relative;
  width: 2.25rem;
  height: 1.25rem;
  /* The 44 px target comes from the row; the switch itself stays small */
  margin: 0.75rem 0;
  padding: 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  cursor: pointer;
  transition: background 0.15s ease;
}

.pt__switch.is-on {
  background: var(--color-green-600);
  border-color: var(--color-green-600);
}

.pt__switch:disabled {
  opacity: 0.6;
  cursor: default;
}

.pt__knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: calc(1.25rem - 6px);
  height: calc(1.25rem - 6px);
  border-radius: var(--radius-sm);
  background: var(--surface);
  box-shadow: var(--shadow-card);
  transition: transform 0.15s ease;
}

.pt__switch.is-on .pt__knob {
  transform: translateX(1rem);
}

.pt__switch:focus-visible {
  outline: 2px solid var(--color-green-500);
  outline-offset: 2px;
}
</style>
