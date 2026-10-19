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
