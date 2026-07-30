<template>
  <div class="landing">
    <!-- Hero -->
    <section class="hero">
      <p class="hero__eyebrow">{{ t('landing.hero.eyebrow') }}</p>
      <h1 class="hero__title">{{ t('landing.hero.title') }}</h1>
      <p class="hero__lead">{{ t('landing.hero.lead') }}</p>

      <div class="hero__actions">
        <RouterLink to="/onboarding" class="btn btn--primary" data-test="landing-cta">
          {{ t('landing.hero.cta') }}
        </RouterLink>
        <a
          class="btn btn--ghost"
          href="https://github.com/OpenStride/front"
          target="_blank"
          rel="noopener"
        >
          <i class="fab fa-github" aria-hidden="true"></i>
          {{ t('landing.hero.ctaCode') }}
        </a>
      </div>

      <p class="hero__note">
        <i class="fas fa-circle-check" aria-hidden="true"></i>
        {{ t('landing.hero.note') }}
      </p>
    </section>

    <!-- iOS installs before any plugin: this is the first screen it can ask on -->
    <InstallPrompt variant="gate" class="landing__install" />

    <!-- How it works -->
    <section class="section">
      <h2 class="section__title">{{ t('landing.how.title') }}</h2>
      <ol class="steps">
        <li v-for="step in steps" :key="step.key" class="step">
          <div class="step__icon"><i :class="step.icon" aria-hidden="true"></i></div>
          <div>
            <h3 class="step__title">{{ t(`landing.how.${step.key}.title`) }}</h3>
            <p class="step__text">{{ t(`landing.how.${step.key}.text`) }}</p>
          </div>
        </li>
      </ol>
    </section>

    <!-- Pillars -->
    <section class="section">
      <h2 class="section__title">{{ t('landing.why.title') }}</h2>
      <div class="pillars">
        <article v-for="pillar in pillars" :key="pillar.key" class="pillar">
          <i class="pillar__icon" :class="pillar.icon" aria-hidden="true"></i>
          <h3 class="pillar__title">{{ t(`landing.why.${pillar.key}.title`) }}</h3>
          <p class="pillar__text">{{ t(`landing.why.${pillar.key}.text`) }}</p>
        </article>
      </div>
    </section>

    <!-- Sources -->
    <section class="section">
      <h2 class="section__title">{{ t('landing.sources.title') }}</h2>
      <p class="section__lead">{{ t('landing.sources.lead') }}</p>
      <ul class="sources">
        <li v-for="source in sources" :key="source.key" class="source">
          <i :class="source.icon" aria-hidden="true"></i>
          <span class="source__name">{{ t(`landing.sources.${source.key}.name`) }}</span>
          <span class="source__how">{{ t(`landing.sources.${source.key}.how`) }}</span>
        </li>
      </ul>
    </section>

    <!-- Closing -->
    <section class="closing">
      <h2 class="closing__title">{{ t('landing.closing.title') }}</h2>
      <p class="closing__text">{{ t('landing.closing.text') }}</p>
      <RouterLink to="/onboarding" class="btn btn--primary">
        {{ t('landing.hero.cta') }}
      </RouterLink>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import InstallPrompt from '@/components/InstallPrompt.vue'

const { t } = useI18n()

// Keys drive the copy; the icons are the only thing the template decides.
const steps = [
  { key: 'connect', icon: 'fas fa-link' },
  { key: 'analyze', icon: 'fas fa-chart-line' },
  { key: 'own', icon: 'fas fa-lock' }
]

const pillars = [
  { key: 'privacy', icon: 'fas fa-shield-halved' },
  { key: 'openSource', icon: 'fas fa-code-branch' },
  { key: 'free', icon: 'fas fa-gift' },
  { key: 'extensible', icon: 'fas fa-puzzle-piece' }
]

// Only what actually works today. Coros is a ten-line stub and the zip provider
// is deprecated, so neither is promised here — and there is no standalone
// GPX import: those formats are read inside a Strava archive, nowhere else.
const sources = [
  { key: 'garmin', icon: 'fas fa-stopwatch' },
  { key: 'strava', icon: 'fas fa-file-zipper' }
]
</script>

