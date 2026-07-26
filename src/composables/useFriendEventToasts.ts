import { onMounted, onUnmounted } from 'vue'
import { FriendService } from '@/services/FriendService'
import { ToastService } from '@/services/ToastService'
import type { FriendServiceEvent } from '@/types/friend'

const TIMEOUTS: Record<string, number> = {
  error: 5000,
  warning: 4000
}

/**
 * Turn FriendService events into toasts — once for the whole app.
 *
 * Every screen that touched friends used to attach its own listener, and the
 * profile page mounts all of its tabs at once (they are hidden with v-show, not
 * v-if). A single publish failure was therefore announced three times: by the
 * friends tab, by the scanner it embeds and by the sharing tab. Mount this in
 * the layout instead — services emit, one listener turns that into UI.
 */
export function useFriendEventToasts() {
  const friendService = FriendService.getInstance()

  const handler = (event: Event) => {
    const { message, messageType } = (event as CustomEvent<FriendServiceEvent>).detail
    if (!message || !messageType) return

    ToastService.push(message, { type: messageType, timeout: TIMEOUTS[messageType] ?? 3000 })
  }

  onMounted(() => friendService.emitter.addEventListener('friend-event', handler))
  onUnmounted(() => friendService.emitter.removeEventListener('friend-event', handler))
}
