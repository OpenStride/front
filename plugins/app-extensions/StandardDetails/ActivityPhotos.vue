<template>
  <!-- Nothing at all without photos: the camera beside the title is the way in -->
  <section v-if="photos.length || busy" class="aph" data-test="activity-photos">
    <ul class="aph__strip">
      <li v-for="(photo, i) in photos" :key="photo.id">
        <button
          type="button"
          class="aph__thumb"
          :aria-label="t('photos.open', { n: i + 1, total: photos.length })"
          data-test="photo-thumb"
          @click="openViewer(i)"
        >
          <img v-if="thumbs[photo.id]" :src="thumbs[photo.id]" alt="" loading="lazy" />
          <i v-else class="fas fa-image aph__placeholder" aria-hidden="true"></i>
        </button>
      </li>
      <li v-if="busy">
        <div class="aph__thumb aph__thumb--busy" role="status" :aria-label="t('photos.adding')">
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        </div>
      </li>
      <li v-else-if="canEdit && photos.length < MAX_PHOTOS_PER_ACTIVITY">
        <button
          type="button"
          class="aph__thumb aph__add"
          :aria-label="t('photos.add')"
          :title="t('photos.add')"
          data-test="photo-add-more"
          @click="pick"
        >
          <i class="fas fa-plus" aria-hidden="true"></i>
        </button>
      </li>
    </ul>
  </section>

  <input
    v-if="canEdit"
    ref="input"
    class="aph__input"
    type="file"
    accept="image/*"
    multiple
    tabindex="-1"
    aria-hidden="true"
    data-test="photo-input"
    @change="onPicked"
  />

  <Teleport to="body">
    <div
      v-if="current"
      class="aph-viewer"
      role="dialog"
      aria-modal="true"
      :aria-label="t('photos.viewer', { n: viewerIndex! + 1, total: photos.length })"
      data-test="photo-viewer"
      @click.self="closeViewer"
    >
      <img v-if="fullUrl" class="aph-viewer__img" :src="fullUrl" alt="" />
      <i v-else class="fas fa-spinner fa-spin aph-viewer__wait" aria-hidden="true"></i>

      <div class="aph-viewer__bar">
        <span class="aph-viewer__count">{{ viewerIndex! + 1 }} / {{ photos.length }}</span>
        <button
          v-if="canEdit"
          type="button"
          class="aph-viewer__btn"
          :aria-label="t('photos.delete')"
          :title="t('photos.delete')"
          data-test="photo-delete"
          @click="removeCurrent"
        >
          <i class="fas fa-trash" aria-hidden="true"></i>
        </button>
        <button
          ref="closeButton"
          type="button"
          class="aph-viewer__btn"
          :aria-label="t('photos.close')"
          data-test="photo-close"
          @click="closeViewer"
        >
          <i class="fas fa-xmark" aria-hidden="true"></i>
        </button>
      </div>

      <button
        v-if="photos.length > 1"
        type="button"
        class="aph-viewer__nav aph-viewer__nav--prev"
        :aria-label="t('photos.previous')"
        @click="step(-1)"
      >
        <i class="fas fa-chevron-left" aria-hidden="true"></i>
      </button>
      <button
        v-if="photos.length > 1"
        type="button"
        class="aph-viewer__nav aph-viewer__nav--next"
        :aria-label="t('photos.next')"
        @click="step(1)"
      >
        <i class="fas fa-chevron-right" aria-hidden="true"></i>
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePluginContext } from '@/composables/usePluginContext'
import { MAX_PHOTOS_PER_ACTIVITY, type PhotoSize } from '@/types/photo'
import type { PublicPhoto } from '@/types/friend'

const props = defineProps<{
  activityId: string
  canEdit: boolean
  /** A friend's outing: the photos they share, read from their public files. */
  shared?: { friendId: string; photos: PublicPhoto[] }
}>()
const { t } = useI18n()
const ctx = usePluginContext()

/** What the strip needs of a photo, whoever it belongs to. */
interface Shown {
  id: string
}

const photos = ref<Shown[]>([])

/** The reader's own photos from the device, a friend's from their public files. */
async function listPhotos(): Promise<Shown[]> {
  return props.shared ? props.shared.photos : ctx.photos.list(props.activityId)
}

function imageOf(id: string, size: PhotoSize): Promise<Blob | null> {
  if (!props.shared) return ctx.photos.blob(id, size)
  const photo = props.shared.photos.find(p => p.id === id)
  if (!photo) return Promise.resolve(null)
  return ctx.friends.getSharedPhoto(props.shared.friendId, photo[size])
}
/** Object URLs of the thumbnails, by photo id; revoked when a photo leaves. */
const thumbs = ref<Record<string, string>>({})
const busy = ref(false)
const input = ref<HTMLInputElement | null>(null)

