/**
 * What the onboarding flow persists between steps.
 *
 * Shared rather than inlined because two screens read it: the flow itself and
 * the OAuth callback, which has to know whether onboarding is still running to
 * decide where to send the user back. Both read it through
 * `getData('onboarding_state')`, which returns `unknown` without a type
 * argument — so neither was checked, and the router guard read a third shape.
 */
export interface OnboardingState {
  completed: boolean
  /** 0 = provider, 1 = storage, 2 = completion */
  currentStep: number
  selectedProviderId: string | null
  selectedStorageId: string | null
  hasImportedActivities: boolean
  startedAt: number
  completedAt: number | null
}

export const ONBOARDING_STATE_KEY = 'onboarding_state'
