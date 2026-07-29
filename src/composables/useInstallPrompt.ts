import { ref, onMounted, onUnmounted } from 'vue'
import {
  getInstallService,
  ANDROID_MIN_VISIT_DAYS,
  type InstallPlatform
} from '@/services/InstallService'
import { DataProviderPluginManager } from '@/services/DataProviderPluginManager'
import { StoragePluginManager } from '@/services/StoragePluginManager'
import { getActivityService } from '@/services/ActivityService'

/**
 * When to invite the user to install, which is not the same question on the two
 * platforms — and the asymmetry is forced by how they store data.
 *
 * **iOS**: a web app added to the home screen gets its own storage container.
 * Nothing is copied over from Safari, so an athlete who connects Garmin in the
 * browser and installs afterwards opens an empty app. The invitation therefore
 * has to come *before* any provider is connected, so every import lands in the
 * installed app from the start.
 *
 * **Android**: the installed app shares the browser's storage, so nothing is
 * lost by waiting. We wait for the habit to show instead — several distinct
 * days of use, and activities actually imported.
 */
export function useInstallPrompt() {
  const service = getInstallService()

  const platform = ref<InstallPlatform>(service.platform)
  const canPrompt = ref(service.canPrompt)

  /** iOS, before anything is connected: install first or lose the import. */
  const offerBeforePlugins = ref(false)
  /** Android, once the app has proven useful. */
  const offerAfterEngagement = ref(false)

  const refresh = async () => {
    platform.value = service.platform
    canPrompt.value = service.canPrompt

    offerBeforePlugins.value = false
    offerAfterEngagement.value = false

    if (!service.canInstall || !service.mayAsk) return

    if (platform.value === 'ios-safari') {
      const providers = await DataProviderPluginManager.getInstance().getEnabledPlugins()
      const storages = await StoragePluginManager.getInstance().getEnabledPlugins()
      offerBeforePlugins.value = providers.length === 0 && storages.length === 0
      return
    }

    if (platform.value === 'android-chromium') {
      if (service.visitDays < ANDROID_MIN_VISIT_DAYS) return
      const activities = await (await getActivityService()).getAllActivities()
      offerAfterEngagement.value = activities.some(a => !a.deleted)
    }
  }

  const onAvailabilityChanged = () => {
    void refresh()
  }

  onMounted(() => {
    service.emitter.addEventListener('availability-changed', onAvailabilityChanged)
    void refresh()
  })

  onUnmounted(() => {
    service.emitter.removeEventListener('availability-changed', onAvailabilityChanged)
  })

  return {
    platform,
    canPrompt,
    offerBeforePlugins,
    offerAfterEngagement,
    promptInstall: () => service.promptInstall(),
    dismiss: () => service.recordDismissal(),
    refresh
  }
}
