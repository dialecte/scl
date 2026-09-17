import { restoreClonedUuids, writeIdentity } from '@/v2019C1/extensions/identity/transaction'
import { applyUuidRemap } from '@/v2019C1/extensions/reference/transaction'

import type { Config, Scl } from '@/v2019C1/config'
import type { IdentityMode } from '@/v2019C1/extensions/identity/transaction'
import type * as Core from '@dialecte/core'

/**
 * Finalize the identity of a freshly cloned subtree in ONE place: write the lineage
 * ({@link writeIdentity}) then fix up the reference uuids for the mode.
 *
 * The post-step is a strict binary, so this is the single seam every clone-then-place path
 * shares (instantiate/update/reconcile), instead of duplicating `writeIdentity(...)` +
 * `keep ? restore : remap` at each site:
 *  - `keep` (fork) converges the clone to the source revision's uuids → {@link restoreClonedUuids}
 *    (no ref remap: refs were copied verbatim in source space and stay coherent).
 *  - `strip` / `stamp-template` / `preserve` all keep the fresh clone uuid → {@link applyUuidRemap}
 *    repoints the subtree's internal refs onto those fresh uuids.
 *
 * Canonical order is write-lineage THEN ref-fixup: the two touch disjoint attribute sets
 * (`writeIdentity` reads the source attributes and writes only lineage; `applyUuidRemap` reads
 * the fresh element uuids and writes only reference attributes), so the order is free.
 */
export async function finalizeClonedIdentity(
	tx: Core.Transaction<Config>,
	params: { mappings: readonly Scl.CloneMapping[]; mode: IdentityMode },
): Promise<void> {
	const { mappings, mode } = params

	await writeIdentity(tx, { mappings, mode })

	switch (mode) {
		case 'keep':
			await restoreClonedUuids(tx, { mappings })
			return
		case 'strip':
		case 'stamp-template':
		case 'preserve':
			await applyUuidRemap(tx, { mappings })
			return
		default:
			return assertExhaustive(mode)
	}
}

/** Compile-time guard: a new `IdentityMode` cannot be added without choosing its post-step. */
function assertExhaustive(mode: never): never {
	throw new Error(`finalizeClonedIdentity: unhandled identity mode ${String(mode)}`)
}
