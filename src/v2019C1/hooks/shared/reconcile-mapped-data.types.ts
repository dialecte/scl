import type { Scl } from '@/v2019C1/config'
import type { MappedLNodes } from '@/v2019C1/extensions/reference/query/resolve/resolve-mapped-lnodes.types'

export type ReconcileMappedDataParams = {
	/** A `DOS` / `SDS` / `DAS` as it is now staged. Other tags are ignored. */
	record: Scl.RawRecord<Scl.ElementsOf>
	/**
	 * What implements each LNode, when the caller knows better than the store (a hook whose rewrite of an LNode's
	 * binding is not staged yet): see `resolveMappedDataAndDefault`.
	 */
	mappedLNodes?: MappedLNodes
}
