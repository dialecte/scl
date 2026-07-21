import { addChildrenTo } from './primitives/add-children-to'
import { cloneTree } from './primitives/clone-tree'

import { importTypes } from '@/v2019C1/extensions/data-model/transaction'

import type { ImportDeepParams, ImportDeepResult } from './deep.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Import an element subtree into a target document together with its type closure:
 *
 * 1. clone the subtree under `targetParent` (with optional `omit` / `strip` /
 *    `retagRoot`);
 * 2. `withTypes` (default `true`) — content-addressed **type** closure: reconcile
 *    the LN/LNode type closure (reuse / preserve / fork) and repoint the cloned
 *    instances' `lnType` through the clone mappings.
 *
 * When the root being cloned is a `Private` and `targetParent` already holds a
 * `Private` of the same `type`, the source Private's children are ADDED to the
 * existing one instead of creating a duplicate wrapper (one Private per type per
 * parent is a structural invariant, also enforced on single creates by the
 * after-created private-wrapper hook).
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
		retagRoot,
	} = params

	const mergeTarget = await resolveExistingPrivateMergeTarget(tx, {
		sourceQuery,
		ref,
		targetParent,
	})

	let record: Scl.RawRecord<Scl.ElementsOf>
	let mappings: Scl.CloneMapping[]
	if (mergeTarget) {
		mappings = await addChildrenTo(tx, {
			sourceQuery,
			source: ref,
			target: mergeTarget,
			omit,
			strip,
		})
		const existing = await tx.getRecord(mergeTarget)
		if (!existing) throw new Error(`transplant.deep: merge target vanished: ${mergeTarget.id}`)
		record = existing as unknown as Scl.RawRecord<Scl.ElementsOf>
	} else {
		const clone = await cloneTree(tx, { sourceQuery, ref, targetParent, omit, strip, retagRoot })
		if (!clone)
			throw new Error(`transplant.deep: source element not found: ${ref.tagName}#${ref.id}`)
		record = clone.record
		mappings = clone.mappings
	}

	let typeIdRemap = new Map<string, string>()
	if (withTypes) {
		const records = await collectLogicalNodes(sourceQuery, ref)
		if (records.length > 0) {
			const result = await importTypes(tx, {
				sourceQuery,
				records,
				cloneMappings: mappings,
			})
			typeIdRemap = result.idRemap
		}
	}

	return { record, typeIdRemap, recordMappings: mappings }
}

/**
 * When the root is a `Private`, find an existing `Private` of the same `type` under
 * `targetParent` to merge into (or `undefined` for the normal clone path).
 */
async function resolveExistingPrivateMergeTarget(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		ref: Scl.Ref<Scl.ElementsOf>
		targetParent: Scl.Ref<Scl.ElementsOf>
	},
): Promise<Scl.Ref<'Private'> | undefined> {
	const { sourceQuery, ref, targetParent } = params
	if (ref.tagName !== 'Private') return undefined

	const sourceType = (await sourceQuery.any.getAttributes(ref)).type
	if (!sourceType) return undefined

	const parentRecord = await tx.getRecord(targetParent)
	const privateChildren =
		parentRecord?.children.filter((child) => child.tagName === 'Private') ?? []
	for (const privateChild of privateChildren) {
		const type = (await tx.any.getAttributes(privateChild)).type
		if (type === sourceType) return { tagName: 'Private', id: privateChild.id }
	}
	return undefined
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
