<template>
  <div class="max-w-md mx-auto p-6 bg-white rounded-xl shadow space-y-4">
    <h2 class="text-xl font-semibold text-center">Apple Health</h2>

    <div class="text-center mt-4">
      <p
        class="inline-flex items-center gap-2 text-sm font-medium"
        :class="isConnected ? 'text-green-600' : 'text-gray-600'"
      >
        <i
          :class="isConnected ? 'fas fa-check-circle' : 'fas fa-heart-pulse'"
          aria-hidden="true"
        ></i>
        {{ isConnected ? 'Connecté à Apple Health' : 'Importer vos entrainements depuis Apple Health' }}
      </p>
    </div>

    <div class="flex flex-wrap justify-center gap-3 mt-6">
      <button
        v-if="!isConnected"
        @click="requestAccess"
        :disabled="isLoading"
        class="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white font-medium rounded-lg shadow-sm hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <i :class="isLoading ? 'fas fa-spinner fa-spin' : 'fas fa-plug'" aria-hidden="true"></i>
        {{ isLoading ? 'Connexion...' : 'Autoriser Apple Health' }}
      </button>

      <button
        v-if="isConnected"
        @click="importWorkouts"
        :disabled="isImporting"
        class="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white font-medium rounded-lg shadow-sm hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <i
          :class="isImporting ? 'fas fa-spinner fa-spin' : 'fas fa-download'"
          aria-hidden="true"
        ></i>
        {{ isImporting ? 'Import en cours...' : 'Importer les entrainements' }}
      </button>

      <button
        v-if="isConnected"
        @click="disconnect"
        class="inline-flex items-center gap-2 text-sm text-gray-600 font-medium hover:underline hover:text-gray-800 transition"
      >
        <i class="fas fa-unlink" aria-hidden="true"></i>
        Déconnecter
      </button>
    </div>

    <div v-if="importResult" class="text-center text-sm text-green-600 mt-4">
      <i class="fas fa-check-circle mr-1" aria-hidden="true"></i>
      {{ importResult }}
    </div>

    <div v-if="error" class="text-center text-sm text-red-600 mt-4">
      <i class="fas fa-exclamation-triangle mr-1" aria-hidden="true"></i>
      {{ error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { usePluginContext } from '@/composables/usePluginContext'

const { notifications } = usePluginContext()

const isConnected = ref(false)
const isLoading = ref(false)
const isImporting = ref(false)
const importResult = ref('')
const error = ref('')

async function requestAccess() {
  isLoading.value = true
  error.value = ''
  try {
    // TODO: Implement when Capacitor health plugin is selected
    // const { CapacitorHealth } = await import('@capawesome/capacitor-health')
    // await CapacitorHealth.requestAuthorization({ read: ['workouts', 'heartRate', 'route'] })
    // isConnected.value = true
    notifications.notify('HealthKit: plugin natif non encore configuré', { type: 'warning' })
  } catch (err: any) {
    error.value = err.message || "Erreur d'autorisation HealthKit"
  } finally {
    isLoading.value = false
  }
}

async function importWorkouts() {
  isImporting.value = true
  error.value = ''
  importResult.value = ''
  try {
    // TODO: Implement when Capacitor health plugin is selected
    // Fetch workouts, convert to Activity/ActivityDetails, save via ctx.activity
    notifications.notify('HealthKit: import non encore implémenté', { type: 'warning' })
  } catch (err: any) {
    error.value = err.message || "Erreur d'import"
  } finally {
    isImporting.value = false
  }
}

function disconnect() {
  isConnected.value = false
  importResult.value = ''
  error.value = ''
}

</script>
