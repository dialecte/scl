import { planBuild, serverOf } from '../build/plan-build'
import { readBuildInput } from '../build/read-build-input'
import { rebuildWritesOf } from './plan-rebuild'

import type { IedBuildPlan, PlanIedParams } from './plan-ied.types'
import type { RebuildWrites } from './plan-rebuild.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * What building the data model of a specification IED from these logical nodes would create, bind, leave out or
 * refuse, without writing: the plan `tx.specification.buildIed` writes, values (`values`, `valuesLeftOut`) included. Every refusal is listed in `refusals`; the
 * values the caller's `openValues` rules gave are listed in `openValuesUsed`. A fixed number of reads, whatever the
 * number of logical nodes; nothing is kept after the call.
 *
 * Refuses with `ELEMENT_NOT_FOUND` when the document holds no such IED or LNode.
 *
 * @intent what building an S-IED from these logical nodes would create
 *
 * @example
 * const plan = await doc.query.specification.planIed({ ied, lnodes, openValues: { lnType: sameClassInTargetIed } })
 * plan.refusals // → [] when buildIed would write plan.lDevices, plan.logicalNodes and plan.added
 */
export async function planIed(
	query: Core.Query<Config>,
	params: PlanIedParams,
): Promise<IedBuildPlan> {
	const { plan } = await planWithServer(query, params)
	return plan
}

/**
 * The plan, the server it is written under (absent when the plan refuses the target), and the types it uses that only
 * the context document holds.
 *
 * @internal
 */
export async function planWithServer(
	query: Core.Query<Config>,
	params: PlanIedParams,
): Promise<{
	plan: IedBuildPlan
	server?: Scl.Ref<'Server'>
	contextTypeIds: string[]
	rebuildWrites: RebuildWrites
}> {
	const input = await readBuildInput(query, params)
	const options = {
		...(params.server && { server: params.server }),
		prefixFromLeafSubFunction: params.prefixFromLeafSubFunction ?? false,
		openValues: params.openValues ?? {},
		excludeFunctionalConstraints: params.excludeFunctionalConstraints ?? [],
		ldNameAlsoFits: params.ldNameAlsoFits ?? [],
		rederiveLDevices: params.rederiveLDevices ?? false,
	}
	const server = serverOf({ input, options })
	const plan = planBuild({ input, options })
	const contextOnly = new Set(
		input.types.filter((type) => !type.inTargetDocument).map((type) => type.id),
	)
	const used = [
		...plan.logicalNodes.filter((logicalNode) => !logicalNode.existing),
		...plan.added,
	].map((planned) => planned.lnType)
	const contextTypeIds = [...new Set(used.filter((id) => contextOnly.has(id)))]
	const rebuildWrites = rebuildWritesOf({
		input,
		report: plan.rebuild,
		logicalNodes: plan.logicalNodes,
	})
	return { plan, ...(server && { server }), contextTypeIds, rebuildWrites }
}
