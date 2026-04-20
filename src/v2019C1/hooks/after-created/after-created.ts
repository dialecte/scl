import { wrapWithPrivateElementIfNeeded } from './private-wrapper'
import { setRefPaths } from './ref-paths'

import type { Scl } from '@/v2019C1/config'

export async function afterCreated<
	GenericElement extends Scl.ElementsOf,
	GenericParentElement extends Scl.ParentsOf<GenericElement>,
>(params: {
	childRecord: Scl.RawRecord<GenericElement>
	parentRecord: Scl.RawRecord<GenericParentElement>
	query: Scl.Query
}): Promise<Scl.Operation[]> {
	const { childRecord, parentRecord, query } = params

	const privateOps = await wrapWithPrivateElementIfNeeded({ childRecord, parentRecord, query })
	const refPathOps = await setRefPaths({ childRecord, query })

	return [...privateOps, ...refPathOps]
}
