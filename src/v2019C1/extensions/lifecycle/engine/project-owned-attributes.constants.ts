import { LOCKED_LNODE_ATTRIBUTES, TYPE_ID_REF_ATTRIBUTES } from '@/v2019C1/extensions/reference'

import type { KeptAttributeReason } from './diff.types'
import type { ProjectOwnedAttributes } from './project-owned-attributes.types'

/** No attribute owned by the project: what a template compares and writes in full. */
export const NO_PROJECT_OWNED_ATTRIBUTES: ProjectOwnedAttributes = {
	attributes: new Set(),
	listedAsKept: new Map(),
}

/**
 * An LNode bound to an IED: its implementation (naming, `lnUuid`) is silent, it differs from the template by design;
 * its type reference is listed as kept, a template changing it is a difference the update does not apply.
 */
export const BOUND_LNODE_OWNED_ATTRIBUTES: ProjectOwnedAttributes = {
	attributes: LOCKED_LNODE_ATTRIBUTES,
	listedAsKept: new Map(
		(TYPE_ID_REF_ATTRIBUTES.get('LNode') ?? []).map((name): [string, KeptAttributeReason] => [
			name,
			'bound-logical-node',
		]),
	),
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
