import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'
import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'

import type { ProcessOptionTags } from './ied-process.types'
import type { Scl } from '@/v2019C1/config'

/** The roots of the process part an IED is exported with: a function template is no part of it. */
export const PROCESS_ROOT_TAGS: ReadonlySet<string> = new Set(['Substation', 'Line', 'Process'])

/**
 * What the process part holds only when it leads to an LNode of the IED, or the frame needs it: the LNode, and every
 * element that may hold one (a level, an equipment, a function, a connectivity node).
 */
export const LNODE_SCOPE_TAGS: ReadonlySet<string> = new Set([
	'LNode',
	...SCL_DIALECTE_CONFIG.ancestors.LNode,
])

/** The parts of an equipment, written with it whenever it is: windings, tap changers, sub-equipment (its phases). */
export const EQUIPMENT_PART_TAGS: ReadonlySet<string> = new Set([
	'TransformerWinding',
	'TapChanger',
	'SubEquipment',
])

/** The references from an equipment to the connectivity node it connects to (`Terminal`, `NeutralPoint`). */
export const CONNECTION_REFERENCE_TAGS: ReadonlySet<string> = new Set(
	Object.entries(UUID_REFERENCE_PAIRS)
		.filter(function namesNode([, pairs]) {
			return pairs.some(function toNode(pair) {
				return (pair.target as readonly string[]).includes('ConnectivityNode')
			})
		})
		.map(function tagOf([tagName]) {
			return tagName
		}),
)

/** The specifications of the inputs and outputs of an LNode: a link of theirs to what is not written is cut, and said. */
export const SPECIFICATION_LINK_TAGS: ReadonlySet<string> = new Set(['SourceRef', 'ControlRef'])

/** The data specifications of an LNode, whose mapping to the implementing logical node is no part of a specification. */
export const MAPPING_DOCUMENTATION_TAGS = ['DOS', 'SDS', 'DAS'] as const

/** What an export option leaves out when it is `false`, by option. */
export const PROCESS_OPTION_TAGS: ProcessOptionTags = {
	applications: 'Application',
	allocationRoles: 'AllocationRole',
	powerSystemRelations: 'PowerSystemRelations',
}

/** What holds functions by reference: written only while it names a function the file holds. */
export const FUNCTION_REFERENCE_HOLDER_TAGS: ReadonlySet<string> = new Set([
	'Application',
	'FunctionRole',
	'AllocationRole',
])

/** The service of a specified flow both of whose LNodes the exported IED implements: no flow between devices. */
export const INTERNAL_SERVICE = 'Internal' satisfies NonNullable<
	Scl.AttributesValueObjectOf<'SourceRef'>['service']
>

/** The services a flow inside the exported IED keeps: already internal, or wired. */
export const SERVICES_KEPT_INSIDE: ReadonlySet<string> = new Set([INTERNAL_SERVICE, 'Wired'])
