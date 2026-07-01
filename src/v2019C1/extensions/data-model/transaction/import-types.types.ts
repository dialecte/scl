import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** The DataTypeTemplates type records, reconciled bottom-up. */
export type TypeRecord =
	| Scl.TrackedRecord<'EnumType'>
	| Scl.TrackedRecord<'DAType'>
	| Scl.TrackedRecord<'DOType'>
	| Scl.TrackedRecord<'LNodeType'>

export type ImportTypesStats = {
	reused: number
	preserved: number
	forked: number
	/** Forks whose id was reclaimed from a now-orphaned superseded type. */
	reclaimed: number
}

export type ImportTypesResult = {
	/** source type id -> target type id (reused, preserved, or forked). */
	idRemap: Map<string, string>
	stats: ImportTypesStats
}

export type ImportTypesParams = {
	sourceQuery: Core.Query<Config>
	records: (Scl.TrackedRecord<'LNode'> | Scl.TrackedRecord<'LN'>)[]
	/**
	 * Clone mappings from the caller's instance `deepClone` (its `mappings`). The
	 * `lnType` of each cloned target whose source type was forked/deduped is
	 * repointed — only the mapped targets are touched, so pre-existing instances
	 * that share an id are never affected.
	 */
	cloneMappings?: Scl.CloneMapping[]
	/**
	 * Optional prefix prepended to a forked type's id. The id is always
	 * `<forkPrefix><sourceId>_<contentHash>` — the content hash is appended
	 * automatically so forks stay deterministic and content-addressed.
	 */
	forkPrefix?: string
}
