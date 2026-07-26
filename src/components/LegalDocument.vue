<template>
  <article class="legal-document">
    <p v-if="notice" class="legal-notice">
      <i class="fas fa-circle-info" aria-hidden="true"></i>
      {{ notice }}
    </p>

    <!-- eslint-disable-next-line vue/no-v-html -- repo-authored documents, compiled in at build time -->
    <div class="legal-body" v-html="body"></div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()

const props = defineProps<{
  /** File stem under src/content/legal, e.g. "privacy" */
  doc: 'privacy' | 'terms'
}>()

/**
 * The wording of a legal document is the document, not a bag of sentences, so
 * each language gets its own file rather than a key per paragraph. Translators
 * edit prose; nothing here has to stay in structural lockstep across locales.
 */
const documents = import.meta.glob('@/content/legal/*.html', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

/** The version that governs: a translation is a courtesy, this one is the text */
const AUTHORITATIVE_LOCALE = 'en'

function pathFor(doc: string, lang: string): string | undefined {
  return Object.keys(documents).find(p => p.endsWith(`/${doc}.${lang}.html`))
}

const resolved = computed(() => {
  const requested = pathFor(props.doc, locale.value)
  if (requested) {
    return { html: documents[requested], translated: locale.value !== AUTHORITATIVE_LOCALE }
  }

  // No version in the reader's language — show the governing one rather than
  // an empty page, and say why it is not in their language
  const fallback = pathFor(props.doc, AUTHORITATIVE_LOCALE)
  return { html: fallback ? documents[fallback] : '', translated: false, fellBack: true }
})

const body = computed(() => resolved.value.html)

const notice = computed(() => {
  if (resolved.value.fellBack) return t('legal.onlyInEnglish')
  if (resolved.value.translated) return t('legal.translationNotice')
  return ''
})
</script>

<style scoped>
.legal-document {
  padding: 2rem 1rem 3rem;
  max-width: 800px;
  margin: auto;
  line-height: 1.6;
  color: var(--text-color);
}

.legal-notice {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  margin-bottom: 1.5rem;
  border: 1px solid var(--color-green-200);
  border-left: 3px solid var(--color-green-500);
  border-radius: 8px;
  background: var(--color-green-50);
  font-size: 0.9rem;
}

.legal-notice i {
  color: var(--color-green-600);
  margin-top: 0.15rem;
}

.legal-body :deep(h1) {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.legal-body :deep(h2) {
  font-size: 1.35rem;
  margin-top: 2rem;
  margin-bottom: 0.5rem;
}

.legal-body :deep(p) {
  margin: 0.75rem 0;
}

.legal-body :deep(.effective-date) {
  color: var(--color-gray-500);
  font-size: 0.9rem;
}

.legal-body :deep(ul) {
  list-style-type: disc;
  padding-left: 1.75rem;
  margin: 0.75rem 0;
}

.legal-body :deep(li) {
  margin: 0.4rem 0;
}

@media (max-width: 640px) {
  .legal-document {
    padding: 1.5rem 1rem 2.5rem;
  }

  .legal-body :deep(h1) {
    font-size: 1.6rem;
  }
}
</style>
