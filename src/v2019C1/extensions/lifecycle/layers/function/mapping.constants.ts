import type { MappingPolicy } from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'

/**
 * The function layer's SHARED elements: a category is held once by the project and classifies
 * several functions. A source one maps onto the project's rather than being copied.
 */
export const FUNCTION_MAPPING_POLICIES = [
	{ tagName: 'FunctionCategory', key: 'name', selectable: true },
] as const satisfies readonly MappingPolicy[]
