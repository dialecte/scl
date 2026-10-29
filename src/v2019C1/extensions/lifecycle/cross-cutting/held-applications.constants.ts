import type { HeldApplications } from './held-applications.types'

/** Nothing held: a placement landing on no element of the project. */
export const NO_HELD_APPLICATIONS: HeldApplications = { landed: new Map(), byTarget: new Map() }
