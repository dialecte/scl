import { enforceUuidAttribute } from './uuid-attribute'

import type * as Core from '@dialecte/core'

/**
 * After a record is standardized, enforce a valid UUID attribute where the
 * element definition supports one. See uuid-attribute.ts for details.
 */
export function afterStandardizedRecord<
	GenericConfig extends Core.AnyDialecteConfig,
	GenericElement extends Core.ElementsOf<GenericConfig>,
>(params: {
	record: Core.RawRecord<GenericConfig, GenericElement>
}): Core.RawRecord<GenericConfig, GenericElement> {
	return enforceUuidAttribute(params)
}
