import { IndexedDBService } from './IndexedDBService'

/**
 * Where the user is, from the point of view of installing the app.
 *
 * The distinction that matters is not the OS but who owns the install gesture:
 * Chromium hands us the prompt and we can trigger it, Safari never does and the
 * user has to go through the share sheet themselves.
 */
export type InstallPlatform =
  | 'installed' // already running from the home screen
  | 'android-chromium' // we can call prompt()
  | 'ios-safari' // guide only, no API
  | 'desktop'
  | 'unsupported'

/** Persisted in `settings`, and only ever read to decide whether to ask again. */
export interface InstallPromptState {
  /** Distinct days the site was opened — not reloads, which say nothing. */
  visitDays: number
  /** ISO day of the last counted visit, so one session counts once. */
  lastVisitDay: string
  dismissedAt: number | null
  dismissCount: number
}

const STORAGE_KEY = 'install_prompt_state'

/** Two refusals is an answer; a third invitation is nagging. */
const MAX_DISMISSALS = 2

/** Android waits for the habit to show. iOS cannot afford to wait — see below. */
export const ANDROID_MIN_VISIT_DAYS = 4

const EMPTY_STATE: InstallPromptState = {
  visitDays: 0,
  lastVisitDay: '',
  dismissedAt: null,
  dismissCount: 0
}

const today = (): string => new Date().toISOString().slice(0, 10)

/**
 * The `beforeinstallprompt` event, held for later.
 *
 * Chromium fires it once, during load, long before the user reaches the moment
 * worth asking at. Without `preventDefault()` and a reference kept here, it is
 * gone and `prompt()` can never be called. This is the whole reason the service
 * has to be initialised at bootstrap rather than by a component.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export class InstallService {
  private static instance: InstallService | null = null

  private deferredPrompt: BeforeInstallPromptEvent | null = null
  private state: InstallPromptState = { ...EMPTY_STATE }
  public emitter = new EventTarget()

  private constructor() {
    /* singleton */
  }

  public static getInstance(): InstallService {
    if (!InstallService.instance) InstallService.instance = new InstallService()
    return InstallService.instance
  }

  /** Call once, at bootstrap, before anything renders. */
  public async initialize(): Promise<void> {
    window.addEventListener('beforeinstallprompt', evt => {
      evt.preventDefault()
      this.deferredPrompt = evt as BeforeInstallPromptEvent
      this.emitter.dispatchEvent(new Event('availability-changed'))
    })

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null
      this.emitter.dispatchEvent(new Event('availability-changed'))
    })

    await this.loadState()
    await this.countVisit()
  }

  // ── Platform ───────────────────────────────────────────────────────────────

  public isStandalone(): boolean {
    const displayMode = window.matchMedia?.('(display-mode: standalone)').matches ?? false
    // iOS predates the display-mode media query and uses its own flag.
    const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true
    return displayMode || iosStandalone
  }

  public get platform(): InstallPlatform {
    if (this.isStandalone()) return 'installed'

    const ua = navigator.userAgent
    // iPadOS 13+ reports itself as a Mac; the touch points give it away.
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

    if (isIOS) {
      // Only Safari can add to the home screen. Chrome and Firefox on iOS are
      // Safari underneath but do not offer it, so guiding them would be a lie.
      const isSafari = !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
      return isSafari ? 'ios-safari' : 'unsupported'
    }

    if (/Android/.test(ua)) return this.deferredPrompt ? 'android-chromium' : 'unsupported'

    return 'desktop'
  }

  /** True when there is a real install gesture to offer on this device. */
  public get canInstall(): boolean {
    const platform = this.platform
    return platform === 'android-chromium' || platform === 'ios-safari'
  }

  /** True only where we own the gesture — Android. Elsewhere we can only guide. */
  public get canPrompt(): boolean {
    return this.deferredPrompt !== null
  }

  // ── Asking ─────────────────────────────────────────────────────────────────

  /**
   * Show the browser's own install dialog.
   *
   * Resolves to what the user chose, or `unavailable` when there was no stored
   * event — on iOS, and on any Chromium that judged the app not installable.
   */
  public async promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const evt = this.deferredPrompt
    if (!evt) return 'unavailable'

    // The event is single-use: Chromium refuses a second prompt() on it.
    this.deferredPrompt = null
    await evt.prompt()
    const { outcome } = await evt.userChoice
    if (outcome === 'dismissed') await this.recordDismissal()
    this.emitter.dispatchEvent(new Event('availability-changed'))
    return outcome
  }

  // ── State ──────────────────────────────────────────────────────────────────

  public getState(): InstallPromptState {
    return { ...this.state }
  }

  /** False once the user has said no often enough to mean it. */
  public get mayAsk(): boolean {
    return this.state.dismissCount < MAX_DISMISSALS
  }

  public get visitDays(): number {
    return this.state.visitDays
  }

  public async recordDismissal(): Promise<void> {
    this.state.dismissedAt = Date.now()
    this.state.dismissCount += 1
    await this.saveState()
    this.emitter.dispatchEvent(new Event('availability-changed'))
  }

  private async loadState(): Promise<void> {
    try {
      const db = await IndexedDBService.getInstance()
      const saved = await db.getData<InstallPromptState>(STORAGE_KEY)
      if (saved) this.state = { ...EMPTY_STATE, ...saved }
    } catch {
      // IndexedDB may be unavailable (private mode, tests) — defaults stand.
    }
  }

  private async saveState(): Promise<void> {
    try {
      const db = await IndexedDBService.getInstance()
      await db.saveData(STORAGE_KEY, { ...this.state })
    } catch {
      // Losing this only costs an extra invitation, never data.
    }
  }

  /**
   * Count one visit per calendar day.
   *
   * Reloads and tab switches within a day say nothing about habit; coming back
   * on four different days does.
   */
  private async countVisit(): Promise<void> {
    const day = today()
    if (this.state.lastVisitDay === day) return
    this.state.lastVisitDay = day
    this.state.visitDays += 1
    await this.saveState()
  }
}

export function getInstallService(): InstallService {
  return InstallService.getInstance()
}
