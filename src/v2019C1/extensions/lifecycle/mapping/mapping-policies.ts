import { APPLICATION_MAPPING_POLICIES } from '@/v2019C1/extensions/lifecycle/layers/application/mapping.constants'
import { FUNCTION_MAPPING_POLICIES } from '@/v2019C1/extensions/lifecycle/layers/function/mapping.constants'

import type { MappingPolicy } from './mapping.types'

const MAPPING_POLICIES: readonly MappingPolicy[] = [
	...APPLICATION_MAPPING_POLICIES,
	...FUNCTION_MAPPING_POLICIES,
]

/** The mapping policy of a shared element, as declared by its layer — `undefined` for any other tag. */
export function findMappingPolicy(tagName: string): MappingPolicy | undefined {
	return MAPPING_POLICIES.find((policy) => policy.tagName === tagName)
}
