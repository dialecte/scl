import { widen } from '@dialecte/core/helpers'

import {
	MAPPED_DATA_DEFAULT_ATTRIBUTES,
	PATH_CONTRIBUTING_ATTRIBUTES,
} from '@/v2019C1/extensions/reference'
import { derivedAttributesFollowing } from '@/v2019C1/extensions/reference/query/build/compose-derived-attributes'
import { readAttribute } from '@/v2019C1/helpers'
import {
	followDataSetRename,
	followTupleTargetRename,
	hasAttributeChange,
	mirrorSpecifiedNaming,
	rebuildOwnPathAttributes,
	rebuildPathsBelow,
	rebuildReferencesTo,
	reconcileLNodeBinding,
	reconcileMappedData,
	reconcileMappedDataBelow,
	reconcileReferrerRefPaths,
	reconcileSignalAddresses,
	rebuildPathsOfNamedLNode,
	specifiedNamingChanged,
} from '@/v2019C1/hooks/shared'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * When a target element is updated (e.g. renamed), recompute path attrs
 * on all ref elements pointing to it via UUID.
 *
 * Also handles ancestor renames: when a path-contributing attribute changes,
 * rebuilds ref paths for all descendant targets (e.g. renaming a Bay updates
 * FunctionRef paths that pass through it).
 *
 * When the updated record is a `DOS`/`SDS`/`DAS`, stores its implementation in canonical
 * form; when an `LNode` or a `DOS`/`SDS` change moves the default of the data below it, does
 * the same for every record below that names its implementation. When it
 * is any other referrer whose binding attributes (target uuid or companion DO/DA
 * names) changed, rebuilds its own path so name and uuid references stay in
 * agreement (the referrer-side counterpart of the after-created hook).
 */
export async function updateRefPaths<GenericElement extends Scl.ElementsOf>(params: {
	query: Core.Query<Config>
	oldRecord: Scl.RawRecord<GenericElement>
	newRecord: Scl.RawRecord<GenericElement>
}): Promise<Scl.Operation[]> {
	const { oldRecord, newRecord, query } = params
	const operations: Scl.Operation[] = []

	const previous = widen(oldRecord)
	const current = widen(newRecord)

	const mappedDataOp = await reconcileMappedData(query, { record: current })
	if (mappedDataOp) operations.push(mappedDataOp)

	const mappedDataDefaultAttributes = MAPPED_DATA_DEFAULT_ATTRIBUTES.get(current.tagName)
	if (
		mappedDataDefaultAttributes &&
		hasAttributeChange({
			oldRecord: previous,
			newRecord: current,
			names: mappedDataDefaultAttributes,
		})
	) {
		operations.push(...(await reconcileMappedDataBelow(query, { record: current })))
	}

	const lnodeBindingOps = await reconcileLNodeBinding({
		oldRecord: previous,
		newRecord: current,
		query,
	})
	operations.push(...lnodeBindingOps)
	const signalAddressOps = await reconcileSignalAddresses(query, {
		oldRecord: previous,
		newRecord: current,
		bindingOperations: lnodeBindingOps,
	})
	operations.push(...signalAddressOps)
	operations.push(
		...(await mirrorSpecifiedNaming(query, { oldRecord: previous, newRecord: current })),
	)

	const referrerOps = await reconcileReferrerRefPaths({
		oldRecord: previous,
		newRecord: current,
		query,
	})
	operations.push(...referrerOps)

	const target = { tagName: newRecord.tagName, id: newRecord.id } as Scl.Ref<Scl.ElementsOf>
	const referenceOps = await rebuildReferencesTo(query, { target })
	operations.push(...referenceOps)

	const pathChanged = hasPathAttributeChange(oldRecord, newRecord)
	if (pathChanged || ownPathAttributeChanged({ oldRecord: previous, newRecord: current })) {
		const ownOps = await rebuildOwnPathAttributes(query, { element: target })
		operations.push(...ownOps)
	}
	if (pathChanged) {
		const belowOps = await rebuildPathsBelow(query, { record: target })
		operations.push(...belowOps)
	}

	if (specifiedNamingChanged({ oldRecord: previous, newRecord: current })) {
		operations.push(...(await rebuildPathsOfNamedLNode(query, { specNaming: current })))
	}

	const tupleOperations = await followTupleTargetRename(query, {
		oldRecord: previous,
		newRecord: current,
	})
	operations.push(...tupleOperations)
	const dataSetOperations = await followDataSetRename(query, {
		oldRecord: previous,
		newRecord: current,
	})
	operations.push(...dataSetOperations)

	return operations
}

/** Whether an attribute the record writes from its own path (a node's `pathName`) was edited. */
function ownPathAttributeChanged(params: {
	oldRecord: Scl.RawRecord<Scl.ElementsOf>
	newRecord: Scl.RawRecord<Scl.ElementsOf>
}): boolean {
	const { oldRecord, newRecord } = params
	const derived = derivedAttributesFollowing({ tagName: newRecord.tagName, follows: 'self' })
	if (!derived) return false
	const names = derived.attributes.map((attribute) => attribute.name)
	return hasAttributeChange({ oldRecord, newRecord, names })
}

function hasPathAttributeChange<GenericElement extends Scl.ElementsOf>(
	oldRecord: Scl.RawRecord<GenericElement>,
	newRecord: Scl.RawRecord<GenericElement>,
): boolean {
	for (const attrName of PATH_CONTRIBUTING_ATTRIBUTES) {
		const oldVal = readAttribute({
			record: oldRecord,
			name: attrName,
			defaults: 'none',
			fullObject: true,
		})?.value
		const newVal = readAttribute({
			record: newRecord,
			name: attrName,
			defaults: 'none',
			fullObject: true,
		})?.value
		if (oldVal !== newVal) return true
	}
	return false
}
