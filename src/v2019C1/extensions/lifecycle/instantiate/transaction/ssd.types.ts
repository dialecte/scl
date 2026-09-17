import type { Config, Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type { CollisionOverrides } from '@/v2019C1/extensions/lifecycle/engine/decide.types'
import type * as Core from '@dialecte/core'

export type SsdParams = {
	sourceQuery: Core.Query<Config>
	/** The SSD scope to instantiate. Defaults to the SSD's instantiable root. */
	scopeRef?: Scl.Ref<TopologyStructuralTag>
	/** Target parent the SSD content is instantiated under (e.g. a project Bay). */
	targetParent: Scl.Ref<Scl.ElementsOf>
	/** Identity policy: `stamp-template` (bay-typical reuse, default) or `keep` (project-base). */
	mode?: 'stamp-template' | 'keep'
	/** User-edited values per source element id (full track); drives collision override. */
	overrides?: CollisionOverrides
	/** Type-dedup name authority, forwarded to `importTypes`. Default `'target'`. */
	keepNameTypesFrom?: KeepNameTypesFrom
}

export type SsdResult = {
	/** The SSD scope root that was instantiated (source-side ref). */
	scopeRef: Scl.Ref<TopologyStructuralTag>
	/** Full source-record -> target-record mapping for the cloned content. */
	recordMappings: Scl.CloneMapping[]
}
