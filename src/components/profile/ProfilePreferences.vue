<template>
  <div class="space-y-6">
    <h2 class="text-2xl font-bold">{{ t('profile.preferences.title') }}</h2>

    <div class="bg-white shadow rounded-xl p-6 space-y-4">
      <!-- Language Selector -->
      <div>
        <LanguageSelector />
      </div>

      <!-- Unit System -->
      <!-- <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">
          {{ t('profile.preferences.units') }}
        </label>
        <div class="flex gap-4">
          <label class="flex items-center cursor-pointer">
            <input
              type="radio"
              v-model="preferences.units"
              value="metric"
              class="mr-2 text-green-600 focus:ring-green-500"
            />
            <span>{{ t('profile.preferences.metric') }}</span>
          </label>
          <label class="flex items-center cursor-pointer">
            <input
              type="radio"
              v-model="preferences.units"
              value="imperial"
              class="mr-2 text-green-600 focus:ring-green-500"
            />
            <span>{{ t('profile.preferences.imperial') }}</span>
          </label>
        </div>
      </div> -->

      <!-- Theme -->
      <!-- <div>
        <label for="theme" class="block text-sm font-medium text-gray-700 mb-2">
          {{ t('profile.preferences.theme') }}
        </label>
        <select
          id="theme"
          v-model="preferences.theme"
          class="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring focus:border-green-300"
        >
          <option value="light">{{ t('profile.preferences.themeLight') }}</option>
          <option value="dark">{{ t('profile.preferences.themeDark') }}</option>
          <option value="auto">{{ t('profile.preferences.themeAuto') }}</option>
        </select>
      </div> -->

      <!-- Date Format -->
      <!-- <div>
        <label for="dateFormat" class="block text-sm font-medium text-gray-700 mb-2">
          {{ t('profile.preferences.dateFormat') }}
        </label>
        <select
          id="dateFormat"
          v-model="preferences.dateFormat"
          class="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring focus:border-green-300"
        >
          <option value="DD/MM/YYYY">DD/MM/YYYY</option>
          <option value="MM/DD/YYYY">MM/DD/YYYY</option>
          <option value="YYYY-MM-DD">YYYY-MM-DD</option>
        </select>
      </div> -->

      <button
        @click="savePreferences"
        class="w-full bg-green-600 text-white py-2 rounded-md hover:bg-green-700"
      >
        {{ t('common.save') }}
      </button>

      <div v-if="saveSuccess" class="text-green-600 text-sm text-center">
        {{ t('profile.preferences.saveSuccess') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { IndexedDBService } from '@/services/IndexedDBService'
import LanguageSelector from '@/components/LanguageSelector.vue'

const { t } = useI18n()

interface AppPreferences {
  units: 'metric' | 'imperial'
  theme: 'light' | 'dark' | 'auto'
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
}

const preferences = ref<AppPreferences>({
  units: 'metric',
  theme: 'auto',
  dateFormat: 'DD/MM/YYYY'
})

const saveSuccess = ref(false)
let dbService: IndexedDBService | null = null

onMounted(async () => {
  dbService = await IndexedDBService.getInstance()
  const savedPrefs = await dbService.getData('app_preferences')
  if (savedPrefs) {
    preferences.value = savedPrefs as AppPreferences
  }
})

const savePreferences = async () => {
  if (!dbService) return

  await dbService.saveData('app_preferences', preferences.value)

  saveSuccess.value = true
  setTimeout(() => {
    saveSuccess.value = false
  }, 3000)
}
</script>
