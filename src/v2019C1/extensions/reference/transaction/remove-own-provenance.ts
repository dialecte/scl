import { findOwnProvenance } from '@/v2019C1/extensions/reference/query/provenance/find-own-provenance'

import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord } from '@dialecte/core'

/**
 * Remove the source-file references an element records for itself (its own `FunctionSclRef` / `ApplicationSclRef`,
 * see `findOwnProvenance`): the element is no longer what that file placed. The references of the elements it holds
 * are left.
 *
 * @intent forget which file an element was placed from, remove its own source-file references after it stops being that file's
 */
export async function removeOwnProvenance(
	tx: Core.Transaction<Config>,
	params: { element: AnyRefOrRecord },
): Promise<void> {
	// each reference sits in a wrapper of its own (a wrapper holds one): each wrapper is listed once
	for (const { wrapper } of await findOwnProvenance(tx, params)) await tx.any.delete(wrapper)
}
