import { TOPOLOGY_STRUCTURAL_TAGS } from '@/v2019C1/constants'
import { PROCESS_ROOT_TAGS } from '@/v2019C1/extensions/lifecycle/layers/ied/ied-process.constants'

/**
 * The elements of a template ISD's process part keeping the lineage they carry, with what they hold: the functions and
 * applications, instances of the function and application templates they were made from. Everything else loses it.
 */
export const TEMPLATE_LINEAGE_ROOT_TAGS: ReadonlySet<string> = new Set([
	'Function',
	'EqFunction',
	'Application',
])

/** The levels of a template ISD's process part named `TEMPLATE`: its substation, line and process levels. */
export const TEMPLATE_NAMED_LEVEL_TAGS: ReadonlySet<string> = new Set([
	...TOPOLOGY_STRUCTURAL_TAGS,
	...PROCESS_ROOT_TAGS,
])
