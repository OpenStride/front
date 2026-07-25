<template>
  <router-link to="/metrics" @click="$emit('navigate')">{{
    t('navigation.metricTracker')
  }}</router-link>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineEmits<{
  navigate: []
}>()
</script>
