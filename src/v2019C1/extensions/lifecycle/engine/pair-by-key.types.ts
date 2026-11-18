import type { MatchKey } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * What the key pass decided for an IED walk (`pairByKeyOnLineageMiss`): each source element paired by key with the
 * instance element it lands on (`pinnedMatches`, by record id), the instance uuid read as the source uuid it stands for
 * (`redirectedSourceUuids`), the key each pairing was made on (`keys`, by source record id), and the pairings made among
 * siblings sharing that key (`twins`).
 */
export type KeyPairings = {
	pinnedMatches: ReadonlyMap<string, string>
	redirectedSourceUuids: ReadonlyMap<string, string>
	keys: ReadonlyMap<string, string>
	/** The source elements paired among siblings of one key, in order (by record id): the report warns of each. */
	twins: ReadonlySet<string>
}

export type PairByKeyParams = {
	sourceTree: AnyTreeRecord
	instanceTree: AnyTreeRecord
	/** The instance's elements by lineage under the scenario's key (`indexByMatchKey`). */
	index: ReadonlyMap<string, AnyTreeRecord>
	/** Every uuid the source holds: an instance lineage not among them names nothing the template holds. */
	sourceUuids: ReadonlySet<string>
	matchKey: MatchKey
}
