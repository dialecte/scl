import {
	BOUND_LNODE_OWNED_ATTRIBUTES,
	INSTANCE_CONFIGURATION_OWNED_ATTRIBUTES,
	NO_PROJECT_OWNED_ATTRIBUTES,
} from './project-owned-attributes.constants'

import { throwDialecteError } from '@dialecte/core'

import { isAssignedToIed } from '@/v2019C1/extensions/data-model/naming/lnode-naming'

import type { ProjectOwnedAttributes } from './project-owned-attributes.types'
import type { NamesFollow } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'

/**
 * The attributes of a project element a template neither compares into the decisions nor writes, whatever it holds,
 * each difference still listed as kept:
 * - an LNode bound to an IED keeps where it is implemented and its type (its specification is its `LNodeSpecNaming`,
 *   compared as a child), in every scenario;
 * - an instance of a template keeps what it configures where it sits (`INSTANCE_CONFIGURATION_OWNED_ATTRIBUTES`: a
 *   behaviour description's file, a variable's value) — when its names are the project's (`namesFollow: 'project'`);
 *   a fork writes the newer revision's, as it does its names.
 *
 * Read from the project element's own attributes, so the report and the apply decide alike.
 */
export function projectOwnedAttributes(params: {
	tagName: string
	instanceAttributes: Readonly<Record<string, string | undefined>>
	namesFollow: NamesFollow
}): ProjectOwnedAttributes {
	const { tagName, instanceAttributes, namesFollow } = params
	if (tagName === 'LNode') {
		return isAssignedToIed({ iedName: instanceAttributes.iedName })
			? BOUND_LNODE_OWNED_ATTRIBUTES
			: NO_PROJECT_OWNED_ATTRIBUTES
	}
	if (!configuredWhereItSits(namesFollow)) return NO_PROJECT_OWNED_ATTRIBUTES
	return INSTANCE_CONFIGURATION_OWNED_ATTRIBUTES.get(tagName) ?? NO_PROJECT_OWNED_ATTRIBUTES
}

/**
 * Whether a matched element is configured where it sits, as its names are: an instance of a template (`project`), not
 * a revision of the same file (`source`).
 */
function configuredWhereItSits(namesFollow: NamesFollow): boolean {
	switch (namesFollow) {
		case 'project':
			return true
		case 'source':
			return false
		default:
			return throwDialecteError('ASSERTION_FAILED', {
				detail: `projectOwnedAttributes: unhandled names rule ${String(namesFollow satisfies never)}`,
			})
	}
}
