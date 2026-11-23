import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** The DataTypeTemplates type records, reconciled bottom-up. */
export type TypeRecord =
	| Scl.TrackedRecord<'EnumType'>
	| Scl.TrackedRecord<'DAType'>
	| Scl.TrackedRecord<'DOType'>
	| Scl.TrackedRecord<'LNodeType'>

export type KeepNameTypesFrom = 'source' | 'target'

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

/** A logical node whose type closure is imported: an `LNode`, `LN` or `LN0` of the source. */
export type LogicalNodeRecord =
	| Scl.TrackedRecord<'LNode'>
	| Scl.TrackedRecord<'LN'>
	| Scl.TrackedRecord<'LN0'>

/**
 * A logical node of the target matched to one of the source (an instance following a newer template): it takes the type
 * its `source` names, resolved in the target.
 */
export type TypeFollower = {
	source: LogicalNodeRecord
	target: Scl.Ref<'LNode'> | Scl.Ref<'LN'> | Scl.Ref<'LN0'>
}

export type ImportTypesParams = {
	sourceQuery: Core.Query<Config>
	records: LogicalNodeRecord[]
	/**
	 * LNodeTypes of the source to import by id, whether or not a logical node names them (a type a caller chose for a
	 * logical node it is about to build): their closure is walked from the type, as for the types `records` name.
	 */
	lnodeTypeIds?: readonly string[]
	/**
	 * Clone mappings from the caller's instance `deepClone` (its `mappings`). The
	 * `lnType` of each cloned target whose source type was forked/deduped is
	 * repointed — only the mapped targets are touched, so pre-existing instances
	 * that share an id are never affected.
	 */
	cloneMappings?: Scl.CloneMapping[]
	/**
	 * Logical nodes of the target that take the type their source logical node names (its closure imported with the
	 * `records`'): each is pointed at the id its source's type resolves to, whatever it named before. The type it leaves
	 * is removed once nothing names it any more (with the types only it named), and a fork takes back the id that frees;
	 * so does a fork an earlier call minted for the same content, once its source id is free (a call without followers
	 * leaves forks as they are).
	 */
	followers?: TypeFollower[]
	/**
	 * Optional prefix prepended to a forked type's id. The id is always
	 * `<forkPrefix><sourceId>_<contentHash>` — the content hash is appended
	 * automatically so forks stay deterministic and content-addressed.
	 */
	forkPrefix?: string
	/**
	 * On dedup (structurally-equal type already present in the target under a
	 * different id), which side's id/name the surviving type keeps:
	 *
	 * - `'target'` (default) — reuse the pre-existing target id; incoming instances
	 *   repoint to it. The destination is authoritative for the name.
	 * - `'source'` — rename the pre-existing target type to the incoming id and
	 *   repoint the target's existing referrers to follow. The incoming file is
	 *   authoritative for the name.
	 *
	 * Only affects dedup; preserve and fork/reclaim are unchanged.
	 */
	keepNameTypesFrom?: KeepNameTypesFrom
}

/**
 * A type the target held under the fork id of a source type (`<forkPrefix><id>_<hash>`), reused for that source type:
 * it takes the source id back once that id is free.
 */
export type ReusedFork = {
	tagName: TypeRecord['tagName']
	sourceId: string
	forkId: string
}

/**
 * The target type holding each source id, as a lookup of that id at that point of the loop would answer: looked up
 * before the loop, told of the types the loop clones and renames.
 */
export type TargetTypes = {
	find(params: {
		tagName: TypeRecord['tagName']
		id: string
	}): Promise<Scl.Ref<Scl.ElementsOf> | undefined>
	/** A type the loop cloned under `id`. */
	cloned(params: { tagName: string; id: string; ref: Scl.Ref<Scl.ElementsOf> }): void
	/** A type the loop renamed from `from` to `to`: both ids are looked up again where asked. */
	renamed(params: { tagName: string; from: string; to: string }): void
}

/** A source type with its id (empty or absent when it has none) and its signature (when it has an id). */
export type SignedSourceType = {
	source: TypeRecord
	sourceId: string | undefined
	signature: string | undefined
}
