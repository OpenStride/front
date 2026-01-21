<template>
  <div class="home-container">
    <section class="hero">
      <img src="@/assets/images/hero-image.png" alt="OpenStride Hero" class="hero-image" />
      <div class="hero-text">
        <h1>Explorez. Contrôlez. Partagez.</h1>
        <p>Votre compagnon d'activités qui respecte votre vie privée. Open-source, gratuit et entièrement transparent.</p>
        <button class="cta-button" @click="navigateToOnboarding">Commencer maintenant</button>
      </div>
    </section>

    <section class="features">
      <div class="feature">
        <i class="fas fa-lock"></i>
        <h3>Respect de votre vie privée</h3>
        <p>Vos données restent vos données.</p>
      </div>
      <div class="feature">
        <i class="fas fa-code-branch"></i>
        <h3>Open-source</h3>
        <p>Transparent et évolutif par tous.</p>
      </div>
      <div class="feature">
        <i class="fas fa-coins"></i>
        <h3>Gratuit</h3>
        <p>Aucun frais caché, pour toujours.</p>
      </div>
      <div class="feature">
        <i class="fas fa-cogs"></i>
        <h3>Personnalisable</h3>
        <p>Choisissez vos fournisseurs de données.</p>
      </div>
    </section>

    <section class="quick-access">
      <div class="step">
        <h3>1️⃣ Connectez un fournisseur de données</h3>
        <p>Pour pouvoir voir vos premières activités, connectez un fournisseur de données (Garmin, Coros, Suunto etc.).</p>
        <button @click="navigateToDataProviders">Configurer les fournisseurs de données</button>
      </div>
      <div class="step">
        <h3>2️⃣ Configurez la sauvegarde</h3>
        <p>Pour sécuriser vos données, choisissez un fournisseur de sauvegarde (Google Drive, Dropbox, etc.).</p>
        <button @click="navigateToBackupProviders">Configurer la sauvegarde</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

const navigateToDataProviders = () => {
  router.push('/data-providers');
};

const navigateToBackupProviders = () => {
  router.push('/storage-providers');
};

const navigateToOnboarding = () => {
  router.push('/data-providers');
};
</script>

<style scoped>
.home-container {
  padding: 2rem;
  max-width: 900px;
  margin: auto;
  text-align: center;
}

.hero {
  position: relative;
  text-align: center;
  color: white;
}

.hero-image {
  width: 100%;
  height: 400px;
  object-fit: cover;
  border-radius: 12px;
}

.hero-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.6);
  padding: 1rem 2rem;
  border-radius: 8px;
}

.cta-button {
  background-color: var(--color-green-500);
  color: white;
  border: none;
  padding: 0.8rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

.cta-button:hover {
  background-color: var(--color-green-600);
}

.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-top: 2rem;
}

.feature {
  background-color: #f4f4f4;
  padding: 1rem;
  border-radius: 8px;
}

.feature i {
  font-size: 2rem;
  color: var(--color-green-500);
  margin-bottom: 0.5rem;
}

.quick-access {
  margin-top: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.step {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.step h3 {
  margin: 0 0 0.5rem;
  color: #333;
}

.step p {
  color: #666;
  margin-bottom: 1rem;
}

.step button {
  background-color: var(--color-green-500);
  color: white;
  border: none;
  padding: 0.8rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

.step button:hover {
  background-color: var(--color-green-600);
}

@media (max-width: 640px) {
  .home-container {
    padding: 1rem;
  }

  .hero-image {
    height: 250px;
  }

  .hero-text h1 {
    font-size: 1.5rem;
  }

  .hero-text p {
    font-size: 0.875rem;
  }
}
</style>
