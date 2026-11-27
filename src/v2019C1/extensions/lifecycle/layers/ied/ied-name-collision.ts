import { DEFAULT_IED_COLLISIONS, IED_NAME_ATTRIBUTE } from './ied-name-collision.constants'

import { throwDialecteError } from '@dialecte/core'

import { SCL_ERRORS } from '@/v2019C1/errors'
import {
	findViolationInScope,
	readConstraintScope,
} from '@/v2019C1/extensions/lifecycle/constraints/find-constraint-violation'
import { findUniqueValueInScope } from '@/v2019C1/extensions/lifecycle/constraints/resolve-unique-value'

import type {
	AssertIedNameFreeParams,
	WithNameClaimParams,
	IedNameClaim,
	IedNameClaimParams,
	ReadIedNameParams,
	ResolveIedCollisionsParams,
} from './ied-name-collision.types'
import type { Config } from '@/v2019C1/config'
import type { IedCollisions } from '@/v2019C1/extensions/lifecycle/contract.types'
import type { ReportInstance } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/** What a first placement does with a taken name: the consumer's choice, else the default of the identity it places with. */
export function resolveIedCollisions(params: ResolveIedCollisionsParams): IedCollisions {
	return params.collisions ?? DEFAULT_IED_COLLISIONS[params.placementIdentity]
}

/**
 * Whether another IED under the project root holds a name, and the name numbering would write instead (the one rule
 * a numbered placement follows): one read of the root's IEDs.
 */
export async function readIedNameClaim(
	query: Core.Query<Config>,
	params: IedNameClaimParams,
): Promise<IedNameClaim> {
	const { anchor, name, excludeId } = params
	const scope = await readConstraintScope(query, { parentRef: anchor, childTag: 'IED' })
	const candidate = { [IED_NAME_ATTRIBUTE]: name }
	const violation = findViolationInScope({ scope, candidate, excludeId })
	if (!violation) return { taken: false, proposal: name }
	const proposal = findUniqueValueInScope({
		scope,
		parentRef: anchor,
		childTag: 'IED',
		candidate,
		attr: IED_NAME_ATTRIBUTE,
		excludeId,
	})
	return { taken: true, proposal }
}

/** Refuse, before anything is written, a name another IED under the project root holds (`IED_NAME_TAKEN`). */
export async function assertIedNameFree(
	query: Core.Query<Config>,
	params: AssertIedNameFreeParams,
): Promise<void> {
	const { taken } = await readIedNameClaim(query, params)
	if (!taken) return
	throwDialecteError(SCL_ERRORS.IED_NAME_TAKEN, {
		meta: { name: params.name },
		detail: `the IED name "${params.name}" is held by another IED of the project`,
	})
}

/** The name an IED is placed under: the one the consumer chose, else the source IED's. */
export async function readPlacedIedName(params: ReadIedNameParams): Promise<string> {
	if (params.chosen) return params.chosen
	const name = await params.sourceQuery.getAttribute(params.iedRef, { name: IED_NAME_ATTRIBUTE })
	return name ?? ''
}

/**
 * The report instance of a first placement, its IED group waiting for a name (`requiresDecision: 'name-taken'`,
 * `needsName` with the name numbering would write) when the placement refuses a taken name and the project holds the
 * source IED's; else as it is.
 */
export async function withNameClaim(
	query: Core.Query<Config>,
	params: WithNameClaimParams,
): Promise<ReportInstance> {
	const { reportInstance, sourceQuery, iedRef, anchor } = params
	const collisions = resolveIedCollisions(params)
	if (collisions !== 'refuse') return reportInstance
	const name = await readPlacedIedName({ sourceQuery, iedRef })
	const { taken, proposal } = await readIedNameClaim(query, { anchor, name })
	if (!taken) return reportInstance
	return {
		...reportInstance,
		groups: reportInstance.groups.map(function askName(group) {
			if (group.primary.tagName !== 'IED') return group
			return { ...group, requiresDecision: 'name-taken', needsName: { taken: name, proposal } }
		}),
	}
}
