<template>
  <div class="profile-panel">
    <!-- No heading: a section title tells two sections apart, and this panel
         has one. The tab strip above already says "Preferences". -->
    <section>
      <div class="card">
        <LanguageSelector />

        <fieldset class="field units">
          <legend class="field-label">{{ t('profile.preferences.units') }}</legend>
          <div class="units__choices">
            <label class="choice">
              <input
                type="radio"
                v-model="preferences.units"
                value="metric"
                data-test="units-metric"
              />
              <span>{{ t('profile.preferences.metric') }}</span>
            </label>
            <label class="choice">
              <input
                type="radio"
                v-model="preferences.units"
                value="imperial"
                data-test="units-imperial"
              />
              <span>{{ t('profile.preferences.imperial') }}</span>
            </label>
          </div>
        </fieldset>

        <button @click="savePreferences" class="btn btn--primary btn--block">
          {{ t('common.save') }}
        </button>

        <p v-if="saveSuccess" class="saved" role="status">
          <i class="fas fa-check" aria-hidden="true"></i>
          {{ t('profile.preferences.saveSuccess') }}
        </p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { IndexedDBService } from '@/services/IndexedDBService'
import LanguageSelector from '@/components/LanguageSelector.vue'
import { setUnitSystem, unitSystem } from '@/composables/useUnits'

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
  // Stay in step with the shared source in case it loaded first.
  preferences.value.units = unitSystem.value
})

const savePreferences = async () => {
  if (!dbService) return

  await dbService.saveData('app_preferences', preferences.value)
  // Push into the shared reactive source so every mounted screen switches now,
  // rather than only the ones rendered after the next reload.
  setUnitSystem(preferences.value.units)

  saveSuccess.value = true
  setTimeout(() => {
    saveSuccess.value = false
  }, 3000)
}
</script>

<style scoped>
.units__choices {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.choice {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9375rem;
  color: var(--color-ink);
  cursor: pointer;
}

.choice input {
  accent-color: var(--color-green-600);
}

.saved {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-green-700);
}
</style>
