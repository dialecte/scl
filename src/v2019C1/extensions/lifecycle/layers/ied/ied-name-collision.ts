import {
	DEFAULT_IED_COLLISIONS,
	FIRST_NUMBER_SUFFIX,
	IED_NAME_ATTRIBUTE,
	IED_NAME_TYPE,
} from './ied-name-collision.constants'

import { throwDialecteError } from '@dialecte/core'
import { validateValue } from '@dialecte/core/utils'

import { TEMPLATE_NAME } from '@/v2019C1/constants/naming'
import { SCL_ERRORS } from '@/v2019C1/errors'
import {
	findViolationInScope,
	readConstraintScope,
} from '@/v2019C1/extensions/lifecycle/constraints/find-constraint-violation'
import { findUniqueValueInScope } from '@/v2019C1/extensions/lifecycle/constraints/resolve-unique-value'

import type {
	AssertIedNameFreeParams,
	AskedName,
	AskedNameParams,
	AssertPlacedIedNameParams,
	WithNameClaimParams,
	IedNameClaim,
	IedNameClaimParams,
	ReadIedNameParams,
	RefuseIedNameParams,
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

/**
 * Refuse, before anything is written, a name the IED cannot be placed under: a name the consumer chose that the IED name
 * type refuses (`IED_NAME_INVALID`: empty, not a name, the reserved `None`, a pattern it breaks); then, when the
 * placement refuses a taken name, a name another IED of the project holds (`IED_NAME_TAKEN`), then the type name
 * `TEMPLATE`, an IED type not bound to a place in the project (`IED_NAME_INVALID`, `issue: 'template'`).
 */
export async function assertPlacedIedName(
	query: Core.Query<Config>,
	params: AssertPlacedIedNameParams,
): Promise<void> {
	const { anchor, name, chosen, collisions } = params
	const issue = chosen ? validateValue({ value: name, type: IED_NAME_TYPE }) : undefined
	if (issue) refuseIedName({ name, issue: issue.reason })
	if (collisions !== 'refuse') return
	await assertIedNameFree(query, { anchor, name })
	if (name === TEMPLATE_NAME) refuseIedName({ name, issue: 'template' })
}

/** Refuse a name no placed IED may take, saying why: the step of the IED name type that refused it, or `template`. */
function refuseIedName(params: RefuseIedNameParams): never {
	const { name, issue } = params
	return throwDialecteError(SCL_ERRORS.IED_NAME_INVALID, {
		meta: { name, issue },
		detail:
			issue === 'template'
				? `the IED is placed under the type name "${name}": choose the name it takes in the project`
				: `"${name}" is no IED name (${issue})`,
	})
}

/** The name an IED is placed under: the one the consumer chose, else the source IED's. */
export async function readPlacedIedName(params: ReadIedNameParams): Promise<string> {
	if (params.chosen) return params.chosen
	const name = await params.sourceQuery.getAttribute(params.iedRef, { name: IED_NAME_ATTRIBUTE })
	return name ?? ''
}

/**
 * The report instance of a first placement, its IED group waiting for a name when the placement refuses a taken name
 * and the project holds the source IED's (`requiresDecision: 'name-taken'`, `needsName` with the name numbering would
 * write), or the source IED is named `TEMPLATE` (`'name-template'`, the first numbered name free proposed); else as it is.
 */
export async function withNameClaim(
	query: Core.Query<Config>,
	params: WithNameClaimParams,
): Promise<ReportInstance> {
	const { reportInstance, sourceQuery, iedRef, anchor } = params
	const collisions = resolveIedCollisions(params)
	if (collisions !== 'refuse') return reportInstance
	const name = await readPlacedIedName({ sourceQuery, iedRef })
	const claim = await readIedNameClaim(query, { anchor, name })
	const asked = await askedName(query, { anchor, name, claim })
	if (!asked) return reportInstance
	return {
		...reportInstance,
		groups: reportInstance.groups.map(function askName(group) {
			if (group.primary.tagName !== 'IED') return group
			return {
				...group,
				requiresDecision: asked.reason,
				needsName: { taken: name, proposal: asked.proposal },
			}
		}),
	}
}

/**
 * Why a placement refusing a taken name asks for one, and the name proposed: the name taken (numbering's proposal), or
 * the type name `TEMPLATE` (the first numbered name free); undefined when the name is free and not `TEMPLATE`.
 */
async function askedName(
	query: Core.Query<Config>,
	params: AskedNameParams,
): Promise<AskedName | undefined> {
	const { anchor, name, claim } = params
	if (claim.taken) return { reason: 'name-taken', proposal: claim.proposal }
	if (name !== TEMPLATE_NAME) return undefined
	const numbered = await readIedNameClaim(query, { anchor, name: `${name}${FIRST_NUMBER_SUFFIX}` })
	return { reason: 'name-template', proposal: numbered.proposal }
}
