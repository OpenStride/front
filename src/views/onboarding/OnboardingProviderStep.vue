<template>
  <div class="onboarding-step">
    <h2>Ajoutez une source de données</h2>
    <p class="desc">Pour commencer, ajoutez une source de données (Garmin, Coros, ZIP, etc.) pour importer vos activités.</p>
    <div class="actions">
      <button @click="addProvider">Ajouter un provider</button>
    </div>
    <div v-if="importSummary" class="import-summary">
      <p>Import terminé ! {{ importSummary.count }} activités récupérées.</p>
      <button @click="$emit('next')">Terminer</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
const importSummary = ref<{ count: number } | null>(null);
function addProvider() {
  // Ici, lance le flow d'ajout de provider (réutilise la vue existante si possible)
  // Simule un import
  importSummary.value = { count: 42 };
}
</script>

<style scoped>
.onboarding-step {
  text-align: center;
}
.desc {
  margin-bottom: 1.2rem;
  color: #555;
}
.actions {
  display: flex;
  gap: 1.2rem;
  justify-content: center;
  margin-bottom: 1.2rem;
}
.import-summary {
  margin-top: 1.2rem;
  background: #e6f7e6;
  border-radius: 8px;
  padding: 1rem;
}
</style>
