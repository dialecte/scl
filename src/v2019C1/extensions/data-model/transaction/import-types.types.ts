import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** The DataTypeTemplates type records, reconciled bottom-up. */
export type TypeRecord =
	| Scl.TrackedRecord<'EnumType'>
	| Scl.TrackedRecord<'DAType'>
	| Scl.TrackedRecord<'DOType'>
	| Scl.TrackedRecord<'LNodeType'>

export type ForkIdContext = {
	tagName: 'LNodeType' | 'DOType' | 'DAType' | 'EnumType'
	/** The source type's own id, used as the default base name. */
	baseName: string
	/** §6.9 structural signature of the type (id-independent). */
	signature: string
}

export type ImportTypesStats = { reused: number; preserved: number; forked: number }

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
	/** Override fork-id generation; default = deterministic content hash. */
	forkId?: (ctx: ForkIdContext) => string
}
