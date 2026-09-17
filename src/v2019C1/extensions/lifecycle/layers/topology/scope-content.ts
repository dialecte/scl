import { collectComposedFunctionUuids } from '@/v2019C1/extensions/lifecycle/instance'

import type { TopologyReconcilables } from './scope-content.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type * as Core from '@dialecte/core'

/** Applications whose structural ancestry includes `scopeRef` (Substation / VoltageLevel / Bay). */
export async function applicationsUnderScope(
	query: Core.Query<Config>,
	scopeRef: Scl.Ref<TopologyStructuralTag>,
): Promise<Scl.Ref<'Application'>[]> {
	const applications = await query.getRecordsByTagName('Application')

	const inScope: Scl.Ref<'Application'>[] = []
	for (const application of applications) {
		const ancestors = await query.findAncestors(application, { stopAtTagName: 'Substation' })
		if (ancestors.some((ancestor) => ancestor.id === scopeRef.id)) {
			inScope.push({ tagName: 'Application', id: application.id })
		}
	}
	return inScope
}

/** Top-level Functions whose structural ancestry includes `scopeRef`. */
export async function functionsUnderScope(
	query: Core.Query<Config>,
	scopeRef: Scl.Ref<TopologyStructuralTag>,
): Promise<Scl.Ref<'Function'>[]> {
	const functions = await query.getRecordsByTagName('Function')

	const inScope: Scl.Ref<'Function'>[] = []
	for (const fn of functions) {
		const ancestors = await query.findAncestors(fn, { stopAtTagName: 'Substation' })
		if (ancestors.some((ancestor) => ancestor.id === scopeRef.id)) {
			inScope.push({ tagName: 'Function', id: fn.id })
		}
	}
	return inScope
}

/**
 * The reconcilable primaries of a topology scope: its Applications, and the Functions NOT
 * composed by any of them (a composed Function is reconciled through its Application's cascade).
 * Shared by `report.ssd` and `update.ssd` so both walk the same primary set.
 */
export async function resolveTopologyReconcilables(
	query: Core.Query<Config>,
	scopeRef: Scl.Ref<TopologyStructuralTag>,
): Promise<TopologyReconcilables> {
	const applications = await applicationsUnderScope(query, scopeRef)

	const composedUuids = new Set<string>()
	for (const application of applications) {
		for (const uuid of await collectComposedFunctionUuids(query, application)) {
			composedUuids.add(uuid)
		}
	}

	const standaloneFunctions: Scl.Ref<'Function'>[] = []
	for (const functionRef of await functionsUnderScope(query, scopeRef)) {
		const { uuid } = await query.getAttributes(functionRef)
		if (uuid && composedUuids.has(uuid)) continue
		standaloneFunctions.push(functionRef)
	}

	return { applications, standaloneFunctions }
}
