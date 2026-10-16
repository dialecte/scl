import { reconcileMinRequestedScdFileOnCreate } from './min-requested-scd-file'
import { wrapWithPrivateElementIfNeeded } from './private-wrapper'
import { setRefPaths } from './ref-paths'
import { writeTupleNamesOfCreated } from './tuple-references'

import { widen } from '@dialecte/core/helpers'

import {
	rebuildPathsOfNamedLNode,
	reconcileSignalSiblingPaths,
	signalName,
} from '@/v2019C1/hooks/shared'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

export async function afterCreated<
	GenericElement extends Scl.ElementsOf,
	GenericParentElement extends Scl.ParentsOf<GenericElement>,
>(params: {
	childRecord: Scl.RawRecord<GenericElement>
	parentRecord: Scl.RawRecord<GenericParentElement>
	query: Core.Query<Config>
}): Promise<Scl.Operation[]> {
	const { childRecord, parentRecord, query } = params

	const privateOps = await wrapWithPrivateElementIfNeeded({ childRecord, parentRecord, query })
	const refPathOps = await setRefPaths({ childRecord, query })
	const tupleNameOps = await writeTupleNamesOfCreated({ childRecord, query })
	const minRequestedScdFileOps = await reconcileMinRequestedScdFileOnCreate(query, { childRecord })
	const name = signalName(widen(childRecord))
	const siblingOps = name
		? await reconcileSignalSiblingPaths(query, {
				parent: { tagName: parentRecord.tagName, id: parentRecord.id } as Scl.Ref<Scl.ElementsOf>,
				tagName: childRecord.tagName,
				names: [name],
			})
		: []

	const namedLNodeOps = await rebuildPathsOfNamedLNode(query, {
		specNaming: widen(childRecord),
		holder: widen(parentRecord),
	})

	return [
		...privateOps,
		...refPathOps,
		...tupleNameOps,
		...minRequestedScdFileOps,
		...siblingOps,
		...namedLNodeOps,
	]
}
