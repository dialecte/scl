import { extract } from '@/v2019C1/extensions/data-model/transaction'

import type { ImportDeepParams, ImportDeepResult } from './deep.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Import an element subtree into a target document, pulling in its referenced
 * **type closure** by default (content-addressed via `dataModel.extract`).
 *
 * The clone's uuid references are remapped by the `afterDeepClone` hook; the type
 * closure is reconciled (reuse / preserve / fork) and the cloned instances'
 * `lnType` repointed through the clone mappings.
 *
 * Resolving the broader uuid-reference closure (create-if-missing satellites) is
 * a later increment.
 */
export async function deep(
	tx: Core.Transaction<Config>,
	params: ImportDeepParams,
): Promise<ImportDeepResult> {
	const { sourceQuery, ref, targetParent, withTypes = true } = params

	const tree = await sourceQuery.getTree(ref)
	if (!tree) throw new Error(`import.deep: source element not found: ${ref.tagName}#${ref.id}`)

	// getTree's union includes 'SCL' (document root), which deepClone rejects as a
	// child; an imported subtree root is never the document root.
	const clone = await tx.deepClone(
		targetParent,
		tree as Scl.TreeRecord<Exclude<Scl.ElementsOf, 'SCL'>>,
	)

	let idRemap = new Map<string, string>()
	if (withTypes) {
		const records = await collectLogicalNodes(sourceQuery, ref)
		if (records.length > 0) {
			const result = await extract(tx, { sourceQuery, records, cloneMappings: clone.mappings })
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
