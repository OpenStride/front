<template>
  <div class="onboarding-flow">
    <component
      :is="currentStepComponent"
      :saved-provider-id="onboardingState.selectedProviderId"
      :saved-storage-id="onboardingState.selectedStorageId"
      :storage-id="onboardingState.selectedStorageId"
      @next="goNext"
      @skip="goNext"
      @provider-selected="onProviderSelected"
      @storage-selected="onStorageSelected"
      @complete="completeOnboarding"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { IndexedDBService } from '@/services/IndexedDBService';
import { getActivityDBService } from '@/services/ActivityDBService';
import OnboardingProviderStep from './OnboardingProviderStep.vue';
import OnboardingStorageStep from './OnboardingStorageStep.vue';
import OnboardingComplete from './OnboardingComplete.vue';

const router = useRouter();

// État persistent dans IndexedDB
const onboardingState = ref({
  completed: false,
  currentStep: 0,  // 0=provider, 1=storage, 2=completion
  selectedProviderId: null as string | null,
  selectedStorageId: null as string | null,
  hasImportedActivities: false,
  startedAt: Date.now(),
  completedAt: null as number | null
});

const currentStep = ref(0);

// Composants des étapes (ordre corrigé: provider → storage → complete)
const steps = [
  OnboardingProviderStep,  // Étape 0
  OnboardingStorageStep,   // Étape 1
  OnboardingComplete       // Étape 2
];

const currentStepComponent = computed(() => steps[currentStep.value]);

// Charger état au mount (survit aux OAuth redirects)
onMounted(async () => {
  const db = await IndexedDBService.getInstance();
  const saved = await db.getData('onboarding_state');

  if (saved && !saved.completed) {
    onboardingState.value = saved;
    currentStep.value = saved.currentStep;
  } else if (!saved) {
    // Initialiser l'état pour un nouvel utilisateur
    await saveState();
  }

  // Démarrer le polling pour détecter l'import d'activités
  startActivityPolling();
});

// Cleanup au démontage
onUnmounted(() => {
  stopActivityPolling();
});

// Sauvegarder état à chaque changement
async function saveState() {
  const db = await IndexedDBService.getInstance();
  // Convertir l'objet réactif en objet plain pour IndexedDB
  const plainState = JSON.parse(JSON.stringify(onboardingState.value));
  await db.saveData('onboarding_state', plainState);
}

// Polling pour détecter import d'activités
let activityCheckInterval: NodeJS.Timeout | null = null;

function startActivityPolling() {
  if (activityCheckInterval) return;

  activityCheckInterval = setInterval(async () => {
    if (currentStep.value === 0 && !onboardingState.value.hasImportedActivities) {
      const activityDb = await getActivityDBService();
      const activities = await activityDb.getActivities({ limit: 1, offset: 0 });

      if (activities.length > 0) {
        onboardingState.value.hasImportedActivities = true;
        await saveState();

        // Avancer automatiquement après 2 secondes
        setTimeout(() => {
          goNext();
        }, 2000);

        stopActivityPolling();
      }
    }
  }, 2000);
}

function stopActivityPolling() {
  if (activityCheckInterval) {
    clearInterval(activityCheckInterval);
    activityCheckInterval = null;
  }
}

// Navigation avec sauvegarde d'état
async function goNext() {
  currentStep.value++;
  onboardingState.value.currentStep = currentStep.value;
  await saveState();
}

// Handler: provider sélectionné
async function onProviderSelected(providerId: string) {
  onboardingState.value.selectedProviderId = providerId;
  await saveState();
}

// Handler: storage sélectionné
async function onStorageSelected(storageId: string) {
  onboardingState.value.selectedStorageId = storageId;
  await saveState();
}

// Complétion de l'onboarding
async function completeOnboarding() {
  onboardingState.value.completed = true;
  onboardingState.value.completedAt = Date.now();
  await saveState();

  stopActivityPolling();

  router.push('/my-activities');
}
</script>

<style scoped>
.onboarding-flow {
  max-width: 48rem;
  margin: 2rem auto;
  padding: 2rem 1rem;
}

@media (min-width: 768px) {
  .onboarding-flow {
    padding: 2.5rem;
  }
}
</style>