<style scoped>
.landing {
  max-width: 720px;
  margin: 0 auto;
  padding: 0 1.25rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 3.5rem;
}

/* ===== Hero ===== */
.hero {
  padding: 3.5rem 0 0;
  text-align: center;
}

.hero__eyebrow {
  margin: 0 0 1rem;
  font-family: var(--font-condensed);
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-green-700);
}

.hero__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(2.1rem, 7vw, 3.1rem);
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.03em;
  color: var(--color-ink);
  text-wrap: balance;
}

.hero__lead {
  margin: 1.25rem auto 0;
  max-width: 34rem;
  font-size: 1.0625rem;
  line-height: 1.6;
  color: var(--text-muted);
  text-wrap: pretty;
}

.hero__actions {
  margin-top: 2rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: center;
}

.hero__note {
  margin: 1.25rem 0 0;
  font-size: 0.875rem;
  color: var(--text-faint);
}

.hero__note i {
  color: var(--color-green-500);
  margin-right: 0.4rem;
}

/* ===== Buttons ===== */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.875rem 1.75rem;
  border-radius: var(--radius-pill);
  font-size: 1rem;
  font-weight: 600;
  text-decoration: none;
  transition:
    background 0.2s,
    border-color 0.2s;
}

.btn--primary {
  background: var(--color-green-600);
  color: var(--color-white);
}

.btn--primary:hover {
  background: var(--color-green-700);
}

.btn--ghost {
  background: transparent;
  color: var(--color-ink);
  border: 1px solid var(--border-subtle);
}

.btn--ghost:hover {
  border-color: var(--color-ink-soft);
}

.landing__install {
  margin: 0;
}

/* ===== Sections ===== */
.section__title {
  margin: 0 0 1.5rem;
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--color-ink);
}

.section__lead {
  margin: -1rem 0 1.5rem;
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--text-muted);
}

/* ===== Steps ===== */
.steps {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.step {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.step__icon {
  flex-shrink: 0;
  width: 2.75rem;
  height: 2.75rem;
  display: grid;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--color-green-100);
  color: var(--color-green-700);
  font-size: 1.0625rem;
}

.step__title {
  margin: 0 0 0.3rem;
  font-family: var(--font-display);
  font-size: 1.0625rem;
  font-weight: 700;
  color: var(--color-ink);
}

.step__text {
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--text-muted);
}

/* ===== Pillars ===== */
.pillars {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.pillar {
  padding: 1.25rem;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--border-subtle);
}

.pillar__icon {
  font-size: 1.125rem;
  color: var(--color-green-600);
}

.pillar__title {
  margin: 0.75rem 0 0.35rem;
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-ink);
}

.pillar__text {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.55;
  color: var(--text-muted);
}

/* ===== Sources ===== */
.sources {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.source {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  border-radius: var(--radius-md);
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  font-size: 0.9375rem;
}

.source > i {
  color: var(--color-green-600);
  width: 1.25rem;
  text-align: center;
}

.source__name {
  font-weight: 600;
  color: var(--color-ink);
}

.source__how {
  margin-left: auto;
  font-size: 0.8125rem;
  color: var(--text-faint);
  text-align: right;
}

/* ===== Closing ===== */
.closing {
  padding: 2.5rem 1.5rem;
  border-radius: var(--radius-xl);
  background: var(--color-ink);
  text-align: center;
}

.closing__title {
  margin: 0 0 0.75rem;
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--color-white);
}

.closing__text {
  margin: 0 auto 1.75rem;
  max-width: 28rem;
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--color-gray-300);
}

.closing .btn--primary {
  background: var(--color-lime);
  color: var(--color-ink);
}

.closing .btn--primary:hover {
  background: var(--color-lime-soft);
}

@media (max-width: 480px) {
  .pillars {
    grid-template-columns: 1fr;
  }

  .source {
    flex-wrap: wrap;
  }

  .source__how {
    margin-left: 2rem;
    text-align: left;
    flex-basis: 100%;
  }
}
</style>
