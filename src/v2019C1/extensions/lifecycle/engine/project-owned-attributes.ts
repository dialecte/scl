import { NO_PROJECT_OWNED_ATTRIBUTES } from './project-owned-attributes.constants'

import { isAssignedToIed } from '@/v2019C1/extensions/data-model/naming/lnode-naming'
import { LOCKED_LNODE_ATTRIBUTES } from '@/v2019C1/extensions/reference'

/**
 * The attributes of a project element a template neither compares nor writes, whatever it holds:
 * an LNode bound to an IED keeps where it is implemented and its type (its specification is its
 * `LNodeSpecNaming`, compared as a child). Read from the project element's own attributes, so the
 * report and the apply decide alike.
 */
export function projectOwnedAttributes(params: {
	tagName: string
	instanceAttributes: Readonly<Record<string, string | undefined>>
}): ReadonlySet<string> {
	const { tagName, instanceAttributes } = params
	if (tagName !== 'LNode') return NO_PROJECT_OWNED_ATTRIBUTES
	return isAssignedToIed({ iedName: instanceAttributes.iedName })
		? LOCKED_LNODE_ATTRIBUTES
		: NO_PROJECT_OWNED_ATTRIBUTES
}
