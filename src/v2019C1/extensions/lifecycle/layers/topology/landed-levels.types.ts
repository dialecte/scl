import type { Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
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

/** A Substation, VoltageLevel or Bay of a template, by its uuid and tag: read once per operation (`readTemplateLevels`). */
export type TemplateLevel = { id: string; uuid: string; tagName: TopologyStructuralTag }
