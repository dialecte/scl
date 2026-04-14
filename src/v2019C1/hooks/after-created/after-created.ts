import { wrapWithPrivateElementIfNeeded } from './private-wrapper'

import type * as Core from '@dialecte/core'

export async function afterCreated<
	GenericConfig extends Core.AnyDialecteConfig,
	GenericElement extends Core.ElementsOf<GenericConfig>,
	GenericParentElement extends Core.ParentsOf<GenericConfig, GenericElement>,
>(params: {
	childRecord: Core.RawRecord<GenericConfig, GenericElement>
	parentRecord: Core.RawRecord<GenericConfig, GenericParentElement>
	query: Core.Query<GenericConfig>
}): Promise<Core.Operation<GenericConfig>[]> {
	const { childRecord, parentRecord, query } = params

	return wrapWithPrivateElementIfNeeded({ childRecord, parentRecord, query })
}
