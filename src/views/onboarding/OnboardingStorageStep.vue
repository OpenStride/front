<template>
  <div class="onboarding-storage-step">
    <h2 class="text-2xl font-bold mb-2 text-center">{{ t('onboarding.storage.title') }}</h2>
    <p class="text-gray-600 mb-6 text-center leading-relaxed">
      <strong>{{ t('onboarding.storage.subtitle') }}</strong
      ><br />
      {{ t('onboarding.storage.subtitleExtended') }}
    </p>

    <!-- Bouton skip proéminent -->
    <div class="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
      <button
        @click="$emit('skip')"
        class="w-full bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
      >
        <i class="fas fa-forward"></i>
        {{ t('onboarding.storage.skipButton') }}
      </button>
      <p class="text-sm text-gray-500 mt-3 text-center">
        {{ t('onboarding.storage.skipHint') }}
      </p>
    </div>

    <div class="relative text-center text-gray-400 text-sm font-medium my-6">
      <span class="bg-white px-4 relative z-10">{{ t('common.or') }}</span>
      <div class="absolute top-1/2 left-0 right-0 h-px bg-gray-200 -z-0"></div>
    </div>

    <!-- Liste de sélection storage -->
    <div v-if="!selectedStorageId">
      <ul class="space-y-4">
        <li
          v-for="storage in allStoragePlugins"
          :key="storage.id"
          @click="selectStorage(storage.id)"
          class="flex items-center justify-between bg-gray-50 p-4 rounded border border-gray-200 hover:bg-white hover:shadow-md hover:border-green-600 transition-all cursor-pointer"
        >
          <div class="flex items-center space-x-4">
            <img v-if="storage.icon" :src="storage.icon" :alt="storage.label" class="w-8 h-8" />
            <i v-else class="fas fa-cloud text-green-600 text-xl"></i>
            <div>
              <span class="font-semibold block">{{ storage.label }}</span>
              <p v-if="storage.description" class="text-sm text-gray-500">
                {{ storage.description }}
              </p>
            </div>
          </div>
          <button
            class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors"
          >
            {{ t('common.select') }}
          </button>
        </li>
      </ul>
    </div>

    <!-- Setup component embarqué -->
    <div v-else class="storage-setup">
      <button
        @click="selectedStorageId = null"
        class="inline-flex items-center gap-2 mb-4 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
      >
        <i class="fas fa-arrow-left"></i> {{ t('onboarding.storage.backButton') }}
      </button>

      <div class="bg-white p-6 rounded shadow">
        <component v-if="setupComponent" :is="setupComponent" />
      </div>

      <button
        v-if="isConnected"
        @click="$emit('next')"
        class="mt-6 w-full bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
      >
        {{ t('common.continue') }} <i class="fas fa-arrow-right"></i>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, shallowRef, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { allStoragePlugins } from '@/services/StoragePluginRegistry'
import { StoragePluginManager } from '@/services/StoragePluginManager'
import { IndexedDBService } from '@/services/IndexedDBService'

const { t } = useI18n()

const props = defineProps<{
  savedStorageId?: string | null
}>()

const emit = defineEmits<{
  next: []
  skip: []
  storageSelected: [storageId: string]
}>()

const manager = StoragePluginManager.getInstance()
const selectedStorageId = ref(props.savedStorageId || null)
const setupComponent = shallowRef<any>(null)
const isConnected = ref(false)

// Charger setup component quand storage sélectionné
watch(selectedStorageId, async id => {
  if (id) {
    const plugin = allStoragePlugins.find(p => p.id === id)
    if (plugin) {
      setupComponent.value = await plugin.setupComponent()
      await manager.enablePlugin(id)
      emit('storageSelected', id)

      // Vérifier si déjà connecté (tokens existants)
      const db = await IndexedDBService.getInstance()
      const token = await db.getData('gdrive_access_token')
      if (token) {
        isConnected.value = true
      }
    }
  } else {
    setupComponent.value = null
    isConnected.value = false
  }
})

// Polling pour détecter connexion après OAuth
let checkInterval: NodeJS.Timeout | null = null

onMounted(() => {
  if (selectedStorageId.value) {
    startConnectionPolling()
  }
})

onUnmounted(() => {
  stopConnectionPolling()
})

watch(selectedStorageId, id => {
  if (id && !isConnected.value) {
    startConnectionPolling()
  } else if (!id) {
    stopConnectionPolling()
  }
})

function startConnectionPolling() {
  if (checkInterval) return

  checkInterval = setInterval(async () => {
    const db = await IndexedDBService.getInstance()
    const token = await db.getData('gdrive_access_token')
    if (token) {
      isConnected.value = true
      stopConnectionPolling()
    }
  }, 1000)
}

function stopConnectionPolling() {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
}

function selectStorage(id: string) {
  selectedStorageId.value = id
}
</script>
