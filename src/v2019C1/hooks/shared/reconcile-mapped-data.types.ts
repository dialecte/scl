import type { Scl } from '@/v2019C1/config'

export type ReconcileMappedDataParams = {
	/** A `DOS` / `SDS` / `DAS` as it is now staged. Other tags are ignored. */
	record: Scl.RawRecord<Scl.ElementsOf>
}
