import { wrapWithPrivateElementIfNeeded } from './private-wrapper'
import { setRefPaths } from './ref-paths'

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

	return [...privateOps, ...refPathOps]
}
