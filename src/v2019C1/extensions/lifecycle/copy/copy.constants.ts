import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'

import type { StructureLanding } from '@/v2019C1/extensions/lifecycle/layers/topology/landed-levels.types'

/** The element a copy starts from, per verb: a Function (fsd), an Application with the functions it composes (asd). */
export const COPY_ROOT_TAG_BY_VERB = {
	fsd: 'Function',
	asd: 'Application',
} as const

/** No level of the source landed on one of the structure: a copy names the levels it names, where they are. */
export const NO_LEVEL_LANDED: StructureLanding = { levels: [], redirects: [] }

/** The tags of the roots a copy is made of: what it holds is the copy, what applies to it outside them a satellite. */
export const COPY_ROOT_TAGS: ReadonlySet<string> = new Set(['Function', 'Application'])

/** Every tag of the definition: a copy reads all its subtree holds. */
export const EVERY_TAG: readonly string[] = Object.keys(SCL_DIALECTE_CONFIG.definition)
