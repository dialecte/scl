import { cloneTree } from './primitives/clone-tree'

import { importTypes } from '@/v2019C1/extensions/data-model/transaction'

import type { ImportDeepParams, ImportDeepResult } from './deep.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Import an element subtree into a target document together with its type closure:
 *
 * 1. clone the subtree under `targetParent` (with optional `omit` / `strip` /
 *    `promoteRoot`);
 * 2. `withTypes` (default `true`) — content-addressed **type** closure: reconcile
 *    the LN/LNode type closure (reuse / preserve / fork) and repoint the cloned
 *    instances' `lnType` through the clone mappings.
 *
 * `deep` is a faithful subtree copy: it does **not** follow forward uuid references.
 * Reference rewiring is the caller's responsibility (recipes place same-domain
 * satellites by ancestry; cross-domain/lineage rewiring is plan-driven). Uuid
 * references inside the clone are remapped by the `afterDeepClone` hook.
 */
export async function deep(
	tx: Core.Transaction<Config>,
	params: ImportDeepParams,
): Promise<ImportDeepResult> {
	const {
		sourceQuery,
		ref,
		targetParent,
		withTypes = true,
		omit,
		strip = false,
		promoteRoot,
	} = params

	const clone = await cloneTree(tx, { sourceQuery, ref, targetParent, omit, strip, promoteRoot })
	if (!clone) throw new Error(`extraction.deep: source element not found: ${ref.tagName}#${ref.id}`)

	let typeIdRemap = new Map<string, string>()
	if (withTypes) {
		const records = await collectLogicalNodes(sourceQuery, ref)
		if (records.length > 0) {
			const result = await importTypes(tx, {
				sourceQuery,
				records,
				cloneMappings: clone.mappings,
			})
			typeIdRemap = result.idRemap
		}
	}

	return { record: clone.record, typeIdRemap, recordMappings: clone.mappings }
}

/** All `LNode`/`LN` records under (and including) the imported subtree. */
async function collectLogicalNodes(
	sourceQuery: Core.Query<Config>,
	ref: Scl.Ref<Scl.ElementsOf>,
): Promise<(Scl.TrackedRecord<'LNode'> | Scl.TrackedRecord<'LN'>)[]> {
	const { LNode = [] } = await sourceQuery.findDescendants(ref, { collect: 'LNode' })
	const { LN = [] } = await sourceQuery.findDescendants(ref, { collect: 'LN' })
	return [...LNode, ...LN]
}
