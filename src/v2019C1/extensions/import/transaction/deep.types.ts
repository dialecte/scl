import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export type ImportDeepParams = {
	sourceQuery: Core.Query<Config>
	/** The element subtree to import. */
	ref: Scl.Ref<Scl.ElementsOf>
	/** Target parent the subtree is cloned under. */
	targetParent: Scl.Ref<Scl.ElementsOf>
	/** Import the referenced type closure (content-addressed). Default `true`. */
	withTypes?: boolean
}

export type ImportDeepResult = {
	/** The cloned root record in the target. */
	record: Scl.RawRecord<Scl.ElementsOf>
	/** source type id -> target type id, from the type reconciliation. */
	idRemap: Map<string, string>
}
