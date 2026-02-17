<template>
  <router-link to="/statistics" @click="$emit('navigate')">{{
    t('navigation.statistics')
  }}</router-link>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineEmits<{
  navigate: []
}>()
</script>
