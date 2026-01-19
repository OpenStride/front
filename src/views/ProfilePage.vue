<template>
  <div class="max-w-md mx-auto mt-10 space-y-6">
    <h2 class="text-2xl font-bold text-center">
      {{ isProfileSaved ? savedProfile.username : t('profile.createProfile') }}
    </h2>

    <!-- Formulaire de création de profil -->
    <div v-if="!isProfileSaved" class="space-y-4 bg-white shadow rounded-xl p-6">
      <input
        v-model="username"
        :placeholder="t('profile.enterUsername')"
        class="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring focus:border-green-300"
      />

      <label
        for="file-upload"
        class="block w-full text-center py-2 border border-dashed border-gray-400 rounded-md cursor-pointer hover:bg-gray-50"
      >
        {{ t('profile.choosePhoto') }}
      </label>
      <input
        type="file"
        id="file-upload"
        class="hidden"
        capture="user"
        accept="image/*"
        @change="onFileChange"
      />

      <div v-if="photoPreview" class="flex justify-center">
        <img :src="photoPreview" :alt="t('profile.profilePhoto')" class="w-24 h-24 rounded-full object-cover border" />
      </div>

      <button
        @click="saveProfile"
        class="w-full bg-green-600 text-white py-2 rounded-md hover:bg-green-700"
      >
        {{ t('common.save') }}
      </button>
    </div>

    <!-- Affichage du profil sauvegardé -->
    <div
      v-else
      class="max-w-sm mx-auto bg-white shadow-lg rounded-2xl p-6 text-center space-y-4"
    >
      <div class="flex justify-center">
        <img
          v-if="savedProfile.photo"
          :src="savedProfile.photo"
          :alt="t('profile.profilePhoto')"
          class="w-24 h-24 rounded-full object-cover border-2 border-gray-300"
        />
      </div>

      <p class="text-lg font-semibold">{{ savedProfile.username }}</p>

      <button
        @click="editProfile"
        class="mt-4 bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-md"
      >
        {{ t('profile.editProfile') }}
      </button>
    </div>

    <!-- Configuration de l'application (toujours visible) -->
    <div class="max-w-sm mx-auto bg-white shadow rounded-xl p-6 space-y-4">
      <h3 class="text-lg font-semibold text-gray-700">{{ t('profile.appSettings') }}</h3>
      <LanguageSelector />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { IndexedDBService } from '@/services/IndexedDBService'
import { messaging } from '@/lib/firebase'
import { getToken } from 'firebase/messaging'
import LanguageSelector from '@/components/LanguageSelector.vue'

const { t } = useI18n()

const isProfileSaved = ref(false)
let dbService: IndexedDBService | null = null

const username = ref('')
const photoPreview = ref<string | null>(null)
const savedProfile = ref({ username: '', photo: '' })

onMounted(async () => {
  dbService = await IndexedDBService.getInstance()
  savedProfile.value.username = (await dbService.getData('username')) || ''
  savedProfile.value.photo = (await dbService.getData('profile_photo')) || ''
  if (savedProfile.value.username) {
    isProfileSaved.value = true
  }
})

const cropImageToSquare = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image()
    const reader = new FileReader()

    reader.onload = (e) => {
      img.src = e.target?.result as string
    }

    img.onload = () => {
      const size = Math.min(img.width, img.height)
      const offsetX = (img.width - size) / 2
      const offsetY = (img.height - size) / 2

      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, size, size)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
      resolve(dataUrl)
    }

    reader.readAsDataURL(file)
  })
}

const onFileChange = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) {
    cropImageToSquare(file).then((dataURL) => {
      photoPreview.value = dataURL
    })
  }
}

const requestNotificationPermission = async () => {
  try {
    const token = await getToken(messaging, {
      vapidKey: 'BD0btZI1W7WcbbfdHEZHh-IHLuKX6ZW9fZGpx0rEe_ye-Wjgy1OG3UTkBYQFzDRKgxZLbZ0hlyb0QaxXa_17cAE'
    })
    if (token) {
      console.log('Token FCM récupéré :', token)
      dbService?.saveData('fcm_token', token)
    } else {
      console.warn('❌ Permission refusée ou aucun token dispo.')
    }
  } catch (err) {
    console.error('🚫 Erreur FCM :', err)
  }
}

const saveProfile = async () => {
  if (!dbService) return
  await dbService.saveData('username', username.value)
  if (photoPreview.value) {
    await dbService.saveData('profile_photo', photoPreview.value)
  }
  savedProfile.value.username = username.value
  savedProfile.value.photo = photoPreview.value!
  isProfileSaved.value = true
  await requestNotificationPermission()
}

const editProfile = () => {
  username.value = savedProfile.value.username
  photoPreview.value = savedProfile.value.photo
  isProfileSaved.value = false
}
</script>
