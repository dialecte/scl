import { SCL_DIALECTE_CONFIG } from '@/v2019C1/config'

import type { IedCollisions } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { ScenarioPolicy } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'

/**
 * What a first placement does with a name the project holds when the consumer says nothing, by the identity it places
 * with: a template's instance and a copy are named by the project (numbered: a copy sits beside its original), a file
 * keeping its identity is asked for a name.
 */
export const DEFAULT_IED_COLLISIONS: Readonly<
	Record<ScenarioPolicy['placementIdentity'], IedCollisions>
> = {
	'stamp-template': 'number',
	keep: 'refuse',
	copy: 'number',
}

/** The attribute an IED is named by under the project root. */
export const IED_NAME_ATTRIBUTE = 'name'

/** The IED name type (`tIEDName`): what a name chosen for a placed IED is checked against. */
export const IED_NAME_TYPE = SCL_DIALECTE_CONFIG.definition.IED.attributes.details.name.type

/** The suffix of the first numbered name, the engine's numbering: `TEMPLATE` proposed as `TEMPLATE_1`. */
export const FIRST_NUMBER_SUFFIX = '_1'
