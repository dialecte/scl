import { DEFINITION } from '@/v2019C1/definition'

import type { Scl } from '@/v2019C1/config'

/** The elements that hold logical nodes and become logical devices: functions, equipment functions and their subfunctions. */
export const FUNCTION_LIKE_TAGS = [
	'Function',
	'SubFunction',
	'EqFunction',
	'EqSubFunction',
] as const satisfies readonly Scl.ParentsOf<'LNode'>[]

/** The subfunction tags: a function-like holding one of them is not a leaf. */
export const SUB_FUNCTION_TAGS = ['SubFunction', 'EqSubFunction'] as const

/** The root elements of the process section: an LNode built into an IED sits below one of them. */
export const PROCESS_ROOT_TAGS = ['Substation', 'Line', 'Process'] as const

/** The longest logical device name (IED name followed by the inst), from the definition. */
export const LDEVICE_NAME_MAX = DEFINITION.LDevice.attributes.details.ldName.type.facets.maxLength

/** The longest prefix followed by the lnInst of a logical node. */
export const LN_PREFIX_INST_MAX = 12

/** The longest prefix, lnClass and lnInst together, when the prefix comes from a leaf subfunction. */
export const LN_DERIVED_NAME_MAX = 13

/** The LPHD a built logical device gets when no logical node gives one. */
export const ADDED_LPHD = { prefix: '', lnClass: 'LPHD', inst: '1' } as const

/** The LN0 every logical device holds. */
export const LN0_IDENTITY = { prefix: '', lnClass: 'LLN0', inst: '' } as const

/** Why a build is refused, one per rule. */
export const BUILD_REFUSAL_REASONS = [
	'not-specification-ied',
	'lnode-outside-process',
	'server',
	'no-function',
	'ld-name',
	'ln-name',
	'ln-collision',
	'type-missing',
	'type-mismatch',
	'open-value-invalid',
] as const

/** The open points `buildIed` declares. */
export const BUILD_OPEN_POINTS = ['ldInst', 'lnType'] as const
