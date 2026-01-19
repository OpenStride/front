<template>
  <div class="language-selector">
    <label for="language-select" class="text-sm font-medium text-gray-700">
      {{ t('languages.label') }}
    </label>
    <select
      id="language-select"
      v-model="currentLocale"
      @change="onLocaleChange"
      class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 text-sm"
      :aria-label="t('languages.label')"
    >
      <option value="en">{{ t('languages.en') }}</option>
      <option value="fr">{{ t('languages.fr') }}</option>
    </select>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { changeLocale, type Locale } from '@/locales'

const { locale, t } = useI18n()

const currentLocale = ref<Locale>(locale.value as Locale)

watch(locale, (newLocale) => {
  currentLocale.value = newLocale as Locale
})

async function onLocaleChange() {
  await changeLocale(currentLocale.value)
}
</script>

<style scoped>
.language-selector {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

select {
  cursor: pointer;
  background-color: white;
}

select:hover {
  border-color: #9ca3af;
}
</style>
