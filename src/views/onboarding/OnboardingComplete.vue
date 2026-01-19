<template>
  <div class="onboarding-complete text-center py-8">
    <div class="text-green-600 text-6xl mb-6">
      <i class="fas fa-check-circle"></i>
    </div>

    <h2 class="text-3xl font-bold mb-3">Félicitations !</h2>
    <p class="text-gray-600 text-lg mb-8">Votre compte OpenStride est configuré.</p>

    <div class="bg-gray-50 rounded-lg p-6 mb-8 max-w-md mx-auto">
      <div class="flex items-center justify-center gap-3 mb-4">
        <i class="fas fa-database text-green-600 text-2xl"></i>
        <span class="text-lg font-medium">{{ activitiesCount }} activité(s) importée(s)</span>
      </div>

      <div class="flex items-center justify-center gap-3">
        <i :class="hasStorage ? 'fas fa-cloud-check text-green-600' : 'fas fa-hdd text-gray-400'" class="text-2xl"></i>
        <span class="text-lg">
          {{ hasStorage
            ? `Synchronisation avec ${storageName}`
            : 'Stockage local uniquement'
          }}
        </span>
      </div>
    </div>

    <button
      @click="$emit('complete')"
      class="bg-green-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-green-700 transition-colors inline-flex items-center gap-3 mb-6"
    >
      <i class="fas fa-running"></i>
      Voir mes activités
    </button>

    <p class="text-sm text-gray-500 max-w-md mx-auto">
      Vous pourrez toujours ajouter d'autres sources ou modifier vos paramètres plus tard dans les Réglages.
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getActivityDBService } from '@/services/ActivityDBService'
import { allStoragePlugins } from '@/services/StoragePluginRegistry'

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

