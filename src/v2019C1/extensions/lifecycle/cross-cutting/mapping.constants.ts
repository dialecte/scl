import type { MappingPolicy } from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'

/**
 * The CROSS-CUTTING shared elements: a variable or a behaviour description is held once by the
 * project and applies to several elements. A source one maps onto the project's rather than being
 * copied. Where it lands is resolved, listed, and not the consumer's to choose.
 */
export const CROSS_CUTTING_MAPPING_POLICIES = [
	{ tagName: 'Variable', key: 'name', selectable: false },
	{ tagName: 'BehaviorDescription', key: 'name', selectable: false },
] as const satisfies readonly MappingPolicy[]
