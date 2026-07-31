<template>
  <div class="profile-panel">
    <section>
      <h3>{{ t('profile.identity.section') }}</h3>

      <div class="card">
        <!-- Mode édition -->
        <template v-if="!isProfileSaved">
          <div class="field">
            <label for="username">{{ t('profile.enterUsername') }}</label>
            <input
              id="username"
              v-model="username"
              type="text"
              :placeholder="t('profile.enterUsername')"
            />
          </div>

          <div class="field">
            <label for="file-upload" class="dropzone">
              <i class="fas fa-camera" aria-hidden="true"></i>
              {{ t('profile.choosePhoto') }}
            </label>
            <input
              type="file"
              id="file-upload"
              class="visually-hidden"
              capture="user"
              accept="image/*"
              @change="onFileChange"
            />
          </div>

          <img
            v-if="photoPreview"
            :src="photoPreview"
            :alt="t('profile.profilePhoto')"
            class="avatar"
          />

          <button @click="saveProfile" class="btn btn--primary btn--block">
            {{ t('common.save') }}
          </button>
        </template>

        <!-- Mode affichage -->
        <template v-else>
          <div class="identity">
            <img
              v-if="savedProfile.photo"
              :src="savedProfile.photo"
              :alt="t('profile.profilePhoto')"
              class="avatar"
            />
            <p class="identity__name">{{ savedProfile.username }}</p>
            <button @click="editProfile" class="btn btn--quiet">
              <i class="fas fa-pen" aria-hidden="true"></i>
              {{ t('profile.editProfile') }}
            </button>
          </div>
        </template>
      </div>
    </section>

    <section>
      <h3>{{ t('profile.athlete.section') }}</h3>
      <p class="panel-lead">{{ t('profile.athlete.lead') }}</p>

      <div class="card">
        <div class="field">
          <label for="weight">{{ t('profile.athlete.weight') }}</label>
          <input
            id="weight"
            v-model.number="athleteData.weight"
            type="number"
            min="0"
            step="0.1"
            placeholder="70.0"
          />
        </div>

        <div class="field">
          <label for="maxHR">{{ t('profile.athlete.maxHR') }}</label>
          <input
            id="maxHR"
            v-model.number="athleteData.maxHR"
            type="number"
            min="0"
            max="250"
            placeholder="190"
          />
        </div>

        <div class="field">
          <label for="restingHR">{{ t('profile.athlete.restingHR') }}</label>
          <input
            id="restingHR"
            v-model.number="athleteData.restingHR"
            type="number"
            min="0"
            max="150"
            placeholder="60"
          />
        </div>

        <div class="field">
          <label for="ftp">{{ t('profile.athlete.ftp') }}</label>
          <input
            id="ftp"
            v-model.number="athleteData.ftp"
            type="number"
            min="0"
            placeholder="250"
          />
        </div>

        <button @click="saveAthleteProfile" class="btn btn--primary btn--block">
          {{ t('common.save') }}
        </button>

        <p v-if="saveSuccess" class="saved" role="status">
          <i class="fas fa-check" aria-hidden="true"></i>
          {{ t('profile.athlete.saveSuccess') }}
        </p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { IndexedDBService } from '@/services/IndexedDBService'

const { t } = useI18n()

// Identity data
const isProfileSaved = ref(false)
const username = ref('')
const photoPreview = ref<string | null>(null)
const savedProfile = ref({ username: '', photo: '' })

// Athlete data
interface AthleteProfile {
  weight?: number
  maxHR?: number
  restingHR?: number
  ftp?: number
}

const athleteData = ref<AthleteProfile>({
  weight: undefined,
  maxHR: undefined,
  restingHR: undefined,
  ftp: undefined
})

const saveSuccess = ref(false)
let dbService: IndexedDBService | null = null

onMounted(async () => {
  dbService = await IndexedDBService.getInstance()

  // Load identity data
  savedProfile.value.username = (await dbService.getData('username')) || ''
  savedProfile.value.photo = (await dbService.getData('profile_photo')) || ''
  if (savedProfile.value.username) {
    isProfileSaved.value = true
  }

  // Load athlete data
  const savedData = await dbService.getData('athlete_profile')
  if (savedData) {
    athleteData.value = savedData as AthleteProfile
  }
})

// Identity functions
const cropImageToSquare = (file: File): Promise<string> => {
  return new Promise(resolve => {
    const img = new Image()
    const reader = new FileReader()

    reader.onload = e => {
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
    cropImageToSquare(file).then(dataURL => {
      photoPreview.value = dataURL
    })
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
}

const editProfile = () => {
  username.value = savedProfile.value.username
  photoPreview.value = savedProfile.value.photo
  isProfileSaved.value = false
}

// Athlete functions
const saveAthleteProfile = async () => {
  if (!dbService) return

  await dbService.saveData('athlete_profile', athleteData.value)

  saveSuccess.value = true
  setTimeout(() => {
    saveSuccess.value = false
  }, 3000)
}
</script>

<style scoped>
.dropzone {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.875rem;
  border: 1px dashed var(--border-subtle);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
}

.dropzone:hover {
  border-color: var(--color-green-400);
  color: var(--color-ink);
}

/* `display: none` on a file input makes it unreachable by keyboard, and the
   label is the only way in. This hides it without removing it from the tree. */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.avatar {
  align-self: center;
  width: 6rem;
  height: 6rem;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--border-subtle);
}

.identity {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.identity__name {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.0625rem;
  font-weight: 700;
  color: var(--color-ink);
}

.saved {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-green-700);
}
</style>
