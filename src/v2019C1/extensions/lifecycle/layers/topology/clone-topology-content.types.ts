import type { Scl } from '@/v2019C1/config'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'

export type CloneTopologyContentResult = {
	/** All source -> target clone mappings for the gathered content (frame + fn/app). */
	mappings: Scl.CloneMapping[]
	/**
	 * Source refs of the top-level placed elements (Applications, their composed Functions,
	 * standalone Functions) - the elements a caller runs placement-collision on. The structural
	 * frame is placed by merge-by-name, so it is not included here.
	 */
	placedRoots: Scl.Ref<Scl.ElementsOf>[]
	/** Source structural element id -> reproduced target ref, for name-correct placement. */
	frameIndex: Map<string, Scl.Ref<Scl.ElementsOf>>
	/** Shared elements mapped onto elements the target already holds (nothing cloned for them). */
	redirectMappings: RedirectMapping[]
}
