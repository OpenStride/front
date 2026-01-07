<template>
  <div>
    <DefaultProviderSetupView
      provider-name="Garmin"
      :is-connected="isConnected"
      @connect="connectToGarmin"
      @disconnect="disconnectGarmin"
    />

    <div v-if="isConnected" class="mt-6 text-center space-y-4">
      <button
        @click="fetchActivities(7)"
        :disabled="isLoading"
        :class="[
          'inline-flex items-center gap-2 px-5 py-2.5 font-medium rounded-lg shadow-sm transition',
          isLoading
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-green-600 text-white hover:bg-green-700'
        ]"
      >
        <i class="fas fa-sync-alt" :class="{ 'fa-spin': isLoading }"></i>
        Fetch Past Activities
      </button>

      <div class="flex justify-center items-center gap-4 mt-4">
        <select
          v-model.number="selectedRange"
          :disabled="isLoading"
          class="border rounded px-3 py-2 text-sm"
        >
          <option :value="30">Dernier mois</option>
          <option :value="60">3 derniers mois</option>
          <option :value="365">Année dernière</option>
        </select>
        <button
          @click="fetchActivities(selectedRange)"
          :disabled="isLoading"
          :class="[
            'inline-flex items-center gap-2 px-4 py-2 text-sm rounded transition',
            isLoading
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          ]"
        >
          <i class="fas fa-download" :class="{ 'fa-spin': isLoading }"></i>
          Importer période
        </button>
      </div>

      <!-- Barre de progression dynamique -->
      <div v-if="isLoading" class="h-2 mt-2 bg-gray-200 rounded overflow-hidden">
        <div
          class="h-full bg-green-600 rounded transition-all"
          :style="{ width: progressPercent + '%' }"
        ></div>
      </div>

      <p class="text-sm text-gray-600">{{ fetchStatus }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import DefaultProviderSetupView from '@/components/providers/DefaultProviderSetup.vue'
import { IndexedDBService } from '@/services/IndexedDBService'
import { GarminRefresh } from './GarminService'
import pluginEnv from './env'

const isConnected     = ref(false)
const isLoading       = ref(false)
const fetchStatus     = ref('')
const progressPercent = ref(0)
const selectedRange   = ref<number>(30)

let dbService: IndexedDBService
const baseURL = pluginEnv.apiUrl

function connectToGarmin() {
  const redirect = encodeURIComponent(window.location.href)
  window.location.href = `${baseURL}/auth/login?redirect_uri=${redirect}`
}

async function disconnectGarmin() {
  await dbService.deleteData('garmin_token')
  await dbService.deleteData('garmin_token_secret')
  isConnected.value = false
}

async function fetchActivities(days: number) {
  if (!dbService) return
  isLoading.value = true
  progressPercent.value = 0
  fetchStatus.value = 'Chargement des activités...'

  try {
    // On suppose maintenant que GarminRefresh appelle callback(percent: number, msg: string)
    await GarminRefresh(days, (percent: number, msg: string) => {
      progressPercent.value = percent
      fetchStatus.value = msg
    })
    fetchStatus.value ||= `✅ Activités récupérées sur ${days} jours.`
    progressPercent.value = 100
  } catch (err: any) {
    console.error(err)
    fetchStatus.value = `❌ Échec : ${err.message || 'erreur inconnue'}.`
  } finally {
    // petite pause pour laisser la barre finir
    setTimeout(() => {
      isLoading.value = false
      progressPercent.value = 0
    }, 300)
  }
}

onMounted(async () => {
  dbService = await IndexedDBService.getInstance()
  const params = new URLSearchParams(window.location.search)
  const token  = params.get('access_token')
  const secret = params.get('access_token_secret')

  if (token && secret) {
    await dbService.saveData('garmin_token', token)
    await dbService.saveData('garmin_token_secret', secret)
    isConnected.value = true
  } else {
    const savedToken  = await dbService.getData('garmin_token')
    const savedSecret = await dbService.getData('garmin_token_secret')
    if (savedToken && savedSecret) {
      isConnected.value = true
    }
  }
})
</script>
