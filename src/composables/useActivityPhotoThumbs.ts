import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import { getPhotoService } from '@/services/PhotoService'
import { FriendSyncService } from '@/services/FriendSyncService'
import type { PublicPhoto } from '@/types/friend'

export interface PhotoThumb {
  id: string
  url: string
}

/** Whose photos a card shows: the reader's own, or what a friend shares. */
export type PhotoSource =
  { kind: 'own'; activityId: string } | { kind: 'friend'; friendId: string; photos: PublicPhoto[] }

/**
 * The first thumbnails of an outing's photos, for a feed card, as object URLs
 * released when the card goes. A null source reads nothing.
 */
export function useActivityPhotoThumbs(source: () => PhotoSource | null, limit = 3) {
  const thumbs: Ref<PhotoThumb[]> = ref([])
  const count = ref(0)
  let unsubscribe: (() => void) | null = null

  const release = () => {
    for (const thumb of thumbs.value) URL.revokeObjectURL(thumb.url)
  }

  const load = async () => {
    const from = source()
    if (!from) return
    try {
      const list: { id: string; image: () => Promise<Blob | null> }[] =
        from.kind === 'own'
          ? (await getPhotoService().list(from.activityId)).map(p => ({
              id: p.id,
              image: () => getPhotoService().blob(p.id, 'thumb')
            }))
          : from.photos.map(p => ({
              id: p.id,
              image: () => FriendSyncService.getInstance().getSharedPhoto(from.friendId, p.thumb)
            }))
      const next: PhotoThumb[] = []
      for (const photo of list.slice(0, limit)) {
        const blob = await photo.image()
        if (blob) next.push({ id: photo.id, url: URL.createObjectURL(blob) })
      }
      release()
      thumbs.value = next
      count.value = list.length
    } catch {
      // No photo store (tests, or a database still opening): the card goes without
    }
  }

  onMounted(() => {
    const from = source()
    if (!from) return
    void load()
    if (from.kind === 'own') {
      unsubscribe = getPhotoService().onChanged(changed => {
        if (changed === from.activityId) void load()
      })
    }
  })

  onUnmounted(() => {
    unsubscribe?.()
    release()
  })

  return { thumbs, count }
}
