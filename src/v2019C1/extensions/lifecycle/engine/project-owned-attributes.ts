import {
	BOUND_INPUT_OWNED_ATTRIBUTES,
	CONF_REV_ONLY_RISES,
	BOUND_LNODE_KEEPING_ITS_TYPE,
	BOUND_LNODE_OWNED_ATTRIBUTES,
	INSTANCE_CONFIGURATION_OWNED_ATTRIBUTES,
	NO_PROJECT_OWNED_ATTRIBUTES,
	SPECIFIED_ON_IED_OWNED_ATTRIBUTES,
} from './project-owned-attributes.constants'

import { throwDialecteError } from '@dialecte/core'

import { SPECIFIED_IED_NAME_ATTRIBUTE } from '@/v2019C1/constants/lnode-spec-naming'
import { isAssignedToIed } from '@/v2019C1/extensions/data-model/naming/lnode-naming'
import { CONF_REV_CONTROL_TAGS } from '@/v2019C1/extensions/lifecycle/layers/ied/bump-data-set-conf-revs.constants'

import type { ProjectOwnedAttributes } from './project-owned-attributes.types'
import type { BoundLogicalNodeTypes } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { NamesFollow } from '@/v2019C1/extensions/lifecycle/scenario-policy.types'

/**
 * The attributes of a project element a template neither compares into the decisions nor writes, whatever it holds,
 * each difference still listed as kept:
 * - an LNode bound to an IED keeps where it is implemented (its specification is its `LNodeSpecNaming`, compared as a
 *   child), in every scenario; its type follows the template's, unless the consumer keeps it
 *   (`boundLogicalNodeTypes: 'keep'`): then a type change is listed as kept; the naming specifying it on an IED
 *   names the IED and logical device the commit writes (`SPECIFIED_ON_IED_OWNED_ATTRIBUTES`);
 * - a control block's configuration revision only rises: a template's lower than the project's is listed as kept;
 * - an instance of a template keeps what it configures where it sits (`INSTANCE_CONFIGURATION_OWNED_ATTRIBUTES`: a
 *   behaviour description's file, a variable's value; `BOUND_INPUT_OWNED_ATTRIBUTES`: the source an input or output
 *   of an IED is bound to) — when its names are the project's (`namesFollow: 'project'`); a fork writes the newer
 *   revision's, as it does its names.
 *
 * Read from the project element's own attributes, so the report and the apply decide alike.
 */
export function projectOwnedAttributes(params: {
	tagName: string
	instanceAttributes: Readonly<Record<string, string | undefined>>
	/** The template element's attributes: a revision the template gives lower than the project's is not written. */
	sourceAttributes?: Readonly<Record<string, string | undefined>>
	namesFollow: NamesFollow
	/** Whether a bound LNode takes the type the template gives it. Default: `follow`. */
	boundLogicalNodeTypes?: BoundLogicalNodeTypes
}): ProjectOwnedAttributes {
	const { tagName, instanceAttributes, namesFollow } = params
	if (
		CONF_REV_CONTROL_TAGS.has(tagName) &&
		isLowerRevision({
			template: params.sourceAttributes?.confRev,
			project: instanceAttributes.confRev,
		})
	)
		return CONF_REV_ONLY_RISES
	if (tagName === 'LNode') {
		if (!isAssignedToIed({ iedName: instanceAttributes.iedName }))
			return NO_PROJECT_OWNED_ATTRIBUTES
		return keepsItsType(params.boundLogicalNodeTypes ?? 'follow')
			? BOUND_LNODE_KEEPING_ITS_TYPE
			: BOUND_LNODE_OWNED_ATTRIBUTES
	}
	if (
		tagName === 'LNodeSpecNaming' &&
		isAssignedToIed({ iedName: instanceAttributes[SPECIFIED_IED_NAME_ATTRIBUTE] })
	)
		return SPECIFIED_ON_IED_OWNED_ATTRIBUTES
	if (!configuredWhereItSits(namesFollow)) return NO_PROJECT_OWNED_ATTRIBUTES
	const boundInput = BOUND_INPUT_OWNED_ATTRIBUTES.get(tagName)
	if (boundInput && isBound({ owned: boundInput, instanceAttributes })) return boundInput
	return INSTANCE_CONFIGURATION_OWNED_ATTRIBUTES.get(tagName) ?? NO_PROJECT_OWNED_ATTRIBUTES
}

/** Whether an input or output of the project names a source: any of its source attributes written. */
function isBound(params: {
	owned: ProjectOwnedAttributes
	instanceAttributes: Readonly<Record<string, string | undefined>>
}): boolean {
	return [...params.owned.attributes].some((name) => Boolean(params.instanceAttributes[name]))
}

/** Whether a template's configuration revision is below the project's (both unsigned counters). */
function isLowerRevision(params: {
	template: string | undefined
	project: string | undefined
}): boolean {
	const { template, project } = params
	if (!template || !project || !/^\d+$/.test(template) || !/^\d+$/.test(project)) return false
	return Number(template) < Number(project)
}

/** Whether a bound LNode keeps the type it holds against a template: when the consumer says so. */
function keepsItsType(boundLogicalNodeTypes: BoundLogicalNodeTypes): boolean {
	switch (boundLogicalNodeTypes) {
		case 'keep':
			return true
		case 'follow':
			return false
		default:
			return throwDialecteError('ASSERTION_FAILED', {
				detail: `projectOwnedAttributes: unhandled type rule ${String(boundLogicalNodeTypes satisfies never)}`,
			})
	}
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
