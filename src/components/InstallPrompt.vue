<template>
  <section v-if="visible" class="iprompt" :class="`iprompt--${variant}`" data-test="install-prompt">
    <button
      v-if="variant === 'banner'"
      class="iprompt__close"
      :title="t('common.cancel')"
      data-test="install-dismiss"
      @click="onDismiss"
    >
      <i class="fas fa-xmark" aria-hidden="true"></i>
    </button>

    <div class="iprompt__head">
      <div class="iprompt__badge">
        <i class="fas fa-mobile-screen-button" aria-hidden="true"></i>
      </div>
      <div>
        <h3 class="iprompt__title">{{ t('install.title') }}</h3>
        <p class="iprompt__subtitle">{{ subtitle }}</p>
      </div>
    </div>

    <!-- Android: the browser owns the dialog, we just ask for it -->
    <button v-if="canPrompt" class="iprompt__cta" data-test="install-cta" @click="onInstall">
      <i class="fas fa-download" aria-hidden="true"></i>
      {{ t('install.action') }}
    </button>

    <!-- iOS: nothing can be triggered, so show where the gesture lives -->
    <ol v-else class="iprompt__steps" data-test="install-steps">
      <li>
        <i class="fas fa-arrow-up-from-bracket" aria-hidden="true"></i>
        <span>{{ t('install.ios.share') }}</span>
      </li>
      <li>
        <i class="fas fa-square-plus" aria-hidden="true"></i>
        <span>{{ t('install.ios.addToHome') }}</span>
      </li>
      <li>
        <i class="fas fa-check" aria-hidden="true"></i>
        <span>{{ t('install.ios.confirm') }}</span>
      </li>
    </ol>

    <button
      v-if="variant === 'gate'"
      class="iprompt__skip"
      data-test="install-skip"
      @click="onDismiss"
    >
      {{ t('install.later') }}
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useInstallPrompt } from '@/composables/useInstallPrompt'

const props = withDefaults(
  defineProps<{
    /**
     * `gate` precedes connecting anything (iOS) and explains what is at stake;
     * `banner` is the discreet strip shown to an Android user already using the app.
     */
    variant?: 'gate' | 'banner'
  }>(),
  { variant: 'banner' }
)

const { t } = useI18n()
const { canPrompt, offerBeforePlugins, offerAfterEngagement, promptInstall, dismiss } =
  useInstallPrompt()

const visible = computed(() =>
  props.variant === 'gate' ? offerBeforePlugins.value : offerAfterEngagement.value
)

/**
 * The reason differs, so the sentence does too. On iOS the point is that the
 * order matters — installing later means re-importing everything.
 */
const subtitle = computed(() =>
  props.variant === 'gate' ? t('install.ios.subtitle') : t('install.subtitle')
)

const onInstall = () => promptInstall()
const onDismiss = () => dismiss()
</script>

<style scoped>
.iprompt {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border-radius: var(--radius-lg);
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  color: var(--color-ink);
}

.iprompt--gate {
  border-color: var(--color-green-200);
  background: var(--color-green-50);
}

.iprompt--banner {
  margin: 0 0 14px;
  box-shadow: var(--shadow-float);
}

.iprompt__head {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Keep the title clear of the close button, which floats over this row */
.iprompt--banner .iprompt__head {
  padding-right: 28px;
}

.iprompt__badge {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--color-green-100);
  color: var(--color-green-700);
  font-size: 18px;
}

.iprompt__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.iprompt__subtitle {
  margin: 2px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-faint);
}

.iprompt__cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 18px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-green-600);
  color: var(--color-white);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.iprompt__cta:hover {
  background: var(--color-green-700);
}

.iprompt__steps {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
  counter-reset: step;
}

.iprompt__steps li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  counter-increment: step;
}

.iprompt__steps li::before {
  content: counter(step);
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--color-green-600);
  color: var(--color-white);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
}

.iprompt__steps i {
  color: var(--color-green-700);
  width: 18px;
  text-align: center;
}

.iprompt__skip,
.iprompt__close {
  background: none;
  border: none;
  color: var(--text-faint);
  cursor: pointer;
  font-size: 13px;
}

.iprompt__skip {
  align-self: center;
  padding: 4px 8px;
  text-decoration: underline;
}

.iprompt__close {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 4px 8px;
  font-size: 15px;
}

.iprompt__close:hover,
.iprompt__skip:hover {
  color: var(--color-ink);
}
</style>
