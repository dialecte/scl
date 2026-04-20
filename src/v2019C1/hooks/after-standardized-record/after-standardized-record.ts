import { enforceUuidAttribute } from './uuid-attribute'

import { Scl } from '@/v2019C1'

/**
 * After a record is standardized, enforce a valid UUID attribute where the
 * element definition supports one. See uuid-attribute.ts for details.
 */
export function afterStandardizedRecord<GenericElement extends Scl.ElementsOf>(params: {
	record: Scl.RawRecord<GenericElement>
}): Scl.RawRecord<GenericElement> {
	return enforceUuidAttribute(params)
}
