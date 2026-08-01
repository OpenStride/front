// The live recording, held at module level rather than inside the setup view.
//
// It used to live in the component, which meant the watcher id died with the
// component: leaving the screen mid-run orphaned the native foreground service
// (nothing could stop it again), coming back started a *second* watcher, and
// the dead component's callback kept overwriting the restored session. A
// recording outlives the screen that starts it, so it is stored where the
// screen's lifetime cannot reach it.

import { reactive } from 'vue'
import { getPluginContext } from '@/services/PluginContextFactory'
import type { Activity } from '@/types/activity'
import type { SportType } from '@/types/sport'
import { startWatch, stopWatch, type GeoError, type GeoPoint } from './geo'
import { acceptPoint, buildActivity, emptySession, type RecordSession } from './recorder'

const STORAGE_KEY = 'recorder:session'

/**
 * How often the session reaches IndexedDB. The previous version wrote the whole
 * (growing) point array on every fix — a few thousand serialisations of an
 * ever-longer array over a run, on the UI thread. Crash-safety only needs the
 * loss window to be bounded, and ten seconds is a bounded loss window.
 */
const PERSIST_INTERVAL_MS = 10_000

interface StoredSession {
  session: RecordSession
  /**
   * Kept so a WebView reload can call `removeWatcher` on the watcher its own
   * JS context has forgotten — otherwise the foreground service survives with
   * no handle and drains the battery until the app is force-stopped.
   */
  watcherId: string | null
}

export type Phase = 'idle' | 'recording' | 'paused'

export interface RecorderState {
  phase: Phase
  session: RecordSession
  /** Accuracy of the last fix in metres, so a mute HUD can say what it waits for. */
  accuracy: number | null
  error: GeoError | null
}

export const state = reactive<RecorderState>({
  phase: 'idle',
  session: emptySession(),
  accuracy: null,
  error: null
})

let watcherId: string | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null
let notification = { title: 'OpenStride', message: 'Recording' }
let restored = false

function openPause(session: RecordSession) {
  return session.pauses.find(p => p.end === null)
}

function snapshot(): StoredSession {
  return { session: JSON.parse(JSON.stringify(state.session)), watcherId }
}

async function writeNow(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  const ctx = await getPluginContext()
  await ctx.storage.saveData(STORAGE_KEY, snapshot())
}

/** Persist within `PERSIST_INTERVAL_MS`, coalescing the fixes that arrive meanwhile. */
function persistSoon(): void {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    void writeNow()
  }, PERSIST_INTERVAL_MS)
}

function onPoint(p: GeoPoint): void {
  if (state.phase !== 'recording') return
  state.accuracy = typeof p.accuracy === 'number' ? p.accuracy : null
  const pts = state.session.points
  if (!acceptPoint(p, pts[pts.length - 1])) return
  pts.push(p)
  state.error = null
  persistSoon()
}

function onError(e: GeoError): void {
  state.error = e
}

async function beginWatch(): Promise<void> {
  watcherId = await startWatch(onPoint, onError, notification)
  await writeNow()
}

async function endWatch(): Promise<void> {
  if (!watcherId) return
  const id = watcherId
  watcherId = null
  await stopWatch(id)
}

/**
 * Adopt whatever is left of a previous run: an interrupted recording from a
 * killed app, or an orphaned watcher from a reloaded WebView. Safe to call on
 * every mount — a recording still live in this JS context is left alone.
 */
export async function restore(): Promise<void> {
  if (restored || state.phase !== 'idle') return
  restored = true
  const ctx = await getPluginContext()
  const stored = await ctx.storage.getData<StoredSession>(STORAGE_KEY)
  if (!stored?.session) return

  // A watcher from a previous JS context: we can never feed it again, so stop it.
  if (stored.watcherId) {
    try {
      await stopWatch(stored.watcherId)
    } catch {
      // Already gone with the process — nothing to clean up.
    }
  }

  const session = stored.session
  if (!session.points?.length) {
    await ctx.storage.deleteData(STORAGE_KEY)
    return
  }

  session.pauses = session.pauses ?? []
  // The app was away between the last fix and now, and that time was not moving
  // time. Anchoring the pause on the last fix — not on "now" — is what keeps the
  // gap out of the duration.
  if (!openPause(session)) {
    session.pauses.push({ start: session.points[session.points.length - 1].time, end: null })
  }
  state.session = session
  state.phase = 'paused'
  state.accuracy = null
  state.error = null
}

export async function start(sport: SportType, notif: { title: string; message: string }) {
  notification = notif
  state.session = emptySession(sport)
  state.session.startTime = Date.now()
  state.accuracy = null
  state.error = null
  state.phase = 'recording'
  try {
    await beginWatch()
  } catch (err) {
    state.phase = 'idle'
    state.error = { message: err instanceof Error ? err.message : String(err) }
    throw err
  }
}

export async function pause(): Promise<void> {
  if (state.phase !== 'recording') return
  state.phase = 'paused'
  if (!openPause(state.session)) state.session.pauses.push({ start: Date.now(), end: null })
  await endWatch()
  await writeNow()
}

export async function resume(notif?: { title: string; message: string }): Promise<void> {
  if (state.phase !== 'paused') return
  if (notif) notification = notif
  const open = openPause(state.session)
  if (open) open.end = Date.now()
  state.phase = 'recording'
  await beginWatch()
}

/**
 * Stop recording and save. Returns the saved activity, or null when there was
 * nothing to save — a recording with no fix is not an activity, and the caller
 * has to say so instead of leaving the user with a silent button.
 */
export async function finish(): Promise<Activity | null> {
  await endWatch()
  const ctx = await getPluginContext()

  if (state.session.points.length === 0) {
    await discard(ctx)
    return null
  }

  const { activity, details } = buildActivity(state.session)
  try {
    await ctx.activity.saveActivityWithDetails(activity, details)
  } catch (err) {
    // The session stays: this recording is the only copy of the run, and a
    // failed write is not a reason to throw an hour of it away. The user is
    // left on a paused recording and can press Finish again.
    state.phase = 'paused'
    if (!openPause(state.session)) state.session.pauses.push({ start: Date.now(), end: null })
    await writeNow()
    throw err
  }

  await discard(ctx)
  return activity
}

async function discard(ctx: Awaited<ReturnType<typeof getPluginContext>>): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  await ctx.storage.deleteData(STORAGE_KEY)
  state.session = emptySession(state.session.sport)
  state.phase = 'idle'
  state.accuracy = null
}

/** Write the pending state out now — called when the screen goes away. */
export async function flush(): Promise<void> {
  if (state.phase === 'idle') return
  await writeNow()
}

/** Test seam: drop every trace of a recording without touching storage. */
export function resetForTests(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = null
  watcherId = null
  restored = false
  state.phase = 'idle'
  state.session = emptySession()
  state.accuracy = null
  state.error = null
}
