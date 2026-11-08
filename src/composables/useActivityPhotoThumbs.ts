import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import { getPhotoService } from '@/services/PhotoService'

export interface PhotoThumb {
  id: string
  url: string
}

/**
 * The first thumbnails of an outing's photos, for a feed card, as object URLs
 * released when the card goes. `activityId` null (a friend's outing, whose
 * photos are not shared yet) reads nothing.
 */
export function useActivityPhotoThumbs(activityId: () => string | null, limit = 3) {
  const thumbs: Ref<PhotoThumb[]> = ref([])
  const count = ref(0)
  let unsubscribe: (() => void) | null = null

  const release = () => {
    for (const thumb of thumbs.value) URL.revokeObjectURL(thumb.url)
  }

  const load = async () => {
    const id = activityId()
    if (!id) return
    try {
      const service = getPhotoService()
      const photos = await service.list(id)
      const next: PhotoThumb[] = []
      for (const photo of photos.slice(0, limit)) {
        const blob = await service.blob(photo.id, 'thumb')
        if (blob) next.push({ id: photo.id, url: URL.createObjectURL(blob) })
      }
      release()
      thumbs.value = next
      count.value = photos.length
    } catch {
      // No photo store (tests, or a database still opening): the card goes without
    }
  }

  onMounted(() => {
    if (!activityId()) return
    void load()
    unsubscribe = getPhotoService().onChanged(changed => {
      if (changed === activityId()) void load()
    })
  })

  onUnmounted(() => {
    unsubscribe?.()
    release()
  })

  return { thumbs, count }
}
