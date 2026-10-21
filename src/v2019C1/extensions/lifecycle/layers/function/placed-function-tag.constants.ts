import type { Scl } from '@/v2019C1/config'

/** The tags a function placed by the lifecycle carries: a function, or a subfunction under a function. */
export const PLACED_FUNCTION_TAGS = [
	'Function',
	'SubFunction',
] as const satisfies readonly Scl.ElementsOf[]
