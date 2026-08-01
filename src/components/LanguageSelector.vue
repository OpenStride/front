<template>
  <!-- `field` and the input styling come from profile.css, where this renders. -->
  <div class="language-selector field">
    <label for="language-select">{{ t('languages.label') }}</label>
    <select
      id="language-select"
      v-model="currentLocale"
      @change="onLocaleChange"
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

watch(locale, newLocale => {
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
  background-color: var(--color-white);
}

select:hover {
  border-color: var(--color-gray-400);
}
</style>
