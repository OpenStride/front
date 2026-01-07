<template>
  <div class="onboarding-flow">
    <component :is="currentStepComponent" @next="goNext" @import-remote="onImportRemote" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import OnboardingStorageStep from './OnboardingStorageStep.vue';
import OnboardingProviderStep from './OnboardingProviderStep.vue';

const step = ref(0);
const steps = [OnboardingStorageStep, OnboardingProviderStep];
const currentStepComponent = computed(() => steps[step.value]);

function goNext(payload?: any) {
  step.value++;
}

function onImportRemote(data: any) {
  // Gérer l'import des données distantes ici
  goNext();
}
</script>

<style scoped>
.onboarding-flow {
  max-width: 480px;
  margin: 2rem auto;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  padding: 2rem 2.5rem;
}
</style>
