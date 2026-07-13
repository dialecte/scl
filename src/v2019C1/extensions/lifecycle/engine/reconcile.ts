import { toRef } from '@dialecte/core/helpers'

import { writeIdentity } from '@/v2019C1/extensions/identity/transaction'
import { deep } from '@/v2019C1/extensions/lifecycle/transplant/transaction'

import type { Config } from '@/v2019C1/config'
import type { Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * Engine apply-core (ENGINE.md §3/§8): reconcile an updated template subtree
 * (`sourceRootRef`) ONTO an existing instance (`instanceRootRef`) instead of
 * duplicating it. Elements match by `templateUuid` (= the source element's
 * `uuid`, immutable across template versions):
 *
 *  - matched element    -> update its user-visible attributes in place
 *  - new source element -> graft its subtree under the matched parent
 *    (`transplant.deep` + `writeIdentity` stamp)
 *  - instance element whose template lineage no longer exists in the source
 *    -> delete
 *
 * This is the "project then diff" apply half: because the instance is already
 * in instance-space, comparing source (template) to instance is clean once
 * identity + the project-owned `name` are excluded. Deliberately scoped: no
 * reference reconciliation and no multi-instance anchor disambiguation yet.
 */
const IDENTITY_ATTRS = new Set(['uuid', 'templateUuid', 'originUuid'])

export async function reconcile(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		sourceRootRef: AnyRefOrRecord
		instanceRootRef: AnyRefOrRecord
	},
): Promise<void> {
	const { sourceQuery, sourceRootRef, instanceRootRef } = params

	const sourceTree = await sourceQuery.any.getTree(sourceRootRef)
	const instanceTree = await tx.any.getTree(instanceRootRef)
	if (!sourceTree || !instanceTree) return

	const index = new Map<string, AnyTreeRecord>()
	await indexByTemplateUuid(tx, instanceTree, index)

	const sourceUuids = new Set<string>()
	await collectUuids(sourceQuery, sourceTree, sourceUuids)

	// root + descendants: update matched in place, graft new
	await updateMatchedAttributes(tx, sourceQuery, instanceTree, sourceTree)
	await reconcileChildren(tx, sourceQuery, sourceTree, instanceTree, index)

	// removed from the template: delete instance elements whose lineage is gone
	await deleteRemoved(tx, instanceTree, sourceUuids)
}

async function reconcileChildren(
	tx: Core.Transaction<Config>,
	sourceQuery: Core.Query<Config>,
	sourceNode: AnyTreeRecord,
	instanceParent: AnyTreeRecord,
	index: Map<string, AnyTreeRecord>,
): Promise<void> {
	for (const sourceChild of sourceNode.tree) {
		const sourceUuid = await sourceQuery.any.getAttribute(sourceChild, { name: 'uuid' })
		const matched = sourceUuid ? index.get(sourceUuid) : undefined

		if (matched) {
			await updateMatchedAttributes(tx, sourceQuery, matched, sourceChild)
			await reconcileChildren(tx, sourceQuery, sourceChild, matched, index)
			continue
		}

		const { recordMappings } = await deep(tx, {
			sourceQuery,
			ref: toRef(sourceChild) as unknown as Scl.Ref<Scl.ElementsOf>,
			targetParent: toRef(instanceParent) as unknown as Scl.Ref<Scl.ElementsOf>,
			strip: false,
		})
		await writeIdentity(tx, { mappings: recordMappings, mode: 'stamp-template' })
	}
}

async function deleteRemoved(
	tx: Core.Transaction<Config>,
	instanceNode: AnyTreeRecord,
	sourceUuids: ReadonlySet<string>,
): Promise<void> {
	const toDelete: AnyTreeRecord[] = []
	await collectRemoved(tx, instanceNode, sourceUuids, toDelete)

	for (const record of toDelete) {
		// Idempotent: deleting a parent cascades its children, so a later child
		// ref may already be gone.
		const live = await tx.any.getRecord(record)
		if (live) await tx.any.delete(record)
	}
}

async function collectRemoved(
	tx: Core.Transaction<Config>,
	node: AnyTreeRecord,
	sourceUuids: ReadonlySet<string>,
	out: AnyTreeRecord[],
): Promise<void> {
	const templateUuid = await tx.any.getAttribute(node, { name: 'templateUuid' })
	if (templateUuid && !sourceUuids.has(templateUuid)) {
		out.push(node)
		return // its subtree cascades with it; do not descend
	}
	for (const child of node.tree) await collectRemoved(tx, child, sourceUuids, out)
}

async function updateMatchedAttributes(
	tx: Core.Transaction<Config>,
	sourceQuery: Core.Query<Config>,
	instanceRecord: AnyTreeRecord,
	sourceNode: AnyTreeRecord,
): Promise<void> {
	const desired = visibleAttributes(await sourceQuery.any.getAttributes(sourceNode))
	const current = visibleAttributes(await tx.any.getAttributes(instanceRecord))

	const updates: Record<string, string> = {}
	for (const [name, value] of Object.entries(desired)) {
		if (current[name] !== value) updates[name] = value
	}
	if (Object.keys(updates).length > 0) {
		await tx.any.update(instanceRecord, { attributes: updates })
	}
}

/** Drop identity + the project-owned `name` from an attribute map. */
function visibleAttributes(attributes: Record<string, string>): Record<string, string> {
	const visible: Record<string, string> = {}
	for (const [name, value] of Object.entries(attributes)) {
		if (IDENTITY_ATTRS.has(name) || name === 'name') continue
		visible[name] = value
	}
	return visible
}

async function indexByTemplateUuid(
	tx: Core.Transaction<Config>,
	node: AnyTreeRecord,
	index: Map<string, AnyTreeRecord>,
): Promise<void> {
	const templateUuid = await tx.any.getAttribute(node, { name: 'templateUuid' })
	if (templateUuid) index.set(templateUuid, node)
	for (const child of node.tree) await indexByTemplateUuid(tx, child, index)
}

async function collectUuids(
	sourceQuery: Core.Query<Config>,
	node: AnyTreeRecord,
	out: Set<string>,
): Promise<void> {
	const uuid = await sourceQuery.any.getAttribute(node, { name: 'uuid' })
	if (uuid) out.add(uuid)
	for (const child of node.tree) await collectUuids(sourceQuery, child, out)
}
