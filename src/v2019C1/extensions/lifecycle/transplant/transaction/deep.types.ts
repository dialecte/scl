import type { RetagRootConfig, StripConfig } from './primitives/clone-tree.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type * as Core from '@dialecte/core'
import type { OmitEntry } from '@dialecte/core'

export type ImportDeepParams = {
	sourceQuery: Core.Query<Config>
	/** The element subtree to import. */
	ref: Scl.Ref<Scl.ElementsOf>
	/** Target parent the subtree is cloned under. */
	targetParent: Scl.Ref<Scl.ElementsOf>
	/**
	 * Import the referenced **type** closure (content-addressed). Default `true`.
	 *
	 * - `true` / omitted — import, destination keeps the type name on a dedup;
	 * - `false` — faithful subtree copy, no type closure;
	 * - `{ keepNameFrom }` — import, choosing which side keeps the type name on a
	 *   dedup (`'target'` default, `'source'` = incoming file is the authority).
	 */
	withTypes?: boolean | { keepNameFrom?: KeepNameTypesFrom }
	/** Child element tag names to drop from the cloned subtree. */
	omit?: OmitEntry<Config>[]
	/**
	 * Attributes dropped from the cloned subtree, for a target that cannot take them (a generic filter). Default
	 * `false`: the copy is faithful, lineage and provenance included — the lifecycle operations write the lineage of
	 * their direction afterwards (`identity.writeIdentity`).
	 */
	strip?: StripConfig | false
	/** Replace the root tagName when it matches `from` (e.g. SubFunction -> Function). */
	retagRoot?: RetagRootConfig
	/** Source records not cloned, with what they hold (record ids): what the instance's selection of variants leaves out. */
	leaveOut?: ReadonlySet<string>
}

export type ImportDeepResult = {
	/** The cloned root record in the target. */
	record: Scl.RawRecord<Scl.ElementsOf>
	/** source type id -> reconciled target type id, from the data-model type reconciliation. */
	typeIdRemap: Map<string, string>
	/** Each source record and the copy made of it, for the whole cloned subtree. */
	cloneMappings: Scl.CloneMapping[]
}
