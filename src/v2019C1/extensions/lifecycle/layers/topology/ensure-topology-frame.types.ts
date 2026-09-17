import type { Config, Scl } from '@/v2019C1/config'
import type { TargetStructure } from '@/v2019C1/extensions/lifecycle/transplant/transaction'
import type * as Core from '@dialecte/core'
import type { OmitEntry } from '@dialecte/core'

export type EnsureTopologyFrameParams = {
	sourceQuery: Core.Query<Config>
	/** The instantiable root of the source frame (Substation / VoltageLevel / Bay). */
	scopeRef: Scl.Ref<Scl.ElementsOf>
	/** The target element the reproduced frame is rooted under (typically the SCL root). */
	targetParent: Scl.Ref<Scl.ElementsOf>
	/** Extra child tags to drop from the frame's own-content clones (e.g. extract prunes provenance). */
	omit?: OmitEntry<Config>[]
}

export type EnsureTopologyFrameResult = {
	/** The scope root's own structural chain (Substation/VL/Bay), for single-scope placement compat. */
	structure: TargetStructure
	/** Source structural element id -> its reproduced target ref (multi-bay-safe placement). */
	frameIndex: Map<string, Scl.Ref<Scl.ElementsOf>>
	/** Source -> target mappings for every reproduced structural element and its own-content clones. */
	mappings: Scl.CloneMapping[]
}
