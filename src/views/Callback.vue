<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="p-4 text-gray-700">
    <p v-if="error">{{ t('callback.error') }} : {{ error }}</p>
    <p v-else>{{ t('callback.connecting') }}</p>
  </div>
</template>

<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { ONBOARDING_STATE_KEY, type OnboardingState } from '@/types/onboarding'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { IndexedDBService } from '@/services/IndexedDBService'

const { t } = useI18n()

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string
const REDIRECT_PATH = '/callback'
const REDIRECT_URI = window.location.origin + REDIRECT_PATH

const error = ref('')
const router = useRouter()

onMounted(async () => {
  const urlParams = new URLSearchParams(window.location.search)
  const code = urlParams.get('code')
  const codeVerifier = localStorage.getItem('pkce_code_verifier')
  const dbService = await IndexedDBService.getInstance()

  if (!code || !codeVerifier) {
    error.value = "Code d'autorisation ou vérificateur manquant"
    return
  }

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    code,
    code_verifier: codeVerifier,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code'
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })

  const json = await res.json()
  if (json.error) {
    error.value = json.error_description || 'Erreur inconnue'
    return
  }

  await dbService.saveData('gdrive_refresh_token', json.refresh_token)
  await dbService.saveData('gdrive_access_token', json.access_token)

  // Vérifier si l'utilisateur était en onboarding
  const onboardingState = await dbService.getData<OnboardingState>(ONBOARDING_STATE_KEY)

  if (onboardingState && !onboardingState.completed) {
    // Retourner à l'onboarding
    router.push('/onboarding')
  } else {
    // Flow normal - rediriger vers home ou activities
    router.push('/')
  }
})
</script>
