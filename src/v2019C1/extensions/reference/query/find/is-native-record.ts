import { resolveDefinition } from '@dialecte/core/utils'

import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'

import type { AnyRawRecord, AnyTrackedRecord } from '@dialecte/core'

/**
 * Whether a record is the element of the dialecte its tag names, not a vendor element sharing that local name: it is
 * defined by the dialecte in the namespace it carries. Where it sits is not judged here (see `isNativeStep`).
 */
export function isNativeRecord(record: AnyRawRecord | AnyTrackedRecord): boolean {
	const definition = resolveDefinition({ dialecteConfig: SCL_DIALECTE_CONFIG, record })
	return record.namespace.uri === definition?.namespace.uri
}
