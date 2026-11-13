import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/** A read surface shared by the diff (Query) and reconcile (Transaction) sides. */
export type LineageReader = Core.Query<Config> | Core.Transaction<Config>

/** An element of the project carrying a uuid an instance reference names, and its lineage under the scenario's key. */
export type TargetLineage = {
	tagName: string
	/** Its `templateUuid` (the source element it was made from); `undefined` when it carries none. */
	lineage: string | undefined
}

/**
 * Per uuid the references of an instance name, the elements of the project carrying it: read once per diff or
 * reconcile, so a reference is brought back to the source without a read of its own. Under the `uuid` key a uuid is
 * its own lineage, listed only when an element carries it.
 */
export type TargetLineages = ReadonlyMap<string, readonly TargetLineage[]>