async function load() {
  const list = await listPhotos()
  const live = new Set(list.map(p => p.id))
  const kept: Record<string, string> = {}
  for (const [id, url] of Object.entries(thumbs.value)) {
    if (live.has(id)) kept[id] = url
    else URL.revokeObjectURL(url)
  }
  thumbs.value = kept
  // The tiles first, the images as they come: on another device than the one
  // that took them, each thumbnail is a download
  photos.value = list
  for (const photo of list) {
    if (thumbs.value[photo.id]) continue
    const blob = await imageOf(photo.id, 'thumb')
    if (blob && photos.value.some(p => p.id === photo.id) && !thumbs.value[photo.id]) {
      thumbs.value = { ...thumbs.value, [photo.id]: URL.createObjectURL(blob) }
    }
  }
}

/** Opens the file picker — also what the camera button beside the title calls. */
function pick() {
  input.value?.click()
}

async function onPicked(event: Event) {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files ?? [])
  // Cleared at once so picking the same file again still fires a change
  target.value = ''
  if (!files.length) return
  busy.value = true
  try {
    const result = await ctx.photos.add(props.activityId, files)
    if (result.failed) {
      ctx.notifications.notify(t('photos.failed', { n: result.failed }, result.failed), {
        type: 'error'
      })
    }
    if (result.refused) {
      ctx.notifications.notify(t('photos.refused', { max: MAX_PHOTOS_PER_ACTIVITY }), {
        type: 'warning'
      })
    }
  } finally {
    busy.value = false
    await load()
  }
}

// ── Viewer ──────────────────────────────────────────────────────────────────
const viewerIndex = ref<number | null>(null)
const fullUrl = ref<string | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const current = computed(() =>
  viewerIndex.value === null ? null : (photos.value[viewerIndex.value] ?? null)
)

function openViewer(index: number) {
  viewerIndex.value = index
}

function closeViewer() {
  viewerIndex.value = null
}

function step(delta: number) {
  if (viewerIndex.value === null || !photos.value.length) return
  const n = photos.value.length
  viewerIndex.value = (viewerIndex.value + delta + n) % n
}

async function removeCurrent() {
  const photo = current.value
  if (!photo || !window.confirm(t('photos.confirmDelete'))) return
  await ctx.photos.remove(photo.id)
  await load()
  if (!photos.value.length) closeViewer()
  else viewerIndex.value = Math.min(viewerIndex.value ?? 0, photos.value.length - 1)
}

// The full image is fetched for the photo on screen only, and let go after
watch(current, async (photo, previous) => {
  if (photo?.id === previous?.id) return
  if (fullUrl.value) URL.revokeObjectURL(fullUrl.value)
  fullUrl.value = null
  if (!photo) return
  const blob = await imageOf(photo.id, 'full')
  if (blob && current.value?.id === photo.id) fullUrl.value = URL.createObjectURL(blob)
  if (!previous) {
    await nextTick()
    closeButton.value?.focus()
  }
})

function onKey(event: KeyboardEvent) {
  if (viewerIndex.value === null) return
  if (event.key === 'Escape') closeViewer()
  else if (event.key === 'ArrowLeft') step(-1)
  else if (event.key === 'ArrowRight') step(1)
}

let unsubscribe: (() => void) | null = null

onMounted(() => {
  void load()
  if (!props.shared) {
    unsubscribe = ctx.photos.onChanged(id => {
      if (id === props.activityId && !busy.value) void load()
    })
  }
  window.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  unsubscribe?.()
  window.removeEventListener('keydown', onKey)
  for (const url of Object.values(thumbs.value)) URL.revokeObjectURL(url)
  if (fullUrl.value) URL.revokeObjectURL(fullUrl.value)
})

defineExpose({ pick })
</script>

<style scoped>
.aph__strip {
  display: flex;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
}
.aph__strip::-webkit-scrollbar {
  display: none;
}
.aph__strip > li {
  flex-shrink: 0;
  scroll-snap-align: start;
}

.aph__thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88px;
  height: 88px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--surface-muted);
  cursor: pointer;
}
.aph__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.aph__placeholder {
  color: var(--text-faint);
}
.aph__thumb--busy {
  cursor: default;
  color: var(--text-faint);
}
.aph__add {
  border: 1px dashed var(--border-subtle);
  background: none;
  color: var(--text-faint);
  font-size: 1.1rem;
}
.aph__add:hover {
  color: var(--color-green-700);
}

.aph__input {
  display: none;
}

/* ── Viewer ─────────────────────────────────────────── */
.aph-viewer {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--color-ink) 94%, transparent);
  color: var(--color-white);
}
.aph-viewer__img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.aph-viewer__wait {
  font-size: 1.5rem;
}
.aph-viewer__bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: max(8px, env(safe-area-inset-top)) 8px 8px 16px;
}
.aph-viewer__count {
  flex: 1;
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
}
.aph-viewer__btn,
.aph-viewer__nav {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-ink) 60%, transparent);
  color: var(--color-white);
  font-size: 1.1rem;
  cursor: pointer;
}
.aph-viewer__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
}
.aph-viewer__nav--prev {
  left: 8px;
}
.aph-viewer__nav--next {
  right: 8px;
}
</style>
