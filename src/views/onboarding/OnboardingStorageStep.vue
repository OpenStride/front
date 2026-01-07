<template>
  <div class="onboarding-step">
    <h2>Choisissez votre stockage</h2>
    <p class="desc">Par défaut, vos données seront stockées localement sur cet appareil.<br>
      <strong>Si vous souhaitez synchroniser et sauvegarder vos activités, ajoutez un stockage en ligne.</strong>
    </p>
    <div class="actions">
      <button @click="$emit('next')">Continuer en local</button>
      <button @click="addStorage">Ajouter un stockage en ligne</button>
    </div>
    <div v-if="showRemoteFound" class="import-remote">
      <p>Un compte distant a été trouvé. Voulez-vous importer vos données ?</p>
      <button @click="$emit('import-remote', remoteData)">Importer mes données</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
// Simule la détection d'un compte distant
const showRemoteFound = ref(false);
const remoteData = ref(null);
function addStorage() {
  // Ici, lance le flow d'ajout de provider (réutilise la vue existante si possible)
  // Si un compte est trouvé, affiche l'import
  showRemoteFound.value = true;
  remoteData.value = { activities: [], preferences: {} };
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
.import-remote {
  margin-top: 1.2rem;
  background: #f4f4f4;
  border-radius: 8px;
  padding: 1rem;
}
</style>
