<template>
  <div class="home-container">
    <section class="hero">
      <img src="@/assets/images/hero-image.png" alt="OpenStride Hero" class="hero-image" />
      <div class="hero-text">
        <h1>{{ t('home.hero.title') }}</h1>
        <p>{{ t('home.hero.subtitle') }}</p>
        <button class="cta-button" @click="navigateToOnboarding">{{ t('home.hero.cta') }}</button>
      </div>
    </section>

    <section class="features">
      <div class="feature"><i class="fas fa-lock"></i><h3>{{ t('home.features.privacy.title') }}</h3><p>{{ t('home.features.privacy.description') }}</p></div>
      <div class="feature"><i class="fas fa-code-branch"></i><h3>{{ t('home.features.openSource.title') }}</h3><p>{{ t('home.features.openSource.description') }}</p></div>
      <div class="feature"><i class="fas fa-coins"></i><h3>{{ t('home.features.free.title') }}</h3><p>{{ t('home.features.free.description') }}</p></div>
      <div class="feature"><i class="fas fa-cogs"></i><h3>{{ t('home.features.customizable.title') }}</h3><p>{{ t('home.features.customizable.description') }}</p></div>
    </section>

    <section class="quick-access">
      <div class="step">
        <h3>{{ t('home.quickAccess.step1.title') }}</h3>
        <p>{{ t('home.quickAccess.step1.description') }}</p>
        <button @click="navigateToDataProviders">{{ t('home.quickAccess.step1.button') }}</button>
      </div>
      <div class="step">
        <h3>{{ t('home.quickAccess.step2.title') }}</h3>
        <p>{{ t('home.quickAccess.step2.description') }}</p>
        <button @click="navigateToBackupProviders">{{ t('home.quickAccess.step2.button') }}</button>
      </div>
    </section>

  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

const router = useRouter();
const { t } = useI18n();

const navigateToDataProviders = () => {
  router.push('/data-providers');
};

const navigateToBackupProviders = () => {
  router.push('/backup-providers');
};

const navigateToOnboarding = () => {
  router.push('/onboarding');
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
  background-color: #88aa00;
  color: white;
  border: none;
  padding: 0.8rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}
.cta-button:hover {
  background-color: #6d8800;
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
.quick-access {
  margin-top: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: center;
}
.step {
  background-color: #f4f4f4;
  padding: 1rem;
  border-radius: 8px;
  text-align: left;
  max-width: 600px;
  width: 100%;
}
.step h3 {
  margin-bottom: 0.5rem;
}
.step button {
  background-color: #88aa00;
  color: white;
  border: none;
  padding: 0.6rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}
.step button:hover {
  background-color: #6d8800;
}
</style>
