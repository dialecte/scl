import type { PromoteRootConfig, StripConfig } from './primitives/clone-tree.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { OmitEntry } from '@dialecte/core'

export type ImportDeepParams = {
	sourceQuery: Core.Query<Config>
	/** The element subtree to import. */
	ref: Scl.Ref<Scl.ElementsOf>
	/** Target parent the subtree is cloned under. */
	targetParent: Scl.Ref<Scl.ElementsOf>
	/** Import the referenced **type** closure (content-addressed). Default `true`. */
	withTypes?: boolean
	/**
	 * Import the forward **uuid-reference** closure — clone referenced satellites
	 * that are missing in the target (create-if-missing). Default `true`.
	 */
	withReferences?: boolean
	/** Ref tag names to skip while resolving the uuid-reference closure. */
	skipReferences?: ReadonlySet<string>
	/** Child element tag names to drop from the cloned subtree. */
	omit?: OmitEntry<Config>[]
	/**
	 * Attribute stripping applied to the cloned subtree. Default `false` (a generic
	 * import preserves provenance); recipes pass their own policy.
	 */
	strip?: StripConfig | false
	/** Replace the root tagName when it matches `from` (e.g. SubFunction -> Function). */
	promoteRoot?: PromoteRootConfig
}

export type ImportDeepResult = {
	/** The cloned root record in the target. */
	record: Scl.RawRecord<Scl.ElementsOf>
	/** source type id -> target type id, from the type reconciliation. */
	idRemap: Map<string, string>
}
