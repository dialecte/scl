import { findOwnProvenance } from '@/v2019C1/extensions/reference/query/provenance/find-own-provenance'

import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

/**
 * Whether an element records the file it was placed from (its own `FunctionSclRef` / `ApplicationSclRef`): it was
 * placed from a file of its own, not as a part of a larger template — the source file of the element below it that
 * records one (a subfunction placed from a function file) is that element's, not this one's.
 */
export async function carriesOwnProvenance(
	reader: Core.Query<Config> | Core.Transaction<Config>,
	element: AnyRefOrRecord,
): Promise<boolean> {
	return (await findOwnProvenance(reader, { element })).length > 0
}
