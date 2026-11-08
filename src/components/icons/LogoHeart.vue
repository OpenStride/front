<template>
  <svg
    class="logo-heart"
    :class="{ 'logo-heart--liked': liked, 'logo-heart--beat': beating }"
    viewBox="55.5 148 70 73"
    aria-hidden="true"
    focusable="false"
    @animationend="beating = false"
  >
    <path class="logo-heart__leaf" :d="LEAF" />
    <path class="logo-heart__shield" :d="SHIELD" />
  </svg>
</template>

<script setup lang="ts">
/**
 * The logo itself, as the sign of a like: its leaf, its dark shield and the
 * pulse between them. Liked, in the logo's colours; not yet, drawn in the
 * colour of the text around it.
 */
import { ref, watch } from 'vue'

const props = defineProps<{ liked: boolean }>()

// Drawn in src/assets/logo.svg (its layer's local coordinates), copied as is
const LEAF =
  'm 73.632854,166.56023 c 0,0 23.90519,14.18495 37.834046,-15.13891 6.25005,2.72389 7.75233,3.64451 11.86701,5.88004 2.81258,7.87141 1.22926,15.41662 -0.17581,21.52578 -8.50384,0.0533 -17.9707,-0.0282 -17.9707,-0.0282 l -12.629956,16.38056 -14.62817,-22.18457 -7.05156,9.06589 c 0,0 -2.322293,0.0577 -4.279785,-0.0188 0.182481,-7.53726 7.034975,-15.48009 7.034975,-15.48009 z'
const SHIELD =
  'm 58.642859,185.4581 13.828655,-0.73353 5.18378,-6.53557 14.83857,23.31618 14.406376,-19.54587 c 0,0 8.65614,-0.0483 15.88209,-0.0718 -5.9927,25.29082 -29.710306,36.68309 -29.710306,36.68309 0,0 -26.012258,-11.81157 -26.382924,-31.79145 -2.602519,-0.43516 -8.046241,-1.32124 -8.046241,-1.32124 z'

/** One beat when a like is given — not when the page opens on one already given. */
const beating = ref(false)
watch(
  () => props.liked,
  (now, before) => {
    if (now && before === false) beating.value = true
  }
)
</script>

<style scoped>
.logo-heart {
  width: 1.15em;
  height: 1.15em;
  flex-shrink: 0;
  overflow: visible;
}

.logo-heart path {
  fill: none;
  stroke: currentColor;
  stroke-width: 4;
  stroke-linejoin: round;
  transition:
    fill 0.2s ease,
    stroke-width 0.2s ease;
}

.logo-heart--liked path {
  stroke-width: 0;
}
.logo-heart--liked .logo-heart__leaf {
  fill: var(--color-logo-leaf);
}
.logo-heart--liked .logo-heart__shield {
  fill: var(--color-logo-ink);
}

/* A heartbeat: two pulses, the second softer, from the point of the shield */
.logo-heart--beat {
  transform-origin: 50% 90%;
  animation: logo-heart-beat 0.6s ease-out;
}

@keyframes logo-heart-beat {
  0% {
    transform: scale(1);
  }
  25% {
    transform: scale(1.3);
  }
  45% {
    transform: scale(0.95);
  }
  65% {
    transform: scale(1.15);
  }
  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .logo-heart--beat {
    animation: none;
  }
}
</style>
