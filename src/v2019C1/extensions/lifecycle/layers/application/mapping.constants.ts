import type { MappingPolicy } from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'

/**
 * The application layer's SHARED elements: elements the project holds once and several
 * applications refer to. A source one maps onto the project's rather than being copied.
 */
export const APPLICATION_MAPPING_POLICIES = [
	{ tagName: 'AllocationRole', key: 'name' },
] as const satisfies readonly MappingPolicy[]
