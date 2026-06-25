import { cloneAllReferencedTargets } from './primitives/clone-referenced'
import { cloneTree } from './primitives/clone-tree'

import { importTypes } from '@/v2019C1/extensions/data-model/transaction'

import type { ImportDeepParams, ImportDeepResult } from './deep.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Import an element subtree into a target document together with its closures:
 *
 * 1. `withReferences` (default `true`) — forward uuid-reference closure: clone
 *    referenced satellites that are missing in the target (create-if-missing).
 *    Done first so the cloned subtree's references remap onto the new satellites;
 * 2. clone the subtree under `targetParent` (with optional `omit` / `strip` /
 *    `promoteRoot`);
 * 3. `withTypes` (default `true`) — content-addressed **type** closure: reconcile
 *    the LN/LNode type closure (reuse / preserve / fork) and repoint the cloned
 *    instances' `lnType` through the clone mappings.
 *
 * Uuid references inside the clone are remapped by the `afterDeepClone` hook.
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
		withReferences = true,
		skipReferences,
		omit,
		strip = false,
		promoteRoot,
	} = params

	if (withReferences) {
		await cloneAllReferencedTargets(tx, {
			sourceQuery,
			scopeTagName: ref.tagName,
			scopeRef: ref,
			targetParent,
			skip: skipReferences,
			omit,
		})
	}

	const clone = await cloneTree(tx, { sourceQuery, ref, targetParent, omit, strip, promoteRoot })
	if (!clone) throw new Error(`extraction.deep: source element not found: ${ref.tagName}#${ref.id}`)

	let idRemap = new Map<string, string>()
	if (withTypes) {
		const records = await collectLogicalNodes(sourceQuery, ref)
		if (records.length > 0) {
			const result = await importTypes(tx, { sourceQuery, records, cloneMappings: clone.mappings })
			idRemap = result.idRemap
		}
	}

	return { record: clone.record, idRemap }
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
