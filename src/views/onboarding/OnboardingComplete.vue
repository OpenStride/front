<template>
  <div class="onboarding-complete text-center py-8">
    <div class="text-green-600 text-6xl mb-6">
      <i class="fas fa-check-circle"></i>
    </div>

    <h2 class="text-3xl font-bold mb-3">{{ t('onboarding.complete.title') }}</h2>
    <p class="text-gray-600 text-lg mb-8">{{ t('onboarding.complete.subtitle') }}</p>

    <div class="bg-gray-50 rounded-lg p-6 mb-8 max-w-md mx-auto">
      <div class="flex items-center justify-center gap-3 mb-4">
        <i class="fas fa-database text-green-600 text-2xl"></i>
        <span class="text-lg font-medium">{{ t('onboarding.complete.activitiesImported', { count: activitiesCount }) }}</span>
      </div>

      <div class="flex items-center justify-center gap-3">
        <i :class="hasStorage ? 'fas fa-cloud-check text-green-600' : 'fas fa-hdd text-gray-400'" class="text-2xl"></i>
        <span class="text-lg">
          {{ hasStorage
            ? t('onboarding.complete.syncWith', { name: storageName })
            : t('onboarding.complete.localOnly')
          }}
        </span>
      </div>
    </div>

    <button
      @click="$emit('complete')"
      class="bg-green-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-green-700 transition-colors inline-flex items-center gap-3 mb-6"
    >
      <i class="fas fa-running"></i>
      {{ t('onboarding.complete.viewActivities') }}
    </button>

    <p class="text-sm text-gray-500 max-w-md mx-auto">
      {{ t('onboarding.complete.hint') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { getActivityDBService } from '@/services/ActivityDBService'
import { allStoragePlugins } from '@/services/StoragePluginRegistry'

const { t } = useI18n()

const props = defineProps<{
  storageId?: string | null
}>()

defineEmits<{
  complete: []
}>()

const activitiesCount = ref(0)
const hasStorage = ref(false)
const storageName = ref('')

onMounted(async () => {
  const activityDb = await getActivityDBService()
  const activities = await activityDb.getActivities({ limit: 100, offset: 0 })
  activitiesCount.value = activities.length

  if (props.storageId) {
    hasStorage.value = true
    const storage = allStoragePlugins.find(s => s.id === props.storageId)
    storageName.value = storage?.label || 'Cloud'
  }
})
</script>

