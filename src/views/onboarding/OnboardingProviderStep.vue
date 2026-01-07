<template>
  <div class="onboarding-provider-step">
    <h2 class="text-2xl font-bold mb-2 text-center">Ajoutez votre première source de données</h2>
    <p class="text-gray-600 mb-6 text-center">
      Choisissez comment importer vos activités sportives.
    </p>

    <!-- Liste de sélection (si aucun provider sélectionné) -->
    <div v-if="!selectedProviderId">
      <ul class="space-y-4">
        <li
          v-for="provider in allProviderPlugins"
          :key="provider.id"
          @click="selectProvider(provider.id)"
          class="flex items-center justify-between bg-gray-50 p-4 rounded border border-gray-200 hover:bg-white hover:shadow-md hover:border-green-600 transition-all cursor-pointer"
        >
          <div class="flex items-center space-x-4">
            <img v-if="provider.icon" :src="provider.icon" :alt="provider.label" class="w-8 h-8" />
            <i v-else class="fas fa-plug text-green-600 text-xl"></i>
            <div>
              <span class="font-semibold block">{{ provider.label }}</span>
              <p v-if="provider.description" class="text-sm text-gray-500">{{ provider.description }}</p>
            </div>
          </div>
          <button
            class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors"
          >
            Sélectionner
          </button>
        </li>
      </ul>
    </div>

    <!-- Setup component embarqué (si provider sélectionné) -->
    <div v-else class="provider-setup">
      <button
        @click="selectedProviderId = null"
        class="inline-flex items-center gap-2 mb-4 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
      >
        <i class="fas fa-arrow-left"></i> Choisir un autre fournisseur
      </button>

      <div class="bg-white p-6 rounded shadow">
        <component
          v-if="setupComponent"
          :is="setupComponent"
        />
      </div>
    </div>

    <!-- Message de détection d'activités -->
    <div v-if="hasActivities" class="mt-6 flex items-center gap-3 bg-green-50 border border-green-600 text-green-800 p-4 rounded">
      <i class="fas fa-check-circle text-2xl"></i>
      <p class="font-medium">Activités importées avec succès ! Passage à l'étape suivante...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, shallowRef, onMounted, onUnmounted } from 'vue';
import { allProviderPlugins } from '@/services/ProviderPluginRegistry';
import { DataProviderPluginManager } from '@/services/DataProviderPluginManager';
import { getActivityDBService } from '@/services/ActivityDBService';

const props = defineProps<{
  savedProviderId?: string | null
}>();

const emit = defineEmits<{
  providerSelected: [providerId: string]
  activitiesDetected: []
}>();

const manager = DataProviderPluginManager.getInstance();
const selectedProviderId = ref(props.savedProviderId || null);
const setupComponent = shallowRef<any>(null);
const hasActivities = ref(false);

// Charger setup component quand provider sélectionné
watch(selectedProviderId, async (id) => {
  if (id) {
    const plugin = allProviderPlugins.find(p => p.id === id);
    if (plugin) {
      setupComponent.value = await plugin.setupComponent();
      await manager.enablePlugin(id);
      emit('providerSelected', id);
    }
  } else {
    setupComponent.value = null;
  }
}, { immediate: true }); // ⬅️ Déclencher immédiatement si provider déjà sélectionné

// Poll pour détecter les activités importées
let pollInterval: NodeJS.Timeout | null = null;

onMounted(() => {
  if (selectedProviderId.value) {
    startPolling();
  }
});

onUnmounted(() => {
  stopPolling();
});

watch(selectedProviderId, (id) => {
  if (id) {
    startPolling();
  } else {
    stopPolling();
  }
});

function startPolling() {
  if (pollInterval) return;

  pollInterval = setInterval(async () => {
    const activityDb = await getActivityDBService();
    const activities = await activityDb.getActivities({ limit: 1, offset: 0 });

    if (activities.length > 0 && !hasActivities.value) {
      hasActivities.value = true;
      emit('activitiesDetected');
      stopPolling();
    }
  }, 2000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function selectProvider(id: string) {
  selectedProviderId.value = id;
}
</script>

