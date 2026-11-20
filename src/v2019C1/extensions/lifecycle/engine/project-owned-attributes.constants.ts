import {
	SPECIFIED_IED_NAME_ATTRIBUTE,
	SPECIFIED_LD_INST_ATTRIBUTE,
} from '@/v2019C1/constants/lnode-spec-naming'
import { LNODE_BINDING_ATTRIBUTES, TYPE_ID_REF_ATTRIBUTES } from '@/v2019C1/extensions/reference'
import { SOURCE_ATTRIBUTES_BY_TAG } from '@/v2019C1/hooks/shared/input-source.constants'

import type { KeptAttributeReason } from './diff.types'
import type { ProjectOwnedAttributes } from './project-owned-attributes.types'

/** No attribute owned by the project: what a template compares and writes in full. */
export const NO_PROJECT_OWNED_ATTRIBUTES: ProjectOwnedAttributes = {
	attributes: new Set(),
	listedAsKept: new Map(),
}

/**
 * An LNode bound to an IED: its implementation (naming, `lnUuid`) is silent, it differs from the template by design. Its
 * type follows the template's.
 */
export const BOUND_LNODE_OWNED_ATTRIBUTES: ProjectOwnedAttributes = {
	attributes: new Set(LNODE_BINDING_ATTRIBUTES),
	listedAsKept: new Map(),
}

/**
 * The specified naming of an LNode specified on an IED: the IED and the logical device it names are written at the
 * commit from the specification IED its LNode is bound to (a template's placeholder renamed), silent like the LNode's
 * own binding.
 */
export const SPECIFIED_ON_IED_OWNED_ATTRIBUTES: ProjectOwnedAttributes = {
	attributes: new Set([SPECIFIED_IED_NAME_ATTRIBUTE, SPECIFIED_LD_INST_ATTRIBUTE]),
	listedAsKept: new Map(),
}

/** The type references of an LNode, each listed as kept on a bound LNode keeping its type. */
const BOUND_LNODE_TYPE_REFERENCES: ReadonlyMap<string, KeptAttributeReason> = new Map(
	(TYPE_ID_REF_ATTRIBUTES.get('LNode') ?? []).map((name): [string, KeptAttributeReason] => [
		name,
		'bound-logical-node',
	]),
)

/**
 * An LNode bound to an IED whose consumer keeps the type it holds: its implementation is silent, and a template changing
 * its type is a difference the update lists as kept and does not apply.
 */
export const BOUND_LNODE_KEEPING_ITS_TYPE: ProjectOwnedAttributes = {
	attributes: new Set([...LNODE_BINDING_ATTRIBUTES, ...BOUND_LNODE_TYPE_REFERENCES.keys()]),
	listedAsKept: BOUND_LNODE_TYPE_REFERENCES,
}

/**
 * An LNode bound to an IED in a fork whose consumer keeps the types of bound LNodes: its binding follows the newer
 * revision (re-targeted by its uuid), its type is kept and a template changing it is listed as kept.
 */
export const BOUND_LNODE_TYPE_KEPT_IN_A_FORK: ProjectOwnedAttributes = {
	attributes: new Set(BOUND_LNODE_TYPE_REFERENCES.keys()),
	listedAsKept: BOUND_LNODE_TYPE_REFERENCES,
}

/**
 * What an instance of a template configures where it sits, and so owns against a newer template: the file describing
 * the behaviour of a behaviour description, the value of a variable (set for the instance, or by the variant it
 * selected). An element a template update adds carries the template's value: nothing is configured for it yet.
 */
const INSTANCE_CONFIGURED_ATTRIBUTES: ReadonlyMap<string, readonly string[]> = new Map([
	['BehaviorDescription', ['fileReference']],
	['Variable', ['value']],
])

/** The attributes an instance configures, per tag, each listed as kept when a template changes it. */
export const INSTANCE_CONFIGURATION_OWNED_ATTRIBUTES: ReadonlyMap<string, ProjectOwnedAttributes> =
	new Map(
		[...INSTANCE_CONFIGURED_ATTRIBUTES].map(
			([tagName, names]): [string, ProjectOwnedAttributes] => [
				tagName,
				{
					attributes: new Set(names),
					listedAsKept: new Map(
						names.map((name): [string, KeptAttributeReason] => [name, 'instance-configuration']),
					),
				},
			],
		),
	)

/**
 * A control block whose revision the project raised above the template's: the template's lower revision is listed as
 * kept, never written (a configuration revision only rises).
 */
export const CONF_REV_ONLY_RISES: ProjectOwnedAttributes = {
	attributes: new Set(['confRev']),
	listedAsKept: new Map<string, KeptAttributeReason>([['confRev', 'conf-rev-only-rises']]),
}

/**
 * An input or output of an IED the project bound to a source: the source it names (the data and the control block
 * sending it) is the system configuration's, kept against a template, each difference listed as kept. Its internal
 * address, description, service and expected data (`pXxx`) are the template's.
 */
export const BOUND_INPUT_OWNED_ATTRIBUTES: ReadonlyMap<string, ProjectOwnedAttributes> = new Map(
	[...SOURCE_ATTRIBUTES_BY_TAG].map(([tagName, names]): [string, ProjectOwnedAttributes] => [
		tagName,
		{
			attributes: new Set(names),
			listedAsKept: new Map(
				names.map((name): [string, KeptAttributeReason] => [name, 'data-flow']),
			),
		},
	]),
)
