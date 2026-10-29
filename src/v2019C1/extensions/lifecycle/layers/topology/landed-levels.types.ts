import type { Scl } from '@/v2019C1/config'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'

/** A level of a template above what a placement places, that the placement lands on. */
export type LandedLevel = {
	sourceRef: Scl.Ref<Scl.ElementsOf>
	uuid: string
	tagName: string
}

/** The levels a placement lands on in a target structure, and the redirect of each onto the level it landed on. */
export type StructureLanding = {
	levels: LandedLevel[]
	redirects: RedirectMapping[]
}
